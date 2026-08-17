import React, { useMemo } from 'react';
// PHASE 4b — on the shared Modal shell. This modal had no Escape, no role, no focus
// trap, no focus return and no scroll lock, and it did not portal; all six come from
// the shell now. Its content below is untouched.
import { Modal } from '@/components/primitives';
import { dayKey, fmtVal, valueField, tradeOutcome } from '../../lib/metrics.js';
import { slug, fmtTime } from '../../lib/constants.js';

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Lists the trades closed on a given day. `dayKeyStr` is YYYY-MM-DD.
export default function DayTradesModal({ dayKeyStr, trades, onClose, unit = 'R', beRounding = false }) {
  const field = valueField(unit);
  const list = useMemo(() => {
    if (!dayKeyStr) return [];
    return trades
      .filter((t) => t[field] != null && dayKey(new Date(t.close_time)) === dayKeyStr)
      .sort((a, b) => new Date(a.close_time) - new Date(b.close_time));
  }, [dayKeyStr, trades, field]);

  if (!dayKeyStr) return null;
  const d = new Date(`${dayKeyStr}T00:00:00`);
  const totalR = list.reduce((a, t) => a + Number(t[field]), 0);
  const title = `${WD[d.getDay()]}, ${d.getDate()} ${MO[d.getMonth()]} ${d.getFullYear()}`;

  return (
    <Modal onClose={onClose} className="day-modal" label={title}>
        <header>
          <h2>{title}</h2>
          <button className="x" onClick={onClose}>×</button>
        </header>

        <div className="day-modal-summary">
          <span>{list.length} trade{list.length === 1 ? '' : 's'}</span>
          <span className={totalR > 0 ? 'win' : totalR < 0 ? 'loss' : ''}>{fmtVal(totalR, unit)}</span>
        </div>

        {list.length === 0 ? (
          <p className="muted">No trades on this day.</p>
        ) : (
          <table className="day-table">
            <thead><tr><th>Time</th><th>Pair</th><th>Setup</th><th>Session</th><th className="num">{unit === 'USD' ? 'P&L' : 'R'}</th></tr></thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id}>
                  <td>{fmtTime(t.close_time)}</td>
                  <td><span className={`pill pair-${slug(t.symbol_base || t.symbol)}`}>{t.symbol_base || t.symbol}</span></td>
                  <td>{t.setup ? <span className={`pill setup-${slug(t.setup)}`}>{t.setup}</span> : <span className="muted">—</span>}</td>
                  <td>{t.session ? <span className={`pill session-${slug(t.session)}`}>{t.session}</span> : <span className="muted">—</span>}</td>
                  <td className={`num ${{ win: 'cell-win', loss: 'cell-loss', be: 'cell-be' }[tradeOutcome(t, unit, beRounding)] || ''}`}>{fmtVal(t[field], unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </Modal>
  );
}
