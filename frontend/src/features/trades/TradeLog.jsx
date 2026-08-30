import React, { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import PageHeader from '../../app/PageHeader.jsx';
import TradesTable from './TradesTable.jsx';
import TagModal from './TagModal.jsx';
import AddTradeModal from './AddTradeModal.jsx';
import ImportTradesModal from './ImportTradesModal.jsx';
import TradeSettingsModal from './TradeSettingsModal.jsx';
import TradePreview from './TradePreview.jsx';
import ReplayModal from './ReplayModal.jsx';
import Explain from '../../components/Explain.jsx';
import { Button, EmptyState, KpiRow } from '@/components/primitives';
import { activeFilterCount } from '../filters/filters.js';
import { NetPnlCard, ProfitFactorCard, TradeWinCard, AvgWinLossCard } from '../dashboard/KpiCards.jsx';
import BulkActions from './BulkActions.jsx';
import { computeMetrics } from '../../lib/metrics.js';
import { visibleColumns } from './tradeColumns.js';
import { tradesToCsv, downloadCsv } from './tradeExport.js';

export default function TradeLog() {
  const {
    trades = [], connected, flashId, saveTrade, removeTrade, addManualTrade,
    reloadTrades, strategies = [], accounts = [],
    toggleSidebar, accountId = 'all', unit = 'R',
    tradeSettings = {}, setBeRounding, setColumnVisible, resetColumns,
    filters, clearFilters = () => {},
  } = useOutletContext();
  // "No trades at all" and "no trades matching the filters" look identical on
  // screen but need opposite actions, so the empty state has to tell them apart.
  const filtersActive = activeFilterCount(filters) > 0;
  // Clicking a row opens the read-only preview panel; its edit icon opens the
  // TagModal editor. `previewId` (not a snapshot) so the panel reflects live edits
  // and closes itself if the trade is deleted or filtered out.
  const [previewId, setPreviewId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [replaying, setReplaying] = useState(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Manual accounts (no live EA sync) can receive manually-added / imported trades.
  const manualAccounts = useMemo(() => accounts.filter((a) => a.kind === 'manual' && a.is_active !== false), [accounts]);
  // The selection is 'all' or a comma-joined list of logins. Exactly one login is
  // the only case with a "current account"; 'all' and a multi-select have none.
  const selectedLogins = useMemo(
    () => (accountId === 'all' || accountId == null ? [] : String(accountId).split(',').filter(Boolean)),
    [accountId],
  );
  const currentAccount = useMemo(
    () => (selectedLogins.length === 1
      ? accounts.find((a) => String(a.mt5_login) === selectedLogins[0]) || null
      : null),
    [accounts, selectedLogins],
  );
  const currentIsManual = currentAccount?.kind === 'manual';
  /* ADDING A TRADE NEEDS AN ACCOUNT TO PUT IT IN, and that is new. It used to be
     allowed in the all-accounts view precisely BECAUSE there was no account —
     the trade was written account-less and was visible only there. Migration 0028
     ended that: every trade belongs to an account, and the server rejects one that
     names none. So the button now requires that a manual account EXISTS to receive
     the trade, and the modal's Account field (no longer optional) chooses which.

     A single SYNCED account in scope still cannot take one: the EA feeds it, and a
     hand-typed trade in an EA-synced account is a reconciliation problem, not a
     journal entry. */
  const canAddTrades = manualAccounts.length > 0 && (currentIsManual || selectedLogins.length !== 1);
  // Which account the modals open on: the one in scope when it can take the trade,
  // else the first manual account — never blank, because blank is no longer valid.
  const addDefaultAccountId = currentIsManual ? selectedLogins[0] : String(manualAccounts[0]?.mt5_login ?? '');

  const untagged = useMemo(() => trades.filter((t) => !t.tagged).length, [trades]);
  const columnOverrides = tradeSettings.columns || {};
  // The KPI row describes the rows underneath it. `trades` here is already the
  // globally-filtered set, so narrowing the filters re-states the headline numbers
  // for that subset rather than for the whole account.
  const m = useMemo(
    () => computeMetrics(trades, unit, !!tradeSettings.beRounding),
    [trades, unit, tradeSettings.beRounding],
  );

  // Row selection lives here rather than in the table so the toolbar can report on
  // it. Held as a Set of trade ids and intersected with what's in view on read: a
  // filter change (or a deleted trade) must not leave a selected id counted for a
  // row that isn't on screen.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const selected = useMemo(() => {
    const visible = new Set(trades.map((t) => t.id));
    return new Set([...selectedIds].filter((id) => visible.has(id)));
  }, [selectedIds, trades]);
  const selectOne = (id, on) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });
  // "All" is all the rows in view, so it agrees with the header box beside them.
  const selectAll = (on) => setSelectedIds(on ? new Set(trades.map((t) => t.id)) : new Set());

  // ---- bulk actions -------------------------------------------------------
  // Every one of these fans a per-trade request out over the selection, so they all
  // share the same shape: run them all, count what failed, and say so. allSettled
  // rather than all() — one rejection must not abandon the rest half-applied and
  // leave the user unable to tell which rows went through.
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState(null);
  const selectedTrades = useMemo(() => trades.filter((t) => selected.has(t.id)), [trades, selected]);

  async function runBulk(label, ids, fn) {
    setBulkBusy(true);
    setBulkError(null);
    const results = await Promise.allSettled(ids.map((id) => fn(id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    setBulkBusy(false);
    if (failed) setBulkError(`${label}: ${failed} of ${ids.length} failed. The rest were applied.`);
    return failed;
  }

  // A partial update — the API patches only the fields it's given, so setting a
  // strategy can't blank a trade's notes or probability.
  const bulkSetField = async (field, value) => {
    const ids = [...selected];
    await runBulk(`Set ${field}`, ids, (id) => saveTrade(id, { [field]: value }));
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    if (!confirm(`Delete ${ids.length} trade${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    const failed = await runBulk('Delete', ids, (id) => removeTrade(id));
    // Drop the ids that went; a failed one stays selected so it can be retried.
    if (!failed) setSelectedIds(new Set());
  };

  // Exported from what's ON SCREEN — the visible columns in their current order,
  // minus the selection column — so the file matches the table the user is looking
  // at rather than a fixed schema they'd have to reconcile.
  const bulkExport = () => {
    const cols = visibleColumns(columnOverrides).filter((c) => !c.fixed);
    const text = tradesToCsv(selectedTrades, cols, unit, !!tradeSettings.beRounding);
    downloadCsv(text, `trades-${selectedTrades.length}.csv`);
  };
  const previewTrade = useMemo(() => trades.find((t) => t.id === previewId) || null, [trades, previewId]);

  async function deleteFromPreview(id) {
    await removeTrade(id);
    setPreviewId(null);
  }

  return (
    <div className="page">
      <PageHeader title="Trade Log" connected={connected} onMenu={toggleSidebar} />

      <div className="page-body">
        {/* Same four cards the Dashboard renders, from the same components — Net
            P&L is the locked master card and the others match its geometry. */}
        <KpiRow>
          <NetPnlCard m={m} unit={unit} />
          <ProfitFactorCard m={m} />
          <TradeWinCard m={m} />
          {/* `unit` is required as of the Rhea rebuild — the card's chips print the
              average win and loss as figures, so it has to know whether they are
              dollars or R. Passing it here was easy to forget: without it the chips
              would silently format as R on a page showing dollars. */}
          <AvgWinLossCard m={m} unit={unit} />
        </KpiRow>

        <div className="log-toolbar">
          <span className="log-count">{trades.length} trade{trades.length === 1 ? '' : 's'}</span>
          {/* The count of what the Bulk actions button will act on, plus a way back
              out of a selection without unticking every row. */}
          {selected.size > 0 && (
            <span className="log-selected">
              {selected.size} selected
              <button type="button" className="log-selected-clear" onClick={() => selectAll(false)}>Clear</button>
            </span>
          )}
          {bulkError && <span className="log-bulk-error" role="alert">{bulkError}</span>}
          {untagged > 0 && <span className="log-untagged">{untagged} to tag</span>}
          <button
            className={`precision-chip ${tradeSettings.beRounding ? 'on' : 'off'}`}
            onClick={() => setSettingsOpen(true)}
            title="Breakeven rounding — click to change in Trade Settings"
          >
            <span className="precision-dot" />
            Precision control: {tradeSettings.beRounding ? 'On' : 'Off'}
          </button>
          <span className="log-toolbar-spacer" />
          {canAddTrades && (
            <span className="add-trade-group">
              <button className="add-trade-btn" onClick={() => setImporting(true)}>⬆ Import CSV</button>
              {/* ONE NAME (owner decision 2026-08-27). The split said "strategy trade"
                  when no manual account was selected, because an account-less trade lived
                  only in the all-accounts view. That case no longer exists — a trade
                  without an account is unwritable since migration 0028 — so the one name
                  is now the only name there could be, rather than a choice. */}
              <button className="add-trade-btn" onClick={() => setAdding(true)}>+ Add trade</button>
              <Explain align="right">
                <b>Manual & CSV trades</b> are journal entries you enter by hand or import — used to
                log a setup or backtest a strategy in R without a live MT5 position behind it.
                <br /><br />
                Every trade belongs to a <b>manual account</b>, chosen in the Account field — that is
                what scopes it when you filter the top bar to one account or a few. A
                <b> synced (EA) account</b> is fed automatically by the EA — so there's nothing to add
                by hand there.
              </Explain>
            </span>
          )}
          {/* Icon only — the gear is the convention and the title/aria-label carry
              the name for anyone who needs it. */}
          <button
            className="ts-open-btn ts-open-btn--icon"
            onClick={() => setSettingsOpen(true)}
            title="Trade settings"
            aria-label="Trade settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V10a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {/* Right of Trade Settings, and inert until rows are selected. */}
          <BulkActions
            count={selected.size}
            strategies={strategies}
            busy={bulkBusy}
            onSetField={bulkSetField}
            onExport={bulkExport}
            onDelete={bulkDelete}
          />
        </div>

        {/* Zero trades used to render a lone column header over blank space,
            with no indication of whether the account was empty or the filters
            were simply too narrow. Those are different problems with different
            fixes, so they get different copy. */}
        {trades.length === 0 ? (
          <EmptyState
            title={filtersActive ? 'No trades match these filters' : 'No trades yet'}
            description={filtersActive
              ? 'Widen or clear the filters in the bar above to see more of your history.'
              : 'Trades appear here automatically once the EA is running on your MT5 account. You can also import a CSV or add one by hand.'}
            actions={filtersActive
              ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
              : (
                <>
                  <Button onClick={() => setImporting(true)}>Import CSV</Button>
                  <Button variant="secondary" onClick={() => setAdding(true)}>Add trade</Button>
                </>
              )}
          />
        ) : (
          <div className="panel log-panel">
            <TradesTable
              trades={trades}
              onRowClick={(t) => setPreviewId(t.id)}
              highlightId={flashId}
              unit={unit}
              columnOverrides={columnOverrides}
              beRounding={!!tradeSettings.beRounding}
              selected={selected}
              onSelect={selectOne}
              onSelectAll={selectAll}
            />
          </div>
        )}
      </div>

      <TradePreview
        trade={previewTrade}
        unit={unit}
        beRounding={!!tradeSettings.beRounding}
        onClose={() => setPreviewId(null)}
        onEdit={(t) => setEditing(t)}
        onDelete={deleteFromPreview}
        onReplay={(t) => setReplaying(t)}
      />
      {replaying && <ReplayModal trade={replaying} onClose={() => setReplaying(null)} />}
      <TagModal trade={editing} onClose={() => setEditing(null)} onSave={saveTrade} onDelete={removeTrade} strategies={strategies} />
      {adding && (
        <AddTradeModal
          onClose={() => setAdding(false)}
          onAdd={addManualTrade}
          strategies={strategies}
          manualAccounts={manualAccounts}
          defaultAccountId={addDefaultAccountId}
        />
      )}
      {importing && (
        <ImportTradesModal
          onClose={() => setImporting(false)}
          onImported={() => reloadTrades?.()}
          manualAccounts={manualAccounts}
          defaultAccountId={addDefaultAccountId}
        />
      )}
      <TradeSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        beRounding={!!tradeSettings.beRounding}
        setBeRounding={setBeRounding}
        columnOverrides={columnOverrides}
        setColumnVisible={setColumnVisible}
        resetColumns={resetColumns}
      />
    </div>
  );
}
