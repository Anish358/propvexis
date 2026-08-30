import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSrc, stripComments } from './helpers/src-files.js';
import { appCss } from './helpers/app-css.js';

/* THE RAIL'S "ADD ACCOUNT" — the one action in the navigation.
 *
 * It sits above the nav rather than in it because it is not a place: it starts the Add
 * Account wizard and comes back. Everything below is either a rule from
 * DESIGN-LANGUAGE that this control could plausibly break, or a mechanical trap this
 * repo has hit before.
 */

const rail = readSrc('components/primitives/rail.jsx');
const sidebar = readSrc('app/Sidebar.jsx');
const cta = rail.slice(rail.indexOf('export function RailCta'), rail.indexOf('export function RailNav'));

test('it is the LIGHT primary action, and wears no outcome colour', () => {
  // §4: primary actions are light, never brand — and green/red are TRADE OUTCOMES
  // only, amber is the risk ramp. A creation action in any of them would be the one
  // thing this palette must never say.
  assert.match(cta, /bg-\[var\(--action\)\]/);
  assert.match(cta, /text-\[var\(--on-action\)\]/);
  assert.match(cta, /hover:bg-\[var\(--action-2\)\]/);
  for (const forbidden of ['--profit', '--loss', '--warning', '--risk-', '--accent)', '--be']) {
    assert.ok(!cta.includes(forbidden), `the CTA reaches for ${forbidden}`);
  }
  // §14: hover intensifies what the control already wears. --action-2 is --action's
  // own darker step, not a new hue.
  assert.ok(!/hover:[^\s']*--(profit|loss|warning|accent)/.test(cta));
});

test('it collapses to its icon, by RENDERING differently — never `hidden`', () => {
  /* §1: the UA's [hidden] rule loses to any author `display`, and this sits in a flex
   * parent — so `hidden` on the label would leave it in place at 70px. The repo has
   * paid for that one before. */
  assert.match(cta, /\{!collapsed && <span className="truncate">\{children\}<\/span>\}/);
  // Comments stripped first: this component EXPLAINS the trap at length, and a rule
  // that cannot tell prose from code punishes the file for documenting itself.
  assert.ok(!/hidden/.test(stripComments(cta)), 'a `hidden` class here would do nothing at all');
  // And the name survives as the tooltip, exactly as RailItem does it.
  assert.match(cta, /title=\{collapsed \? String\(children\) : undefined\}/);
  // 36px square when collapsed, full width when not.
  assert.match(cta, /collapsed \? 'w-9 self-center px-0' : 'w-full px-3\.5'/);
});

test('it is a Link, so it behaves like navigation', () => {
  // Middle-click, right-click, open-in-new-tab. A button with navigate() has none of
  // those, and this IS a destination.
  assert.match(sidebar, /<RailCta render=\{<Link to="\/accounts\/new" \/>\}/);
  assert.match(sidebar, /icon=\{<Plus aria-hidden="true" \/>\}/, 'lucide, per §23');
  assert.match(sidebar, /Add account/);
});

test('it sits between the brand and the nav', () => {
  const brandAt = sidebar.indexOf('</RailBrand>');
  const ctaAt = sidebar.indexOf('<RailCta');
  const navAt = sidebar.indexOf('<RailNav');
  assert.ok(brandAt > -1 && ctaAt > brandAt, 'the CTA must come after the brand');
  assert.ok(ctaAt < navAt, 'the CTA must come before the nav');
});

test('it has a visible focus state that clears the rail', () => {
  // §9: every interactive element has one, and the ring is neutral rather than brand.
  assert.match(cta, /focus-visible:ring-2 focus-visible:ring-\[var\(--accent-ring\)\]/);
  // Offset against the rail's own ground, or a light button's ring is invisible on it.
  assert.match(cta, /focus-visible:ring-offset-\[var\(--rail-bg\)\]/);
});

test('no page writes the CTA\'s styling, because it would compile to nothing', () => {
  // §1: Tailwind's @source is scoped to components/{ui,primitives}. The whole reason
  // this is a primitive and not a few classes in Sidebar.jsx.
  assert.ok(!/className="[^"]*bg-\[var\(--action\)\]/.test(sidebar),
    'Sidebar.jsx is styling the CTA itself — those utilities emit no CSS');
  // And it must not have needed a legacy class either.
  assert.ok(!/rail-cta/.test(appCss), 'the CTA should need no legacy CSS');
});
