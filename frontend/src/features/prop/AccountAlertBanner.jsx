import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Target } from 'lucide-react';
import { AccountBanner, AccountBannerAction } from '@/components/primitives';
import { accountAlertFor } from './accountAlert.js';

/* THE ACCOUNT ALERT BANNER — the one strip at the top of the account card.
 *
 * A COMPOSITION, WHICH IS WHY IT IS HERE AND NOT IN primitives/. It writes no styles of
 * its own: `AccountBanner` owns every colour (five toned variants, all literal Tailwind
 * strings — utilities do not compile in features/, and a class written here would emit
 * nothing, silently), and accountAlert.js owns every threshold and every sentence. This
 * file is the join: state -> glyph, and intent -> control. DESIGN-LANGUAGE §1 build
 * order, third rung.
 *
 * IT REPLACED A HARD-CODED RED STRIP that fired on a blended health score and always
 * said the same two things. The strip's structure, spacing, type and height are
 * unchanged — the six states differ only in hue, glyph, sentence and action, which is
 * what makes them read as one component changing state.
 *
 * THE GLYPHS ARE THE METERS' GLYPHS. AccountDetails maps warn -> AlertTriangle and
 * bad -> AlertCircle, and states plainly why: "a warn meter is a triangle and a bad one
 * is a filled circle, everywhere, or the shapes stop meaning anything". The banner sits
 * four pixels above those meters, so it uses the same two shapes for the same two
 * severities — the breach strip is a circle, not the triangle it used to draw, because
 * a triangle now means "warning" on this card.
 *
 * ESCALATION IS NEVER COLOUR ALONE (§14, WCAG): the glyph changes, the label is written
 * out in words, the sentence quotes the rule and its number, and the strip's ARIA role
 * follows its severity.
 */

const ICON = {
  danger: AlertCircle,
  warning: AlertTriangle,
  success: CheckCircle2,
  target: Target,
};

/**
 * @param {object}   data       one entry from GET /api/prop (challengeState)
 * @param {function} onLock     archive this account, or null when the card cannot act
 *                              on it (no matching account record loaded)
 * @param {boolean}  locking    the archive request is in flight
 */
export default function AccountAlertBanner({ data, onLock = null, locking = false }) {
  const alert = accountAlertFor(data);
  if (!alert) return null;

  const Icon = ICON[alert.icon] ?? AlertTriangle;

  /* THE ACTION IS RESOLVED HERE, not in accountAlert.js, because only this layer knows
   * whether the account can be acted on at all — `onLock` is absent when the card has
   * no account record behind the state (an archived login still in a stale scope, say),
   * and a button that cannot do its one job is worse than no button.
   *
   * "LOCK ACCOUNT" IS THE HONEST NAME FOR THE ONLY REAL ACTION. PropVexis cannot reach
   * into a prop firm and disable a login — no connector does that — so this stops
   * PropVexis TRACKING the account, which is a genuine thing a trader in a stop-trading
   * zone may want. The confirm dialog the card owns says exactly that. */
  let action = null;
  if (alert.action === 'lock' && onLock) {
    action = (
      <AccountBannerAction tone={alert.tone} onClick={onLock} disabled={locking}>
        {locking ? 'Locking…' : 'Lock account'}
      </AccountBannerAction>
    );
  } else if (alert.action === 'challenge') {
    // Good news points at the challenge it belongs to — the surface that can actually
    // record the pass and take the next phase's login.
    action = (
      <AccountBannerAction tone={alert.tone} render={<Link to="/prop/challenges" />}>
        View challenge
        <ArrowRight aria-hidden="true" />
      </AccountBannerAction>
    );
  }

  return (
    <AccountBanner
      tone={alert.tone}
      icon={<Icon aria-hidden="true" />}
      label={alert.label}
      action={action}
    >
      {alert.message}
    </AccountBanner>
  );
}
