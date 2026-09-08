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
 * unchanged — the seven states differ only in hue, glyph, sentence and action, which is
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
 * @param {object}   data           one entry from GET /api/prop (challengeState)
 * @param {function} onFixBalance   adopt the broker's balance as the starting balance, or
 *                                  null when there is no account record to write to
 * @param {boolean}  fixingBalance  that write is in flight
 * @param {function} onCloseAccount answer a settled outcome, or null when there is none
 *                                  waiting (the account is still running, or already closed)
 * @param {function} onReject       the same moment's "I am still trading this"
 * @param {boolean}  answering      either of those writes is in flight
 */
export default function AccountAlertBanner({
  data, onFixBalance = null, fixingBalance = false,
  onCloseAccount = null, onReject = null, answering = false,
}) {
  const alert = accountAlertFor(data);
  if (!alert) return null;

  const Icon = ICON[alert.icon] ?? AlertTriangle;

  /* THE ACTION IS RESOLVED HERE, not in accountAlert.js, because only this layer knows
   * whether the account can be acted on at all — the handlers are absent when the card
   * has no account record behind the state (an archived login still in a stale scope,
   * say), and a button that cannot do its one job is worse than no button.
   *
   * THE DRAWDOWN STATES NOW END WITH NO BUTTON, and that is deliberate (owner
   * 2026-09-06). They used to offer "Lock account" — archive it, PropVexis's only lever
   * on a dying account, since it cannot reach into a prop firm and disable a login. But
   * archiving takes the account's entire history out of every analytic the trader has,
   * which is close to the worst thing to hand someone at the moment their account dies;
   * and the account that has actually settled now gets Close account instead, which
   * keeps the history. A warning on a RUNNING account has nothing for the app to do
   * anyway — naming the rule and quoting the number IS the job. Archiving still exists,
   * one deliberate step away, in Settings › Accounts. */
  let action = null;
  if (onCloseAccount && onReject) {
    /* THE STRIP THAT ENDS AN ACCOUNT'S LIFE (owner spec 2026-09-05), and it comes FIRST
     * in this chain deliberately: AN UNANSWERED OUTCOME OUTRANKS EVERY OTHER ACTION.
     * Every other intent here is about an account that is still running; this one is
     * about an account that has finished.
     *
     * THE ORDER IS STATED BECAUSE GETTING IT WRONG WAS SILENT. This branch was written
     * third at first, behind a `action === 'lock'` branch that has since been deleted —
     * and a breach alert carried exactly that intent, so on a breached account the lock
     * branch matched and these buttons never rendered. It looked like the feature had
     * not shipped. It only showed on a pass, which is the half that is not about losing
     * an account, so the half that matters most was the half that was dead.
     *
     * Shown only while the phase has SETTLED and the trader has not answered — the card
     * decides that, because only it holds the account record carrying `closed_at`.
     *
     * WHY THERE IS A SECOND BUTTON AT ALL. The engine settles off the trades it has, and
     * it can be wrong about a real account: a stale EA balance, a trade that arrives
     * late, a firm that counts a technicality its own way, a breach the firm then
     * reinstated. With only a confirm, a wrong verdict would move the account out of the
     * dashboard with no way back — and on a pass, a wrong verdict tells someone to go and
     * add a Phase 2 login their firm never issued, which is the one mistake in this app
     * that costs real money. The negative is worded for what the trader means rather than
     * for what the database does: they are saying "I am still trading this".
     *
     * THE PRIMARY SAYS "CLOSE ACCOUNT" AND NOT "OK" because it does something — it moves
     * the account to the Closed tier and out of the dashboard's default scope. A button
     * that changes what the next screen shows should name the change. */
    const rejectLabel = data?.status === 'breached' ? 'Still trading' : 'Not passed yet';
    action = (
      <>
        <AccountBannerAction tone={alert.tone} onClick={onCloseAccount} disabled={answering}>
          {answering ? 'Closing…' : 'Close account'}
        </AccountBannerAction>
        <AccountBannerAction tone={alert.tone} onClick={onReject} disabled={answering}>
          {rejectLabel}
        </AccountBannerAction>
      </>
    );
  } else if (alert.action === 'balance' && onFixBalance) {
    /* THE ONLY WRITE ANY BANNER OFFERS, and it is offered rather than performed: the app
     * cannot tell which of the two numbers is wrong. A demo account added from a $25K
     * prop template and a real $25K account whose balance read is stale are the same
     * signal here, and silently adopting the broker's figure would REWRITE THE RULES a
     * trader deliberately configured — on a funded account mid-drawdown that means
     * scoring them against a band their firm never set. So the trader confirms, and the
     * card's dialog quotes both numbers before it does anything. */
    action = (
      <AccountBannerAction tone={alert.tone} onClick={onFixBalance} disabled={fixingBalance}>
        {fixingBalance ? 'Updating…' : 'Use broker balance'}
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
