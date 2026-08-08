// One-time correction: enforce fixed_r = realized_reward_pips / sl_size_pips for
// price-derived (source='ea') trades. Fixes rows where a pre-fix SL edit left
// fixed_r out of sync with the (corrected) SL — e.g. SL edited to 9.8 but
// fixed_r still showing the old -3 from the buggy tiny SL.
//
// Only touches source='ea' trades that have entry/exit prices + a positive SL.
// Sheet imports and manual trades are left alone. Idempotent.
import { pool, query } from '../src/platform/db.js';
import { pipSize, round2 } from '../src/domain/trades/derive.js';

const DRY_RUN = process.env.DRY_RUN === '1';

async function main() {
  if (DRY_RUN) console.log('DRY RUN — no changes will be written.\n');
  const { rows } = await query(
    `SELECT id, symbol, symbol_base, direction, entry_price, exit_price, sl_size_pips, fixed_r
       FROM trades
      WHERE source = 'ea'
        AND direction IS NOT NULL
        AND entry_price IS NOT NULL
        AND exit_price IS NOT NULL
        AND sl_size_pips IS NOT NULL AND sl_size_pips > 0`
  );

  let changed = 0;
  for (const t of rows) {
    const pip = pipSize(t.symbol_base || t.symbol);
    if (!pip) continue;
    const reward = t.direction === 'buy' ? t.exit_price - t.entry_price : t.entry_price - t.exit_price;
    const correct = round2((reward / pip) / Number(t.sl_size_pips));
    if (correct == null) continue;
    if (Number(t.fixed_r) !== correct) {
      if (!DRY_RUN) await query('UPDATE trades SET fixed_r = $1 WHERE id = $2', [correct, t.id]);
      console.log(`trade ${t.id} (${t.symbol_base || t.symbol}): fixed_r ${t.fixed_r} -> ${correct}  [SL ${t.sl_size_pips}p]`);
      changed++;
    }
  }
  console.log(`\n${DRY_RUN ? 'would recompute' : 'recomputed'} ${changed} of ${rows.length} EA trade(s).`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end());
