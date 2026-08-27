// THE MULTI-ACCOUNT CHALLENGE, as pure functions.
//
// A challenge (migration 0027's `challenge_groups`) owns one account per phase: the
// Phase 1 login the firm issued, then the Phase 2 login it issued after that one
// passed, then the funded one. GET /api/prop/challenges returns the groups with their
// accounts and what each account's phase DID; everything this module answers is
// derived from that payload plus the account-type taxonomy in propFirms.js.
//
// WHY THE LADDER IS DECIDED HERE AND NOT ON THE SERVER. `phasesFor` is catalog
// knowledge and the catalog lives in frontend/src, which the backend cannot import
// (deploy rsyncs `src db scripts ea` plus `frontend/dist`) — the same boundary
// validateProvision draws for the firms' drawdown percentages. So the API reports
// history and this decides what is missing from it.
//
// JSX-FREE AND REACT-FREE, and it must stay that way: test/challenge-groups.test.js
// imports it directly under node:test, where CI installs BACKEND dependencies only.
// An import that reaches React, react-router-dom or lib/api.js fails in CI and
// nowhere else. propFirms.js is safe — pure data, already read by node:test.
import { challengeStages, firmKeyOf } from './challengesData.js';
import { PHASE_LABEL } from './propAccounts.js';
import { SHORT_PRODUCT_LABEL, sizeLabel } from './propFirms.js';

/* THE FIRM KEY IS challengesData's, imported rather than restated, for the reason
 * that file gives: 'other' is the firm_id of EVERY unlisted firm, so keying on the id
 * alone would file FundedNext and Alpha Capital as one firm. A group row carries
 * `firm_id` and `firm_name` under exactly the names it reads, so it applies unchanged.
 * Re-exported because the surfaces that group challenges need it too. */
export { firmKeyOf };

/**
 * The phases of a challenge, each with the account that is running it.
 *
 * `stages` comes from the account TYPE (a 2-Step has p1/p2/funded, a 3-Step adds p3),
 * via challengeStages — which falls back to the firm's catalog entry and then to the
 * two-evaluation default, so a challenge created before the fixed taxonomy still draws
 * a plausible journey rather than none.
 *
 * A stage's account is the LATEST one filed at that phase, because a re-take is a
 * second account at the same phase and the current one is what the trader is standing
 * in. Accounts arrive oldest-first from the API (its ORDER BY), so the last match wins.
 */
export function challengePhases(group) {
  const g = group || {};
  const accounts = Array.isArray(g.accounts) ? g.accounts : [];
  const stages = challengeStages(g.firm_id, g.product_id);
  return stages.map((phase) => {
    const matches = accounts.filter((a) => a.phase === phase);
    const account = matches.length ? matches[matches.length - 1] : null;
    return {
      phase,
      label: PHASE_LABEL[phase] ?? phase,
      account,
      // The phase's own verdict, straight off its latest challenge row. `null` when no
      // account has been filed at this phase yet — which is not the same fact as
      // 'active', and the difference is the whole point of the Add-next-phase button.
      status: account?.challenge_status ?? null,
      attempts: matches.length,
    };
  });
}

/**
 * Which phase may be added to this challenge right now, and if none, why not.
 *
 * THE ONE CASE THAT MATTERS: the phase before it has PASSED and this one has no
 * account. That is the moment the firm issues the next login, and it is what the
 * trader came to the wizard to record.
 *
 * EVERY OTHER CASE IS REFUSED WITH A REASON rather than left addable, because each
 * would create an account that cannot exist:
 *   · the current phase is still running — the firm has issued nothing;
 *   · it breached — the challenge is over (the group is already 'failed', so this is
 *     belt and braces for a stale payload);
 *   · every phase already has an account — there is nothing left to issue.
 * The reason is shown on the disabled row, because a greyed row with no sentence reads
 * as a bug in our app rather than as the state of the challenge (§7.5's rule, applied
 * to a list instead of a card).
 *
 * A CHALLENGE WITH NO ACCOUNTS AT ALL is addable at its first phase. That is the
 * group whose only account was deleted — the record survives ON DELETE SET NULL — and
 * offering its Phase 1 is better than orphaning the challenge.
 */
