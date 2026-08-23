import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  Avatar, AvatarFallback, AvatarImage, Badge, Button, Card,
  ToggleGroupExclusive, ToggleGroupItem,
} from '@/components/primitives';
import { useAuth } from '../../app/AuthContext.jsx';
import { titleCase } from '../../lib/constants.js';
import { eaAllowed } from '../accounts/accountGating.js';
import TradeSettingsPanel from '../trades/TradeSettingsPanel.jsx';

// ---------------------------------------------------------------------------
// Settings › the five panels that are not the accounts table.
//
// ONE FILE FOR FIVE SMALL SECTIONS, one file for the big one. Each of these is a card
// with a handful of rows; splitting them into five modules would be five imports and
// five headers for about thirty lines of markup each, and the app already groups small
// related components this way (AccountKpiCards holds three, FinanceKpiCards four).
// SettingsAccounts is its own module because it is a page's worth of behaviour.
//
// EVERY VALUE HERE IS STATE THAT ALREADY EXISTS. Profile reads the Google identity the
// JWT was minted from, Plan reads `user.plan`, Trade Settings renders the panel the
// Trade Log's modal renders, Appearance writes the same `theme` the top bar's toggle
// writes. Nothing on these five screens is a preference invented to fill a rail row —
// which is also why the rail has six entries and not the thirteen a settings screen
// usually grows.
//
// THE SECTION TITLE AND ITS BLURB ARE NOT IN THESE COMPONENTS. Settings.jsx draws them
// from settingsNav.js, so the rail row you clicked and the heading you land on are the
// same string by construction and cannot drift.
// ---------------------------------------------------------------------------

// One label/value line. The label is `--text-2` at full opacity, which is the app's
// standard for a label beside a value.
function Row({ label, children }) {
  return (
    <div className="set-row">
      <span className="set-row-label">{label}</span>
      <span className="set-row-value">{children}</span>
    </div>
  );
}

// ---- Profile ---------------------------------------------------------------

// READ-ONLY, AND NOT AS A SHORTCUT. Identity comes from Google OAuth: the name, email
// and avatar are Google's copies of them, so an editable field here would either
// diverge from the account you actually sign in with or be overwritten on the next
// login. The place to change them is the Google account, which is what the last row
// says instead of a disabled input pretending to be editable.
export function SettingsProfile() {
  const { user } = useAuth();
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <Card className="set-card">
      <div className="set-identity">
        <Avatar size="lg">
          <AvatarImage src={user?.picture || undefined} alt="" referrerPolicy="no-referrer" />
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
        <div className="set-identity-text">
          <div className="set-identity-name">{user?.name || 'Account'}</div>
          <div className="set-identity-email">{user?.email}</div>
        </div>
      </div>
      <div className="set-rows">
        <Row label="Name">{user?.name || '—'}</Row>
        <Row label="Email">{user?.email || '—'}</Row>
        <Row label="Sign-in method">Google account</Row>
      </div>
      <p className="set-note">
        These come from the Google account you sign in with. Changing them there changes
        them here on your next sign-in.
      </p>
    </Card>
  );
}

// ---- Plan & Billing --------------------------------------------------------

// A SUMMARY AND A DOOR, NOT A SECOND BILLING PAGE. `/billing` owns subscriptions,
// checkout and cancellation, and it talks to Razorpay to do it. Restating any of that
// here would mean two screens that can disagree about what you are paying for, so this
// answers only "what am I on right now" and hands off.
export function SettingsPlan() {
  const { user } = useAuth();
  const plan = user?.plan || 'free';

  return (
    <Card className="set-card">
      <div className="set-rows">
        <Row label="Current plan">
          <span className={`sb-plan-badge ${plan}`}>{titleCase(plan)}</span>
        </Row>
        {/* The one entitlement stated here, because it is the one that changes what
            this Settings module can do: without Pro, Accounts can only add manual
            buckets. `eaAllowed` is the same predicate the add-account form gates on —
            imported, not re-derived, so the two can never disagree. */}
        <Row label="Live MT5 sync">
          {eaAllowed(plan)
            ? <Badge tone="profit">Included</Badge>
            : <Badge tone="neutral">Pro plan</Badge>}
        </Row>
      </div>
      <div className="set-actions">
        <Button variant="primary" size="sm" as={Link} to="/billing">Manage plan</Button>
      </div>
    </Card>
  );
}

// ---- Accounts ---------------------------------------------------------------
// (SettingsAccounts.jsx — a page's worth of behaviour, so it has its own module.)

// ---- Trade Settings --------------------------------------------------------

// The settings' HOME. The Trade Log's toolbar and the top bar's avatar menu open the
// same controls in a modal, because you want them while looking at the columns; both
// render `TradeSettingsPanel`, so there is one implementation and two frames.
export function SettingsTrades() {
  const {
    tradeSettings = {}, setBeRounding, setColumnVisible, resetColumns,
  } = useOutletContext();

  return (
    <Card className="set-card set-card--flush-sections">
      <TradeSettingsPanel
        beRounding={!!tradeSettings.beRounding}
        setBeRounding={setBeRounding}
        columnOverrides={tradeSettings.columns || {}}
        setColumnVisible={setColumnVisible}
        resetColumns={resetColumns}
      />
    </Card>
  );
}

// ---- Appearance ------------------------------------------------------------

// THE TOP BAR KEEPS ITS THEME TOGGLE AND THIS IS NOT A SECOND SOURCE OF TRUTH. Both
// write App's `theme`, which is persisted with the rest of the view state, so they are
// two doors onto one value — the same relationship Prop OS > Accounts' Select buttons
// have with the top bar's account switcher. A settings screen with no appearance
// section, on the other hand, is a screen a user searches before finding the small
// icon in the bar.
export function SettingsAppearance() {
  const { theme = 'dark', setTheme } = useOutletContext();

  return (
    <Card className="set-card">
      <div className="set-rows">
        <Row label="Theme">
          {/* ToggleGroupExclusive, not a switch: a switch says on/off and neither theme
              is the off one. Exclusive selection of two named options is what this is. */}
          <ToggleGroupExclusive
            className="set-theme-toggle"
            value={theme === 'light' ? 'light' : 'dark'}
            onValueChange={setTheme}
            aria-label="Theme"
          >
            <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
            <ToggleGroupItem value="light">Light</ToggleGroupItem>
          </ToggleGroupExclusive>
        </Row>
      </div>
      <p className="set-note">
        The theme follows your account, not this browser, so it is the same on every
        device you sign in on.
      </p>
    </Card>
  );
}

// ---- Session ---------------------------------------------------------------

// SIGN OUT AND NOTHING ELSE, which is the honest scope of a "Security" section under
// Google OAuth: there is no password stored here to change, and no device list — the
// session is one httpOnly JWT cookie, so ending it is the only lever that exists.
// A section promising more than that would be chrome around a single button.
export function SettingsSession() {
  const { user, logout } = useAuth();

  return (
    <Card className="set-card">
      <div className="set-rows">
        <Row label="Signed in as">{user?.email || '—'}</Row>
        <Row label="Password">Not applicable — you sign in with Google</Row>
      </div>
      <div className="set-actions">
        <Button variant="danger" size="sm" onClick={logout}>Sign out</Button>
      </div>
    </Card>
  );
}
