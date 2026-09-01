import React, { useReducer, useState } from 'react';
// PHASE 4b — on the shared Modal shell. This modal had no Escape, no role, no focus
// trap, no focus return and no scroll lock; all five come from the shell now, and the
// hand-rolled portal is gone with it. Its content below is untouched.
import { Modal } from '@/components/primitives';
import { importTrades } from '../../lib/api.js';
import {
  csvSizeVerdict, initialImportState, importReducer, previewSummary,
} from './csvImportFlow.js';

// CSV / statement import. Pick a file → we preview (dry run) which columns were
// detected, warn about anything analytics needs but the file lacks, and show
// how many rows will import / duplicate / skip → confirm to save.
export default function ImportTradesModal({ onClose, onImported, manualAccounts = [], defaultAccountId = '' }) {
  const [state, dispatch] = useReducer(importReducer, undefined, initialImportState);
  // Never '': an import with no account is rejected by the route (migration 0028
  // made trades.account_id NOT NULL), so the select opens on a real account.
  const [accountId, setAccountId] = useState(
    defaultAccountId || String(manualAccounts[0]?.mt5_login ?? ''),
  );
  const { fileName, csv, preview, done, error, busy } = state;
  const counts = previewSummary(preview);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Checked before the read, not after: the CSV rides inside a JSON body at a
    // 12 MB limit and escaping inflates it, so a large statement 413s at the end
    // of a long upload instead of failing here in one line.
    const verdict = csvSizeVerdict(file.size);
    if (!verdict.ok) {
      dispatch({ type: 'file', fileName: file.name, csv: '' });
      dispatch({ type: 'error', error: verdict.error });
      return;
    }
    // Cleared BEFORE the read, not after. During `await file.text()` the component
    // stays mounted, so leaving the previous file's preview in place leaves
    // "Import N trades" live — and a click there would import the PREVIOUS csv
    // while the user believes they imported the one they just chose.
    dispatch({ type: 'file', fileName: file.name, csv: '' });
    const text = await file.text();
    dispatch({ type: 'file', fileName: file.name, csv: text });
    dispatch({ type: 'busy' });
    try {
      dispatch({ type: 'preview', preview: await importTrades(text, true, accountId) });
    } catch (err) {
      dispatch({ type: 'error', error: err.message });
    }
  }

  // Changing the target account changes the dedupe scope — re-preview if a file
  // is already loaded so the duplicate/import counts stay accurate.
  async function onAccountChange(e) {
    const next = e.target.value;
    setAccountId(next);
    if (!csv || done) return;
    dispatch({ type: 'busy' });
    try {
      dispatch({ type: 'preview', preview: await importTrades(csv, true, next) });
    } catch (err) {
      dispatch({ type: 'error', error: err.message });
    }
  }

  async function doImport() {
    dispatch({ type: 'busy' });
    try {
      const res = await importTrades(csv, false, accountId);
      dispatch({ type: 'imported', result: res });
      onImported?.();
    } catch (err) {
      dispatch({ type: 'error', error: err.message });
    }
  }

  return (
    <Modal onClose={onClose} className="import-modal" label="Import trades from CSV">
        <div className="modal-head">
          <h3>Import trades from CSV</h3>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>

        <div className="import-body">
          {!done && (
            <>
              <p className="import-hint">
                Upload a CSV with a header row. We recognize columns like{' '}
                <code>Date</code>, <code>Symbol</code>, <code>Direction</code>, <code>Entry</code>,{' '}
                <code>SL</code>, <code>Exit</code>, or a ready <code>R</code> result — plus optional{' '}
                <code>MFE</code>, <code>P/L</code>, <code>Setup</code>, <code>Notes</code>.
              </p>
              {manualAccounts.length > 0 && (
                <label className="import-account">
                  <span>Import into</span>
                  <select value={accountId} onChange={onAccountChange} required>
                    {manualAccounts.map((a) => (
                      <option key={a.id} value={String(a.mt5_login)}>{a.label}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="import-file">
                <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} />
                <span>{fileName || 'Choose CSV file…'}</span>
              </label>
            </>
          )}

          {busy && <div className="import-busy">Working…</div>}
          {error && <div className="login-error">{error}</div>}

          {preview && !done && (
            <div className="import-preview">
              <div className="import-counts">
                <span className="import-stat ok">{counts.willImport} to import</span>
                {counts.duplicates > 0 && <span className="import-stat dup">{counts.duplicates} duplicate</span>}
                {counts.skipped > 0 && <span className="import-stat skip">{counts.skipped} skipped</span>}
              </div>

              {preview.detectedColumns?.length > 0 && (
                <div className="import-cols">
                  Detected: {preview.detectedColumns.map((c) => <code key={c}>{c}</code>)}
                </div>
              )}

              {preview.warnings?.length > 0 && (
                <ul className="import-warnings">
                  {preview.warnings.map((w, i) => (
                    <li key={i} className={`import-warn ${w.level}`}>
                      {w.level === 'warn' ? '⚠ ' : 'ℹ '}{w.message}
                    </li>
                  ))}
                </ul>
              )}

              <div className="import-actions">
                <button onClick={onClose}>Cancel</button>
                <button className="primary" onClick={doImport} disabled={busy || !counts.canImport}>
                  {busy ? 'Importing…' : `Import ${counts.willImport} trade${counts.willImport === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          )}

          {done && (
            <div className="import-done">
              <div className="import-done-head">✓ Imported {done.imported} trade{done.imported === 1 ? '' : 's'}.</div>
              {done.duplicates > 0 && <div className="muted">{done.duplicates} skipped as duplicates of earlier imports.</div>}
              {done.skipped > 0 && <div className="muted">{done.skipped} rows skipped (missing date/symbol).</div>}
              <div className="import-actions">
                <button className="primary" onClick={onClose}>Done</button>
              </div>
            </div>
          )}
        </div>
    </Modal>
  );
}
