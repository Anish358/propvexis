import React, { useReducer } from 'react';
import {
  Alert, AlertDescription, Badge, Button, Field, FieldDescription, FieldLabel, Input,
  WizardGroup, WizardHeading, WizardRow,
} from '@/components/primitives';
import { useFlow } from '../NewAccountFlow.jsx';
import { importTrades } from '../../../lib/api.js';
import {
  csvSizeVerdict, importReducer, initialImportState, previewSummary,
} from '../../trades/csvImportFlow.js';

/* Bring in a statement, now that the account exists.
 *
 * IT DRIVES THE SHARED SEQUENCE, NOT ITS OWN (spec §8.3, "extracted out of
 * ImportTradesModal and shared, not copied"). What is shared is the state machine and
 * the guards; the MARKUP is not, because a dialog over the trade log and a full-bleed
 * wizard step are different layouts and forcing one component to be both is how a
 * modal ends up rendered inside a page.
 *
 * NO "IMPORT INTO" SELECT. The modal has one because it runs from the trade log where
 * the target is ambiguous. Here the account was created two steps ago and is the only
 * possible target — and `importTrades` scopes by mt5_login, so rows filed account-less
 * would be invisible in the per-account view the user is about to be dropped into.
 *
 * THE CLEARING DISPATCH PRECEDES THE READ, and this is the one behaviour worth
 * restating rather than trusting: the modal shipped it the other way round and it had
 * to be fixed. The component stays mounted through `await file.text()`, so a stale
 * preview leaves the confirm button live with the PREVIOUS file's counts on it — and a
 * click there imports the previous csv while the user believes they imported the new
 * one. The reducer cannot express ordering, so each surface has to get it right and
 * each is pinned separately.
 *
 * SKIPPABLE, AND SKIPPING IS RECORDED. The account is already real so skipping costs
 * nothing — but `uploadDone` is what stops a refresh sending the user back to a step
 * they deliberately left.
 *
 * NO BACK CONTROL. The account exists, `prevStep` returns null and `canVisit` refuses
 * a return, so a Back button here would be a visible dead control.
 */
export default function UploadStep() {
  const { draft, patch, advance } = useFlow();
  const [state, dispatch] = useReducer(importReducer, undefined, initialImportState);
  const { fileName, csv, preview, error, busy } = state;
  const counts = previewSummary(preview);

  // Fixed: the commit happened at `import`.
  const target = draft.account?.mt5_login;

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Before the read, not after: the CSV rides inside a JSON body at a 12 MB limit
    // and escaping inflates it, so a large statement would 413 at the end of a long
    // upload on the LAST step of a nine-step flow.
    const verdict = csvSizeVerdict(file.size);
    if (!verdict.ok) {
      dispatch({ type: 'file', fileName: file.name, csv: '' });
      dispatch({ type: 'error', error: verdict.error });
      return;
    }
    dispatch({ type: 'file', fileName: file.name, csv: '' });
    const text = await file.text();
    dispatch({ type: 'file', fileName: file.name, csv: text });
    dispatch({ type: 'busy' });
    try {
      dispatch({ type: 'preview', preview: await importTrades(text, true, target) });
    } catch (err) {
      dispatch({ type: 'error', error: err.message });
    }
  }

  async function doImport() {
    dispatch({ type: 'busy' });
    try {
      await importTrades(csv, false, target);
      // Straight on rather than showing a second success panel: `done` is the page
      // that reports what happened, and two success screens in a row is one too many.
      patch({ uploadDone: true });
      advance();
    } catch (err) {
      dispatch({ type: 'error', error: err.message });
    }
  }

  function skip() {
    patch({ uploadDone: true });
    advance();
  }

  return (
    <>
      <WizardHeading
        title="Import your history?"
        description="Upload a CSV export from your platform and we will detect the columns and skip anything already in the journal. You can do this later instead."
      />

      <WizardGroup>
        <Field>
          <FieldLabel htmlFor="naf-csv">Statement or trade export</FieldLabel>
          <Input
            id="naf-csv" type="file" accept=".csv,text/csv,text/plain"
            onChange={onFile} disabled={busy}
          />
          <FieldDescription>
            {fileName ? `Selected ${fileName}` : 'CSV from MetaTrader, your firm’s dashboard, or a spreadsheet.'}
          </FieldDescription>
        </Field>

        {error ? (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {preview ? (
          <>
            <WizardRow>
              <Badge tone="neutral">{counts.willImport} to import</Badge>
              {counts.duplicates > 0 ? <Badge tone="neutral">{counts.duplicates} already here</Badge> : null}
              {counts.skipped > 0 ? <Badge tone="neutral">{counts.skipped} skipped</Badge> : null}
            </WizardRow>

            {preview.detectedColumns?.length > 0 ? (
              <WizardRow>
                {preview.detectedColumns.map((c) => <Badge key={c} tone="neutral">{c}</Badge>)}
              </WizardRow>
            ) : null}

            {/* `warning` is the one status colour this app has a token for — see
                primitives/alert.jsx. An info-level note falls back to `default`. */}
            {(preview.warnings ?? []).map((w, i) => (
              <Alert key={i} variant={w.level === 'warn' ? 'warning' : 'default'}>
                <AlertDescription>{w.message}</AlertDescription>
              </Alert>
            ))}
          </>
        ) : null}

        <WizardRow>
          {/* Gated on canImport, so a 0-row file cannot be sent and then reported back
              as "imported 0 trades". */}
          <Button
            variant="primary" onClick={doImport}
            disabled={busy || !counts.canImport}
          >
            {busy ? 'Importing…' : `Import ${counts.willImport} trade${counts.willImport === 1 ? '' : 's'}`}
          </Button>
          <Button variant="ghost" onClick={skip} disabled={busy}>
            {preview ? 'Skip for now' : 'I’ll do this later'}
          </Button>
        </WizardRow>
      </WizardGroup>
    </>
  );
}
