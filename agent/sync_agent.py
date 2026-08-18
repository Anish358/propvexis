"""PropVexis MT5 sync agent — the worker half of the self-hosted terminal farm.

Runs on a Windows box, leases one account at a time from the backend, logs a warm
MT5 terminal into it with the READ-ONLY investor password, reads closed trades out
of history, and posts them to the same ingest endpoints the EA uses.

Why this exists: the EA only runs inside a terminal on the trader's own PC, so
trades taken on the MT5 mobile app never reached the journal.

Run:  python sync_agent.py            (config.json beside this file)
      PROPVEXIS_AGENT_CONFIG=... python sync_agent.py
"""

import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from api import Backend
from history import (
    build_trade,
    group_positions,
    mfe_price,
    payouts_from_deals,
    to_payload,
)
from mt5_session import Mt5Error, Terminal

log = logging.getLogger('propvexis.agent')

HERE = Path(__file__).resolve().parent
VERSION = '1.0'


def load_config():
    path = Path(os.environ.get('PROPVEXIS_AGENT_CONFIG', HERE / 'config.json'))
    # utf-8-sig, not utf-8: Windows PowerShell's Set-Content -Encoding UTF8 writes a
    # BOM, and a plain read_text() then fails with "Expecting value: line 1 column
    # 1" — which reads like a corrupt config rather than an encoding artefact. Any
    # config written on the box will have one, setup.ps1's included.
    cfg = json.loads(path.read_text(encoding='utf-8-sig'))
    for required in ('api_base', 'worker_token', 'worker_id'):
        if not cfg.get(required):
            raise SystemExit(f'config: {required} is required ({path})')
    cfg.setdefault('poll_secs', 30)
    cfg.setdefault('post_delay_ms', 50)
    cfg.setdefault('firms', {})
    cfg.setdefault('default_terminal', r'C:\mt5\default\terminal64.exe')
    return cfg


def terminal_for(job, cfg, cache):
    """The portable install to use for this account's firm.

    Prop white-label servers are often missing from the MetaQuotes list, so each
    firm's own MT5 build (which ships its .srv file) gets its own directory. One
    warm Terminal object per install, kept across jobs.
    """
    firm = job.get('firm_key') or 'default'
    exe = cfg['firms'].get(firm, {}).get('terminal') or cfg['default_terminal']
    if exe not in cache:
        cache[exe] = Terminal(exe, HERE / 'clock-offsets.json')
    return cache[exe]


def iso_to_epoch(value):
    if not value:
        return 0
    text = str(value).replace('Z', '+00:00')
    return int(datetime.fromisoformat(text).astimezone(timezone.utc).timestamp())


def run_job(job, api, cfg, terminals):
    """Sync one account. Raises on failure; the caller reports it."""
    login, server = job['login'], job['server']
    log.info('job %s: account %s on %s (%s)', job['job_id'], login, server, job['reason'])

    term = terminal_for(job, cfg, terminals)
    term.login(login, job['password'], server)

    # Enforcement, not policy: a credential that can trade is a master password.
    # Reporting read_only=False makes the backend delete it.
    if term.trade_allowed():
        log.warning('job %s: credential can TRADE — reporting for deletion', job['job_id'])
        api.result(job['job_id'], ok=False, read_only=False,
                   error='master password supplied')
        return None

    offset = term.server_offset_secs(server)
    if offset is None:
        # Refusing beats guessing: a wrong offset would mislabel every trade's
        # session and bucket trades into the wrong day for drawdown maths.
        raise Mt5Error('server clock not calibrated yet — needs one live tick '
                       '(retry when the market is open)')

    # The window comes from the backend in UTC; MT5 wants server time.
    since_srv = iso_to_epoch(job.get('since')) + offset
    until_srv = int(time.time()) + offset + 60
    deals = term.deals(since_srv, until_srv)
    log.info('job %s: %d deals in window', job['job_id'], len(deals))

    acct = term.account()
    account_snapshot = {
        'balance': acct.balance, 'equity': acct.equity, 'currency': acct.currency,
    }
    delay = cfg['post_delay_ms'] / 1000.0
    stats = {'deals': len(deals), 'trades': 0, 'payouts': 0, 'skipped': 0}

    for position_id, position_deals in sorted(group_positions(deals).items()):
        symbol = next((d.symbol for d in position_deals if getattr(d, 'symbol', '')), '')
        digits = term.digits(symbol) if symbol else 5
        trade = build_trade(position_id, position_deals,
                            term.orders_for_position(position_id), digits)
        if trade is None:
            stats['skipped'] += 1
            continue
        rates = term.m1_range(trade['symbol'], trade['_open_epoch'], trade['_close_epoch'])
        body = to_payload(trade, login, offset, account_snapshot, digits,
                          mfe_price(trade['direction'], trade['entry_price'], rates))
        api.post_trade(job['ingest_token'], body)
        stats['trades'] += 1
        time.sleep(delay)

    for payout in payouts_from_deals(deals, login, offset):
        api.post_payout(job['ingest_token'], payout)
        stats['payouts'] += 1
        time.sleep(delay)

    # A point-in-time balance/equity sample. Coarser than the EA's 5-minute feed —
    # a batch sync cannot do better — but it keeps the balance box and the prop
    # drawdown bands current between syncs.
    api.post_equity(job['ingest_token'], {
        'account_id': int(login),
        'balance': round(float(acct.balance), 2),
        'equity': round(float(acct.equity), 2),
        'currency': acct.currency,
    })

    log.info('job %s: %s', job['job_id'], stats)
    return stats


def main():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s %(levelname)-7s %(name)s  %(message)s',
        handlers=[logging.StreamHandler(sys.stdout),
                  logging.FileHandler(HERE / 'agent.log', encoding='utf-8')])

    cfg = load_config()
    api = Backend(cfg['api_base'], cfg['worker_token'], cfg['worker_id'], VERSION)
    terminals = {}
    log.info('agent %s starting as %s -> %s', VERSION, cfg['worker_id'], cfg['api_base'])

    while True:
        worked = False
        try:
            # The lease call also heartbeats, reclaims dead leases and queues what
            # is due, so this loop is the only scheduler on either side.
            jobs = api.lease(limit=1)
            for job in jobs:
                worked = True
                try:
                    stats = run_job(job, api, cfg, terminals)
                    if stats is not None:
                        api.result(job['job_id'], ok=True, stats=stats)
                except Exception as err:   # noqa: BLE001 - one bad account must not stop the loop
                    log.exception('job %s failed', job.get('job_id'))
                    api.result(job['job_id'], ok=False, error=str(err))
        except Exception:                  # noqa: BLE001 - backend down, network blip
            log.exception('lease cycle failed')

        time.sleep(1 if worked else cfg['poll_secs'])


if __name__ == '__main__':
    main()
