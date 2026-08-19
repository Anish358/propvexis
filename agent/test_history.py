"""Unit tests for the deal-history port. Stdlib only, so they run anywhere:

    python -m unittest discover -s agent

The MT5 package is Windows-only, which is exactly why history.py imports none of
it — this logic is the part most likely to be subtly wrong, so it must be testable
on the machine the code is written on.
"""

import unittest

from history import (
    DEAL_ENTRY_IN,
    DEAL_ENTRY_OUT,
    DEAL_ENTRY_OUT_BY,
    DEAL_TYPE_BALANCE,
    DEAL_TYPE_BUY,
    DEAL_TYPE_SELL,
    build_trade,
    group_positions,
    iso_utc,
    mfe_price,
    payouts_from_deals,
    to_payload,
)

OPEN_T = 1_750_000_000
CLOSE_T = OPEN_T + 3600


def deal(**kw):
    base = dict(ticket=1, position_id=100, time=OPEN_T, type=DEAL_TYPE_BUY,
                entry=DEAL_ENTRY_IN, price=1.1, volume=1.0, symbol='EURUSD',
                commission=0.0, swap=0.0, profit=0.0, comment='')
    base.update(kw)
    return base


IN_DEAL = deal(ticket=1, entry=DEAL_ENTRY_IN, price=1.1000, commission=-3.0)
OUT_DEAL = deal(ticket=2, entry=DEAL_ENTRY_OUT, time=CLOSE_T, price=1.1050,
                type=DEAL_TYPE_SELL, swap=-0.5, profit=50.0)


class TestGrouping(unittest.TestCase):
    def test_balance_operations_are_not_positions(self):
        deals = [IN_DEAL, OUT_DEAL,
                 deal(ticket=9, position_id=0, type=DEAL_TYPE_BALANCE, profit=-500.0)]
        self.assertEqual(list(group_positions(deals)), [100])

    def test_open_positions_are_skipped(self):
        # A position with no closing deal is still live; the journal records
        # closed trades only, and an "R" for a live trade would be fiction.
        self.assertEqual(group_positions([IN_DEAL]), {})

    def test_out_by_counts_as_a_close(self):
        closed = deal(ticket=3, entry=DEAL_ENTRY_OUT_BY, time=CLOSE_T, price=1.106)
        self.assertIn(100, group_positions([IN_DEAL, closed]))


class TestBuildTrade(unittest.TestCase):
    def test_reads_both_legs(self):
        t = build_trade(100, [IN_DEAL, OUT_DEAL])
        self.assertEqual(t['mt5_ticket'], 100)
        self.assertEqual(t['direction'], 'buy')
        self.assertEqual(t['entry_price'], 1.1)
        self.assertEqual(t['exit_price'], 1.105)
        self.assertEqual(t['_open_epoch'], OPEN_T)
        self.assertEqual(t['_close_epoch'], CLOSE_T)

    def test_commission_and_swap_accumulate_across_both_deals(self):
        # A broker may put either on either leg; the EA sums over every deal.
        t = build_trade(100, [IN_DEAL, OUT_DEAL])
        self.assertEqual(t['commission'], -3.5)          # -3.00 commission + -0.50 swap
        self.assertEqual(t['pnl_money'], 46.5)           # 50.00 + -0.50 + -3.00

    def test_direction_comes_from_the_entry_deal_not_the_exit(self):
        # The closing deal of a BUY is a sell; reading direction off it would
        # invert every trade in the journal.
        self.assertEqual(build_trade(100, [IN_DEAL, OUT_DEAL])['direction'], 'buy')
        sell_in = deal(ticket=1, type=DEAL_TYPE_SELL, entry=DEAL_ENTRY_IN)
        sell_out = deal(ticket=2, type=DEAL_TYPE_BUY, entry=DEAL_ENTRY_OUT,
                        time=CLOSE_T, price=1.09)
        self.assertEqual(build_trade(100, [sell_in, sell_out])['direction'], 'sell')

    def test_sl_and_tp_come_from_orders_first_non_zero_wins(self):
        orders = [dict(sl=0.0, tp=0.0), dict(sl=1.0950, tp=1.1100), dict(sl=1.0, tp=1.2)]
        t = build_trade(100, [IN_DEAL, OUT_DEAL], orders=orders)
        self.assertEqual(t['sl_price'], 1.095)
        self.assertEqual(t['tp_price'], 1.11)

    def test_absent_sl_is_null_not_zero(self):
        # 0.0 would be a real price to the backend and would derive a nonsense R.
        t = build_trade(100, [IN_DEAL, OUT_DEAL], orders=[dict(sl=0.0, tp=0.0)])
        self.assertIsNone(t['sl_price'])
        self.assertIsNone(t['tp_price'])

    def test_incomplete_positions_are_refused(self):
        self.assertIsNone(build_trade(100, [IN_DEAL]))
        no_symbol = [deal(symbol=''), deal(ticket=2, entry=DEAL_ENTRY_OUT, symbol='',
                                           time=CLOSE_T, price=1.105)]
        self.assertIsNone(build_trade(100, no_symbol))

    def test_accepts_namedtuple_style_records(self):
        # MT5 returns namedtuples, tests pass dicts; both must work.
        class Rec:
            def __init__(self, **kw):
                self.__dict__.update(kw)
        recs = [Rec(**IN_DEAL), Rec(**OUT_DEAL)]
        self.assertEqual(build_trade(100, recs)['exit_price'], 1.105)


