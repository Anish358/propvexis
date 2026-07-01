import React, { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import TradesTable from './TradesTable.jsx';
import TagModal from './TagModal.jsx';
import AddTradeModal from './AddTradeModal.jsx';
import TradeSettingsModal from './TradeSettingsModal.jsx';
import Explain from './Explain.jsx';

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
