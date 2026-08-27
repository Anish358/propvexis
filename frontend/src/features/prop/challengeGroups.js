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

/**
 * THE CHALLENGE'S JOURNEY, as the rail draws it: one stop per phase, each carrying the
 * account running it and that account's live engine state.
 *
 * THIS IS THE GROUP-WIDE TWIN of challengesData.challengeLifecycle, which walks ONE
 * account's history rows. Both are needed and they are not the same question: that one
 * answers "how many attempts has this account made at its phase", this one answers
 * "which of this challenge's phases have accounts, and what happened to each". A
 * challenge's phases now live on DIFFERENT accounts, which is the whole of 0027.
 *
 * `statesByLogin` is a Map(login -> challengeState) from GET /api/prop/portfolio, which
 * every prop surface already loads. A phase whose account has no active challenge has no
 * state — that is what a PASSED phase looks like now — so `state` is null there and the
 * figures fall back to what the account row itself knows.
 *
 * THE STATUS WORDS ARE THE RAIL'S OWN (complete | active | breached | upcoming), so
 * LifecycleRail draws this with no new branch: a passed phase is ticked, a breached one
 * crossed, the running one lit, and a phase with no account yet is the upcoming stop it
 * has always been.
 *
 * `selectable` and `addable` are the INTERACTION, and they are deliberately different
 * facts. A stop is selectable when there is something to show — an account of its own,
 * or an invitation to add one. It is addable only at the phase the firm has just
 * issued, which is `phaseToAdd`'s single answer. Every other stop is inert, because
 * clicking a phase that does not exist and cannot be created has nothing to do.
 */
export function groupLifecycle(group, { statesByLogin } = {}) {
  const phases = challengePhases(group);
  const { phase: addPhase } = phaseToAdd(group);
  const states = statesByLogin instanceof Map ? statesByLogin : new Map();

  return phases.map((stage, i) => {
    const account = stage.account;
    const state = account?.mt5_login != null
      ? states.get(String(account.mt5_login)) ?? null
      : null;
    const status = account == null
      ? 'upcoming'
      : stage.status === 'passed' ? 'complete'
        : stage.status === 'breached' ? 'breached' : 'active';
    const addable = stage.phase === addPhase;
    return {
      id: stage.phase,
      label: stage.label,
      step: i + 1,
      of: phases.length,
      attempts: stage.attempts,
      account,
      state,
      status,
      addable,
      selectable: account != null || addable,
      // The rail reads `current` to mark the stop it lights. The challenge's current
      // phase is the one being TRADED — not the one waiting to be added, which has no
      // account and no figures to light.
      current: status === 'active',
    };
  });
}

/** The stop a card should open on: the phase being traded, else the one waiting to be
 *  added, else the last one that happened. Never nothing, so a card always has a body. */
export function defaultStage(stages = []) {
  return (stages.find((s) => s.current)
    || stages.find((s) => s.addable)
    || [...stages].reverse().find((s) => s.account)
    || stages[0]
    || null)?.id ?? null;
}

/**
 * One card row per CHALLENGE, grouped by firm — what Prop OS › Challenges renders.
 *
 * `groups` — GET /api/prop/challenges' `groups`.
 * `states` — GET /api/prop/portfolio's `states`: one challengeState per login.
 *
 * BREACHED AND FAILED CHALLENGES ARE KEPT here, unlike in the wizard's list: a challenge
 * you broke is still one of your challenges, and hiding it would make the firm's card
 * count disagree with the trader's memory. The wizard drops them because you cannot ADD
 * to one; this page shows them because you can still read one.
 *
 * Firms come from the challenges themselves — there is no hardcoded firm list — and the
 * key is `firmKeyOf`, so a trader who typed "FTMO" on one challenge and picked FTMO from
 * the catalog on another still sees one firm.
 */
export function challengeGroupRows({ groups = [], states = [] } = {}) {
  const byLogin = new Map((Array.isArray(states) ? states : [])
    .map((s) => [String(s.account_id), s]));

  return (Array.isArray(groups) ? groups : []).map((g) => {
    const stages = groupLifecycle(g, { statesByLogin: byLogin });
    return {
      id: g.id,
      group: g,
      name: challengeName(g),
      size: g.start_balance ?? null,
      status: g.status,
      firmKey: firmKeyOf(g),
      firmName: g.firm_name || 'Other',
      stages,
      // How far along the journey is, as a count the card can print beside the size.
      filled: stages.filter((s) => s.account).length,
      addPhase: stages.find((s) => s.addable)?.id ?? null,
    };
  });
}

/**
 * Group the rows by prop firm — the module's locked hierarchy (Prop Firm → Challenges),
 * which holds even when "All" is selected.
 *
 * The GROUP-WIDE twin of challengesData.groupByFirm, which groups account rows. Ordered
 * the same way: by how many challenges the trader runs at each firm, then by name, so the
 * tab row and the sections under it are never in two different orders.
 *
 * WITHIN a firm, the challenges waiting for their next phase come FIRST — the same
 * ordering the wizard's list uses, for the same reason: it is the one thing on the page
 * the trader can act on. Then the newest, then by name so the order is stable.
 */
export function groupChallengesByFirm(rows = []) {
  const firms = new Map();
  for (const r of rows) {
    if (!firms.has(r.firmKey)) firms.set(r.firmKey, { key: r.firmKey, name: r.firmName, rows: [] });
    firms.get(r.firmKey).rows.push(r);
  }
  for (const f of firms.values()) {
    f.rows.sort((a, b) => {
      if ((a.addPhase != null) !== (b.addPhase != null)) return a.addPhase != null ? -1 : 1;
      const at = new Date(a.group.created_at ?? 0).getTime();
      const bt = new Date(b.group.created_at ?? 0).getTime();
      return bt - at || String(a.name).localeCompare(String(b.name));
    });
  }
  return [...firms.values()].sort(
    (a, b) => b.rows.length - a.rows.length || String(a.name).localeCompare(String(b.name)),
  );
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
