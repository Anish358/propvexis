import React from 'react';
import { useOutletContext } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import { EmptyState, Badge } from '@/components/primitives';

// Generic stub for IA routes whose screens aren't built yet (nav.js `soon`).
// Keeps the decided navigation honest — every sub-item is reachable — while the
// screen deep-dives happen later, per the "bare bones first" plan. Uses the
// shared EmptyState primitive so all 10 soon routes read identically.
export default function ComingSoon({ title, blurb }) {
  const { connected, toggleSidebar } = useOutletContext();
  return (
    <div className="page">
      <PageHeader title={title} connected={connected} onMenu={toggleSidebar} />
      <EmptyState
        badge={<Badge tone="brand">Coming soon</Badge>}
        icon={(
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
          </svg>
        )}
        title={title}
        description={blurb || 'This module is on the roadmap and will land in an upcoming release.'}
      />
    </div>
  );
}
