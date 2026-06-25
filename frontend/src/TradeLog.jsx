import React, { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import TradesTable from './TradesTable.jsx';
import TagModal from './TagModal.jsx';

export default function TradeLog() {
  const { trades = [], connected, flashId, saveTrade, removeTrade, toggleSidebar } = useOutletContext();
  const [selected, setSelected] = useState(null);

  const untagged = useMemo(() => trades.filter((t) => !t.tagged).length, [trades]);

  return (
    <div className="page">
      <PageHeader title="Trade Log" connected={connected} onMenu={toggleSidebar} />

      <div className="page-body">
        <div className="log-toolbar">
          <span className="log-count">{trades.length} trade{trades.length === 1 ? '' : 's'}</span>
          {untagged > 0 && <span className="log-untagged">{untagged} to tag</span>}
        </div>

        <div className="panel log-panel">
          <TradesTable trades={trades} onRowClick={setSelected} highlightId={flashId} />
        </div>
      </div>

      <TagModal trade={selected} onClose={() => setSelected(null)} onSave={saveTrade} onDelete={removeTrade} />
    </div>
  );
}