class TestTime(unittest.TestCase):
    def test_offset_is_subtracted(self):
        # A GMT+2 broker stamping 12:00 means 10:00 UTC.
        self.assertEqual(iso_utc(1_750_000_000, 7200), '2025-06-15T13:06:40Z')
        self.assertEqual(iso_utc(1_750_000_000, 0), '2025-06-15T15:06:40Z')

    def test_unknown_offset_raises_rather_than_guessing(self):
        with self.assertRaises(ValueError):
            iso_utc(1_750_000_000, None)


class TestRecordShapes(unittest.TestCase):
    """Rates come back as a numpy structured array, not namedtuples."""

    def test_key_only_records_are_read(self):
        # numpy.void supports rec['high'] and NOT rec.high. Reading it with getattr
        # returned the 0.0 default for every bar, which turned a sell's MFE into the
        # whole entry price (11577.1 pips on a real trade). Simulate that shape.
        class KeyOnly:
            def __init__(self, **kw):
                self._d = kw

            def __getitem__(self, k):
                return self._d[k]

        rates = [KeyOnly(high=1.1020, low=1.0990), KeyOnly(high=1.1070, low=1.1010)]
        self.assertAlmostEqual(mfe_price('buy', 1.1, rates), 0.007)
        self.assertAlmostEqual(mfe_price('sell', 1.1, rates), 0.001)

    def test_a_sell_never_reports_the_entry_price_as_its_excursion(self):
        # The exact regression: a missing low must not make `best` zero.
        class KeyOnly:
            def __init__(self, **kw):
                self._d = kw

            def __getitem__(self, k):
                return self._d[k]

        mfe = mfe_price('sell', 1.15771, [KeyOnly(high=1.15790, low=1.15760)])
        self.assertLess(mfe, 0.001, 'MFE must be an excursion, not a price')


class TestMfe(unittest.TestCase):
    def test_buy_takes_the_highest_high(self):
        rates = [dict(high=1.102, low=1.099), dict(high=1.107, low=1.101)]
        self.assertAlmostEqual(mfe_price('buy', 1.1, rates), 0.007)

    def test_sell_takes_the_lowest_low(self):
        rates = [dict(high=1.102, low=1.0965), dict(high=1.101, low=1.098)]
        self.assertAlmostEqual(mfe_price('sell', 1.1, rates), 0.0035)

    def test_never_negative(self):
        # A trade that never went green has MFE 0, not a negative excursion.
        rates = [dict(high=1.098, low=1.0)]
        self.assertEqual(mfe_price('buy', 1.1, rates), 0.0)

    def test_no_bars_means_unknown_not_zero(self):
        # None makes to_payload omit mfe_price, matching the EA's -1 sentinel;
        # 0.0 would assert the trade never moved in the trader's favour.
        self.assertIsNone(mfe_price('buy', 1.1, []))


class TestPayload(unittest.TestCase):
    def test_carries_the_account_snapshot_and_mfe(self):
        t = build_trade(100, [IN_DEAL, OUT_DEAL])
        body = to_payload(t, 314943467, 7200,
                          account=dict(balance=50450.0, equity=50400.0, currency='USD'),
                          mfe=0.006)
        self.assertEqual(body['account_id'], 314943467)
        self.assertEqual(body['account_balance'], 50450.0)
        self.assertEqual(body['account_currency'], 'USD')
        self.assertEqual(body['mfe_price'], 0.006)
        self.assertEqual(body['open_time'], '2025-06-15T13:06:40Z')

    def test_internal_fields_never_reach_the_wire(self):
        body = to_payload(build_trade(100, [IN_DEAL, OUT_DEAL]), 1, 0)
        self.assertFalse([k for k in body if k.startswith('_')])

    def test_mfe_is_omitted_when_unknown(self):
        body = to_payload(build_trade(100, [IN_DEAL, OUT_DEAL]), 1, 0, mfe=None)
        self.assertNotIn('mfe_price', body)


class TestPayouts(unittest.TestCase):
    def test_only_negative_balance_operations(self):
        deals = [
            deal(ticket=7, type=DEAL_TYPE_BALANCE, profit=-500.0, comment='payout'),
            deal(ticket=8, type=DEAL_TYPE_BALANCE, profit=25000.0, comment='deposit'),
            IN_DEAL,
        ]
        got = payouts_from_deals(deals, 314943467, 0)
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0]['amount'], 500.0)       # positive gross
        self.assertEqual(got[0]['deal_ticket'], '7')

    def test_zero_is_not_a_payout(self):
        self.assertEqual(payouts_from_deals(
            [deal(ticket=9, type=DEAL_TYPE_BALANCE, profit=0.0)], 1, 0), [])


if __name__ == '__main__':
    unittest.main()
