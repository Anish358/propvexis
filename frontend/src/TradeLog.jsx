import React, { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import TradesTable from './TradesTable.jsx';
import TagModal from './TagModal.jsx';
import AddTradeModal from './AddTradeModal.jsx';
import TradeSettingsModal from './TradeSettingsModal.jsx';
import TradePreview from './TradePreview.jsx';
import ReplayModal from './ReplayModal.jsx';
import Explain from './Explain.jsx';

export default function TradeLog() {
  const {
    trades = [], connected, flashId, saveTrade, removeTrade, addManualTrade,
    strategies = [],
    toggleSidebar, accountId = 'all', unit = 'R',
    tradeSettings = {}, setBeRounding, setColumnVisible, resetColumns,
  } = useOutletContext();
  // Clicking a row opens the read-only preview panel; its edit icon opens the
  // TagModal editor. `previewId` (not a snapshot) so the panel reflects live edits
  // and closes itself if the trade is deleted or filtered out.
  const [previewId, setPreviewId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [replaying, setReplaying] = useState(null);
  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isGod = accountId === 'all';

  const untagged = useMemo(() => trades.filter((t) => !t.tagged).length, [trades]);
  const columnOverrides = tradeSettings.columns || {};
  const previewTrade = useMemo(() => trades.find((t) => t.id === previewId) || null, [trades, previewId]);

  async function deleteFromPreview(id) {
    await removeTrade(id);
    setPreviewId(null);
  }

  return (
    <div className="page">
      <PageHeader title="Trade Log" connected={connected} onMenu={toggleSidebar} />

      <div className="page-body">
        <div className="log-toolbar">
          <span className="log-count">{trades.length} trade{trades.length === 1 ? '' : 's'}</span>
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
          {isGod && (
            <span className="add-trade-group">
              <button className="add-trade-btn" onClick={() => setAdding(true)}>+ Add strategy trade</button>
              <Explain align="right">
                <b>Strategy trades</b> are manual, account-less journal entries — used to log a
                setup or backtest a strategy in R without a live MT5 position behind it.
                <br /><br />
                They only appear in the <b>god (all-accounts) view</b>. A per-account view mirrors
                one real MT5 account, whose trades are ingested automatically by the EA — so there's
                nothing to add by hand there. Manual entries have no account, which is exactly what
                the god view aggregates.
              </Explain>
            </span>
          )}
          <button className="ts-open-btn" onClick={() => setSettingsOpen(true)} title="Trade settings">
            ⚙ Trade Settings
          </button>
        </div>

        <div className="panel log-panel">
          <TradesTable trades={trades} onRowClick={(t) => setPreviewId(t.id)} highlightId={flashId} unit={unit} columnOverrides={columnOverrides} beRounding={!!tradeSettings.beRounding} />
        </div>
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
      {adding && <AddTradeModal onClose={() => setAdding(false)} onAdd={addManualTrade} strategies={strategies} />}
      <TradeSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        unit={unit}
        beRounding={!!tradeSettings.beRounding}
        setBeRounding={setBeRounding}
        columnOverrides={columnOverrides}
        setColumnVisible={setColumnVisible}
        resetColumns={resetColumns}
      />
    </div>
  );
}
