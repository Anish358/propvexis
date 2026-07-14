import React from 'react';
import { useOutletContext } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';

// Generic stub for IA routes whose screens aren't built yet (nav.js `soon`).
// Keeps the decided navigation honest — every sub-item is reachable — while the
// screen deep-dives happen later, per the "bare bones first" plan.
export default function ComingSoon({ title, blurb }) {
  const { connected, toggleSidebar } = useOutletContext();
  return (
    <div className="page">
      <PageHeader title={title} connected={connected} onMenu={toggleSidebar} />
      <div className="panel coming-soon">
        <div className="cs-badge">Coming soon</div>
        <h3>{title}</h3>
        {blurb && <p className="muted">{blurb}</p>}
      </div>
    </div>
  );
}
