import React, { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import TradesTable from './TradesTable.jsx';
import TagModal from './TagModal.jsx';
import AddTradeModal from './AddTradeModal.jsx';
import TradeSettingsModal from './TradeSettingsModal.jsx';

export default function TradeLog() {
  const {
    trades = [], connected, flashId, saveTrade, removeTrade, addManualTrade,
    toggleSidebar, accountId = 'all', unit = 'R',
    tradeSettings = {}, setBeRounding, setColumnVisible, resetColumns,
  } = useOutletContext();
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isGod = accountId === 'all';

  const untagged = useMemo(() => trades.filter((t) => !t.tagged).length, [trades]);
  const columnOverrides = tradeSettings.columns || {};

  return (
    <div className="page">
      <PageHeader title="Trade Log" connected={connected} onMenu={toggleSidebar} />

      <div className="page-body">
        <div className="log-toolbar">
          <span className="log-count">{trades.length} trade{trades.length === 1 ? '' : 's'}</span>
          {untagged > 0 && <span className="log-untagged">{untagged} to tag</span>}
          <span className="log-toolbar-spacer" />
          {isGod && (
            <button className="add-trade-btn" onClick={() => setAdding(true)}>+ Add strategy trade</button>
          )}
          <button className="ts-open-btn" onClick={() => setSettingsOpen(true)} title="Trade settings">
            ⚙ Trade Settings
          </button>
        </div>

        <div className="panel log-panel">
          <TradesTable trades={trades} onRowClick={setSelected} highlightId={flashId} unit={unit} columnOverrides={columnOverrides} />
        </div>
      </div>

      <TagModal trade={selected} onClose={() => setSelected(null)} onSave={saveTrade} onDelete={removeTrade} />
      {adding && <AddTradeModal onClose={() => setAdding(false)} onAdd={addManualTrade} />}
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
