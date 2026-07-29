// The trade log's COLUMN SPEC — what columns exist, what they're called, which
// ones the default view shows, and in what order they render.
//
// Metadata only, deliberately: the cell renderers are JSX and live in
// TradesTable.jsx, keyed by these ids. Splitting them means the spec is plain data
// that can be asserted directly (test/trade-log-view.test.js) instead of grepped
// out of a component, and Trade Settings can build its show/hide list without
// knowing anything about how a cell draws itself.
//
// ORDER HERE IS RENDER ORDER. The eleven `defaultOn` columns are sequenced so the
// default view reads exactly:
//   Date & Time · Type · Symbol · Entry · Exit · Volume · Setup · Probability ·
//   Net P&L · Commission · Notes
// The optional ones are slotted beside the data they belong with — duration after
// the timestamp, the pip/R measures after volume, Status just before the P&L it
// describes — so switching one on in Trade Settings drops it somewhere sensible
// rather than at the end of the row.
//
// `align: 'center'` is for quantity columns (lots): short fixed-width numbers whose
// right edge reads as ragged. Prices and money keep the default right alignment.
export const TRADE_COLUMNS = [
  { id: 'datetime', label: 'Date & Time', defaultOn: true },
  { id: 'duration', label: 'Duration', defaultOn: false },
  { id: 'type', label: 'Type', defaultOn: true },
  { id: 'session', label: 'Session', defaultOn: false },
  { id: 'pair', label: 'Symbol', defaultOn: true },
  { id: 'entry_price', label: 'Entry', defaultOn: true },
  { id: 'exit_price', label: 'Exit', defaultOn: true },
  { id: 'volume', label: 'Volume', defaultOn: true, align: 'center' },
  { id: 'sl', label: 'SL Size', defaultOn: false },
  { id: 'mfe', label: 'MFE', defaultOn: false },
  { id: 'maxr', label: 'Max R', defaultOn: false },
  { id: 'setup', label: 'Setup', defaultOn: true },
  { id: 'probability', label: 'Probability', defaultOn: true },
  { id: 'mtf', label: 'MTF Phase', defaultOn: false },
  { id: 'status', label: 'Status', defaultOn: false },
  // Label is fixed in both display units, matching the Net P&L KPI card above the
  // table; only the VALUE switches between real $ (pnl_money) and Fixed R.
  { id: 'result', label: 'Net P&L', defaultOn: true },
  { id: 'commission', label: 'Commission', defaultOn: true },
  { id: 'm15', label: 'M15', defaultOn: false },
  { id: 'h1', label: 'H1', defaultOn: false },
  { id: 'h4', label: 'H4', defaultOn: false },
  // Id stays `comments` — it names the field the note is stored in, and renaming it
  // would silently discard anyone's saved show/hide choice for this column.
  { id: 'comments', label: 'Notes', defaultOn: true },
];

// Effective visibility: an explicit user override wins, else the column default.
export const colVisible = (overrides, col) => overrides?.[col.id] ?? col.defaultOn;

export const visibleColumns = (overrides = {}) => TRADE_COLUMNS.filter((c) => colVisible(overrides, c));
