// The CSV import SEQUENCE, shared by the two surfaces that run it: the modal
// reached from the trade log, and the Add Account wizard's upload step (spec §8.3,
// "extracted out of ImportTradesModal and shared, not copied").
//
// What is shared is the state machine and the guards. The MARKUP is not: a dialog
// over the trade log and a full-bleed wizard step are different layouts, and
// forcing one component to be both is how a modal ends up rendered inside a page.
//
// JSX-free and React-free so node:test can import it — CI installs backend
// dependencies only.

/**
 * The server's own limit, mirrored (src/routes/trades.js: the import route sets
 * `bodyLimit: 12 * 1024 * 1024` because the CSV text rides inside the JSON body).
 * test/csv-import-flow.test.js reads that literal out of the route, so raising one
 * without the other fails.
 */
export const IMPORT_BODY_LIMIT = 12 * 1024 * 1024;

// JSON escaping inflates the text: every quote, backslash, newline and non-ASCII
// character grows. 20% is comfortably above what a broker statement's punctuation
// costs and well below a factor that would refuse a legitimate file. Checking at
// the limit itself would still 413 after a long upload, which is the failure this
// margin exists to prevent.
const ESCAPE_HEADROOM = 0.8;
const MB = 1024 * 1024;

/**
 * May a file of this many bytes be sent? A refusal names a size the user can
 * compare against and says what to do about it — refusing a statement without
 * that is a dead end, and this is the last step of a nine-step flow.
 */
export function csvSizeVerdict(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return { ok: true, error: null };
  const max = IMPORT_BODY_LIMIT * ESCAPE_HEADROOM;
  if (n <= max) return { ok: true, error: null };
  const limitMb = Math.floor(max / MB);
  const gotMb = (n / MB).toFixed(1);
  return {
    ok: false,
    error: `That file is ${gotMb} MB and the limit is about ${limitMb} MB. Export a shorter date range, or split the statement and import it in parts.`,
  };
}

export const initialImportState = () => ({
  fileName: '',
  csv: '',
  preview: null,   // the dry-run result
  done: null,      // the confirmed-import result
  error: null,
  busy: false,
});

/**
 * The sequence, as a reducer.
 *
 * `file` clears the previous preview, result and error deliberately: leaving last
 * file's counts beside this file's name is how a user confirms an import of
 * numbers that no longer apply. `error` does NOT clear the loaded CSV, so a retry
 * does not mean choosing the file again. `imported` clears the preview, or a
 * second Import button survives the import it performed.
 *
 * An unrecognised action returns the SAME object rather than a copy, so a stray
 * dispatch cannot drive a re-render loop in a component with an effect keyed on
 * this state.
 */
export function importReducer(state, action) {
  switch (action?.type) {
    case 'file':
      return { ...state, fileName: action.fileName ?? '', csv: action.csv ?? '', preview: null, done: null, error: null };
    case 'busy':
      return { ...state, busy: true, error: null };
    case 'preview':
      return { ...state, preview: action.preview ?? null, busy: false, error: null };
    case 'error':
      return { ...state, error: action.error ?? 'Something went wrong.', busy: false };
    case 'imported':
      return { ...state, done: action.result ?? null, preview: null, busy: false, error: null };
    case 'reset':
      return initialImportState();
    default:
      return state;
  }
}

/** The dry-run counts, every one defaulted, plus whether confirming does anything.
 *  A 0-row import is refused here rather than sent and reported as "imported 0". */
export function previewSummary(preview) {
  const p = preview || {};
  const willImport = Number(p.willImport) || 0;
  return {
    willImport,
    duplicates: Number(p.duplicates) || 0,
    skipped: Number(p.skipped) || 0,
    canImport: willImport > 0,
  };
}