export function phaseToAdd(group) {
  if (!group || group.status !== 'active') {
    return { phase: null, reason: 'This challenge is no longer running.' };
  }
  const phases = challengePhases(group);
  if (!phases.length) return { phase: null, reason: 'This challenge has no phases to add.' };

  for (let i = 0; i < phases.length; i += 1) {
    const stage = phases[i];
    if (stage.account) {
      if (stage.status === 'breached') {
        return { phase: null, reason: `${stage.label} breached — this challenge is over.` };
      }
      // Still running: nothing has been issued, so nothing can be added. Checked
      // INSIDE the loop rather than after it, so a challenge sitting at Phase 2 is
      // refused on Phase 2's account rather than on a later empty stage.
      if (stage.status !== 'passed') {
        return { phase: null, reason: `${stage.label} is still running.` };
      }
      continue;
    }
    // The first empty stage. It is addable only if something passed into it — the
    // first stage of a challenge with no accounts at all is the exception above.
    const previous = i === 0 ? null : phases[i - 1];
    if (previous == null || previous.status === 'passed') return { phase: stage.phase, reason: null };
    return { phase: null, reason: `${previous.label} has not passed yet.` };
  }
  return { phase: null, reason: 'Every phase of this challenge already has an account.' };
}

/** Is this challenge waiting for its next phase's account? The sort key, named. */
export const isAwaitingPhase = (group) => phaseToAdd(group).phase != null;

/**
 * The name a challenge goes by in a list: firm, type, size.
 *
 * Built from the GROUP rather than from any one account's label, because the accounts
 * are named per phase ("GFT 2-Step 25K P2") and the challenge is the thing they are
 * phases of. Falls back through what is present, so a challenge whose firm was typed
 * by hand still reads as something.
 */
export function challengeName(group) {
  const g = group || {};
  const parts = [String(g.firm_name || '').trim() || 'Other'];
  const short = SHORT_PRODUCT_LABEL[g.product_id];
  if (short) parts.push(short);
  if (g.start_balance != null) parts.push(sizeLabel(g.start_balance));
  return parts.join(' ');
}

/**
 * The challenges a new account at THIS firm could join, most useful first.
 *
 * FILTERED BY FIRM, because the wizard has already asked which firm (page 2) and a
 * Phase 2 login from GoatFundedTrader cannot be a phase of an FTMO challenge. Matched
 * on `firmKeyOf`, so the unlisted-firm escape hatch groups by the typed NAME — 'other'
 * is every unlisted firm's id, and matching on it would offer a FundedNext challenge
 * to an Alpha Capital account.
 *
 * SORTED BY WHETHER THE TRADER CAN ACT ON IT (owner spec): the challenges whose next
 * phase is ready to be added come first, because that is why they opened this list.
 * The rest follow, newest first — a challenge started this week is likelier to be the
 * one meant than one from six months ago. Ties by name so the order is stable between
 * loads rather than by whatever the payload happened to hold.
 *
 * FAILED CHALLENGES ARE DROPPED ENTIRELY, not shown disabled. The firm has taken the
 * account back; there is no phase of it that will ever be added, so offering it would
 * be offering a dead end. Everything still running is listed even when it cannot be
 * added to yet — the trader needs to see that Phase 1 has not passed, rather than
 * wonder where their challenge went.
 */
export function joinableChallenges(groups, { firm_id, firm_name } = {}) {
  const wanted = firmKeyOf({ firm_id, firm_name });
  return (Array.isArray(groups) ? groups : [])
    .filter((g) => g.status === 'active' && firmKeyOf(g) === wanted)
    .map((g) => {
      const { phase, reason } = phaseToAdd(g);
      return {
        group: g,
        id: g.id,
        name: challengeName(g),
        phases: challengePhases(g),
        addPhase: phase,
        blockedReason: reason,
      };
    })
    .sort((a, b) => {
      if ((a.addPhase != null) !== (b.addPhase != null)) return a.addPhase != null ? -1 : 1;
      const at = new Date(a.group.created_at ?? 0).getTime();
      const bt = new Date(b.group.created_at ?? 0).getTime();
      return bt - at || String(a.name).localeCompare(String(b.name));
    });
}

/** The fields a joined challenge dictates for the account being created. The RULES are
 *  deliberately absent: a firm's Phase 2 drawdowns are routinely not its Phase 1 ones,
 *  so those stay the trader's to enter (and the server refuses to inherit them either).
 */
export function inheritedFields(group, phase) {
  const g = group || {};
  return {
    challenge_group_id: g.id ?? null,
    firm_id: g.firm_id ?? null,
    firm_name: g.firm_name ?? null,
    product_id: g.product_id ?? null,
    start_balance: g.start_balance ?? null,
    phase: phase ?? null,
  };
}
