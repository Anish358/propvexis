import React from 'react';
import { NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import PageHeader from '../../app/PageHeader.jsx';
import { settingsRail, settingsSection } from './settingsNav.js';

// ---------------------------------------------------------------------------
// Settings — the module shell: a section rail on the left, one section's panels on
// the right. Six sections, six real routes, one page frame drawn once.
//
// THE RAIL IS IN THE PAGE, NOT IN THE APP SIDEBAR, and nav.js's `subnavInPage`
// records that as an IA fact rather than leaving it implicit here. The short version
// of the reasoning there: Trade Journal and Prop OS are places a trader moves
// between all session, so they earn rail rows; Settings is somewhere you go to
// change one thing and leave, and six permanent rows for monthly tasks would push
// the daily ones down the list.
//
// THE SECTIONS ARE ROUTES, WHICH IS A DEPARTURE FROM THE TABS PRECEDENT AND SAYS SO.
// Prop OS > Accounts holds its two views in local state on one route, on the grounds
// that adding `/prop/accounts/details` would put a navigation decision somewhere the
// IA does not describe. The same argument runs the other way here, because the
// difference is what a section IS. Portfolio and Details are two views of one
// workspace a trader flips between while working; Account settings and Appearance
// are unrelated destinations you arrive at from six different intentions — a support
// reply saying "open Settings > Accounts" wants a link, an upgrade prompt wants to
// land on Plan & Billing, and reloading after saving a column layout should not throw
// you back to Profile. Six routes are six answers; one route with local state is one.
//
// THE SHELL OWNS THE SECTION HEADER, so a panel below never restates its own name.
// Title and blurb both come from settingsNav.js, which means the rail row you clicked
// and the heading you land on are the same string by construction.
//
// CONTEXT IS PASSED THROUGH, NOT RE-DERIVED. Layout hands every page the app's state
// via Outlet context; nesting a second Outlet would otherwise cut the sections off
// from it, so this forwards the same object unchanged. Every section then reads
// `useOutletContext()` exactly like a top-level page does.
// ---------------------------------------------------------------------------

function SectionRail() {
  const rail = settingsRail();
  return (
    // `nav` with a name, not a bare div: this is a second navigation landmark on the
    // page and a screen reader lists both, so the one that is not the app rail has to
    // say which it is.
    <nav className="set-rail" aria-label="Settings sections">
      {rail.map(({ group, items }) => (
        <div key={group} className="set-rail-group">
          <div className="set-rail-group-label">{group}</div>
          {items.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.end}
              className={({ isActive }) => `set-rail-link ${isActive ? 'active' : ''}`}
            >
              {s.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

export default function Settings() {
  const ctx = useOutletContext() || {};
  const { pathname } = useLocation();
  const section = settingsSection(pathname);

  return (
    <div className="page">
      {/* No page actions: a section's own action ("Add account") belongs beside the
          thing it acts on, not in the app-wide bar three sections away from it. The
          header is still rendered so the portal seam stays consistent app-wide. */}
      <PageHeader />
      <div className="page-body">
        <div className="set-shell">
          <SectionRail />
          <div className="set-content">
            {section && (
              <header className="set-section-head">
                <h2 className="set-section-title">{section.label}</h2>
                <p className="set-section-blurb">{section.blurb}</p>
              </header>
            )}
            <Outlet context={ctx} />
          </div>
        </div>
      </div>
    </div>
  );
}
