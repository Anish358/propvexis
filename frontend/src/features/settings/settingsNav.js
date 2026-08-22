import { NAV } from '../../app/nav.js';

// ---------------------------------------------------------------------------
// Settings › the section rail.
//
// THE ROUTES ARE NOT DECLARED HERE. They live in nav.js with the rest of the app's
// information architecture, and this module READS them. What it adds is the one
// thing nav.js has no vocabulary for: the two groups the rail divides them into,
// and a line of copy per section.
//
// That split is deliberate. A second list of `/settings/*` paths would be a second
// source of truth for the IA, and the failure mode is silent — add a section to
// nav.js and the router serves it while the rail never shows it, or rename one and
// the rail links to a 404. Deriving means the rail cannot disagree with the router,
// and `settingsSections()` throws if a route ever loses its group rather than
// dropping it from the rail where nobody would notice.
//
// JSX-free, like nav.js and for the same reason: the backend test runner imports it
// to assert the grouping without a DOM.
// ---------------------------------------------------------------------------

// Which group each section sits in. Title Case, not USER / GENERAL — all-caps is
// prohibited outright (DESIGN-LANGUAGE §3, "Title Case, never all-caps"), and the
// wide tracking that usually makes all-caps labels readable is prohibited with it.
// A group label is a quiet divider either way; it does not need to shout.
export const SETTINGS_GROUPS = ['User', 'Workspace'];

// route -> { group, blurb }. The blurb is the one line under the section's title,
// which is the same job `.fin-card-sub` does on Finance's cards.
const SECTION_META = {
  '/settings': {
    group: 'User',
    blurb: 'Who you are signed in as. Your name, email and avatar come from your Google account.',
  },
  '/settings/plan': {
    group: 'User',
    blurb: 'The plan this account is on and what it unlocks.',
  },
  '/settings/session': {
    group: 'User',
    blurb: 'End this session on this device.',
  },
  '/settings/accounts': {
    group: 'Workspace',
    blurb: 'Every trading account you journal — prop challenges, funded accounts and manual buckets.',
  },
  '/settings/trades': {
    group: 'Workspace',
    blurb: 'How trades are measured and which columns the trade log shows.',
  },
  '/settings/appearance': {
    group: 'Workspace',
    blurb: 'How PropVexis looks on this account.',
  },
};

// The Settings module's children, straight from the IA.
export function settingsRoutes() {
  const module = NAV.find((i) => i.base === '/settings');
  if (!module?.children) throw new Error('nav.js no longer declares a /settings module');
  return module.children;
}

// Every section, in nav.js order, with its group and blurb attached. Throws on a
// route with no group — see the header for why silence would be worse.
export function settingsSections() {
  return settingsRoutes().map((c) => {
    const meta = SECTION_META[c.to];
    if (!meta) throw new Error(`settingsNav: no group for ${c.to} — add it to SECTION_META`);
    return { ...c, ...meta };
  });
}

// The rail, grouped. Groups keep SETTINGS_GROUPS' order; sections keep nav.js's.
export function settingsRail() {
  const sections = settingsSections();
  return SETTINGS_GROUPS.map((group) => ({
    group,
    items: sections.filter((s) => s.group === group),
  }));
}

// The section a pathname is on, for the rail's active row and the panel's own
// title. Normalises a trailing slash the same way navTitle does, so `/settings/`
// and `/settings` are one section rather than one section and nothing.
export function settingsSection(pathname = '/settings') {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return settingsSections().find((s) => s.to === path) || null;
}
