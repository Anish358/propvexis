// The trade log's COLUMN SPEC — what columns exist, what they're called, which
// ones the default view shows, and in what order they render.
//
// Metadata only, deliberately: the cell renderers are JSX and live in
// TradesTable.jsx, keyed by these ids. Splitting them means the spec is plain data
// that can be asserted directly (test/trade-log-view.test.js) instead of grepped
// out of a component, and Trade Settings can build its show/hide list without
// knowing anything about how a cell draws itself.
//
// ORDER HERE IS RENDER ORDER. The `defaultOn` columns are sequenced so the default
// view reads exactly:
//   ☐ · Date & Time · Symbol · Type · Session · Entry · Exit · Volume · Setup ·
//   Probability · Status · Net P&L · Notes
// The optional ones are slotted beside the data they belong with — duration after
// the timestamp, the pip/R measures after volume, commission after the P&L it
// applies to — so switching one on in Trade Settings drops it somewhere sensible
// rather than at the end of the row.
//
// `fixed: true` means structural rather than data: the row-selection column is part
// of how the table works, so it isn't offered as a show/hide choice.
// `narrow: true` opts out of the equal-width split (see .col-select).
export const TRADE_COLUMNS = [
  { id: 'select', label: '', defaultOn: true, fixed: true, narrow: true },
  { id: 'datetime', label: 'Date & Time', defaultOn: true },
  { id: 'duration', label: 'Duration', defaultOn: false },
  { id: 'pair', label: 'Symbol', defaultOn: true },
  { id: 'type', label: 'Type', defaultOn: true },
  { id: 'session', label: 'Session', defaultOn: true },
  { id: 'entry_price', label: 'Entry', defaultOn: true },
  { id: 'exit_price', label: 'Exit', defaultOn: true },
  { id: 'volume', label: 'Volume', defaultOn: true },
  { id: 'sl', label: 'SL Size', defaultOn: false },
  { id: 'mfe', label: 'MFE', defaultOn: false },
  { id: 'maxr', label: 'Max R', defaultOn: false },
  { id: 'setup', label: 'Setup', defaultOn: true },
  { id: 'probability', label: 'Probability', defaultOn: true },
  // Objective rule adherence for the trade's strategy. Sits with the strategy
  // fields it derives from. Off by default — it only means anything once a
  // strategy actually defines rules.
  { id: 'adherence', label: 'Rules', defaultOn: false },
  { id: 'status', label: 'Status', defaultOn: true },
  // Label is fixed in both display units, matching the Net P&L KPI card above the
  // table; only the VALUE switches between real $ (pnl_money) and Fixed R.
  { id: 'result', label: 'Net P&L', defaultOn: true },
  { id: 'commission', label: 'Commission', defaultOn: false },
  // Id stays `comments` — it names the field the note is stored in, and renaming it
  // would silently discard anyone's saved show/hide choice for this column.
  { id: 'comments', label: 'Notes', defaultOn: true },
];

// Effective visibility: an explicit user override wins, else the column default.
// A `fixed` column has no override — it's not a user choice.
export const colVisible = (overrides, col) => (col.fixed ? true : overrides?.[col.id] ?? col.defaultOn);

export const visibleColumns = (overrides = {}) => TRADE_COLUMNS.filter((c) => colVisible(overrides, c));

// What Trade Settings offers as show/hide toggles — everything except the
// structural columns.
export const settingsColumns = () => TRADE_COLUMNS.filter((c) => !c.fixed);
