// CSV export for the trade log's bulk action.
//
// Exports what's ON SCREEN — the visible columns, in their current order — so the
// file matches the table the user is looking at rather than a fixed schema they'd
// then have to reconcile. Values are the RAW numbers, not the formatted cells: a
// spreadsheet wants 271.89, not "+$271.89".
import { fmtDayShort, fmtTime, fmtDuration } from '../../lib/constants.js';
import { tradeOutcome } from '../../lib/metrics.js';

const OUTCOME_LABEL = { win: 'Win', loss: 'Loss', be: 'BE' };
const ADHERENCE_LABEL = { followed: 'Followed', broken: 'Broke rules' };

// One column id -> one cell value. Mirrors the table's cell renderers, minus the
// presentation: same source field, same unit-dependence, no currency symbols.
export function exportValue(trade, columnId, unit = 'R', beRounding = false) {
  const t = trade || {};
  switch (columnId) {
    case 'datetime': return `${fmtDayShort(t.close_time)} ${fmtTime(t.close_time)}`.trim();
    case 'duration': return fmtDuration(t.open_time, t.close_time) || '';
    case 'pair': return t.symbol_base || t.symbol || '';
    case 'type': return t.direction || '';
    case 'session': return t.session || '';
    case 'entry_price': return t.entry_price;
    case 'exit_price': return t.exit_price;
    case 'volume': return t.volume;
    case 'sl': return t.sl_size_pips;
    case 'mfe': return t.mfe_pips;
    case 'maxr': return t.max_r;
    case 'setup': return t.setup || '';
    case 'probability': return t.probability || '';
    case 'status': return OUTCOME_LABEL[tradeOutcome(t, unit, beRounding)] || '';
    // 'unassessed' and 'norules' export blank for the same reason they render as a
    // dash: neither is a verdict, and "unassessed" in a spreadsheet column of
    // Followed/Broke reads like a third outcome.
    case 'adherence': return ADHERENCE_LABEL[t.adherence?.status] || '';
    // Follows the display unit, like the column it comes from.
    case 'result': return unit === 'USD' ? t.pnl_money : t.fixed_r;
    case 'commission': return t.commission;
    case 'comments': return t.comments || '';
    default: return '';
  }
}

// RFC 4180 quoting: a field containing a comma, quote or newline is wrapped in
// quotes with inner quotes doubled. Trade notes are free text, so this is the
// difference between a valid file and a shifted-column mess.
const escapeCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const csvText = (rows = []) => rows.map((r) => r.map(escapeCell).join(',')).join('\r\n');

// Build the sheet for a set of trades and a set of columns.
export const tradesToCsv = (trades = [], cols = [], unit = 'R', beRounding = false) => csvText([
  cols.map((c) => c.label),
  ...trades.map((t) => cols.map((c) => exportValue(t, c.id, unit, beRounding))),
]);

// Browser-only: hand the text to the user as a file. Same idiom as the Reports
// export — build a blob, click a synthetic link, revoke the URL.
export function downloadCsv(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
