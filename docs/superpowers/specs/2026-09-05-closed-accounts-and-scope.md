# Closed Accounts & Scope

**Decision record — Prop OS + Dashboard**

What happens when an account passes or breaches, and which accounts a page counts by
default.

- **Status:** agreed, not built
- **Supersedes:** the 2026-09-02 draft, and both original proposals
- **Touches:** Prop OS › Accounts, Dashboard, Analytics, Trade Log, Reports, Calendar,
  the account switcher (chrome, every page), the sync scheduler

---

## 0 · What changed from the 2026-09-02 draft, and why

The three-tier model and the acknowledgement handover survive intact — they are the
right shape. Nine things changed, each because the draft as written would have broken
against code that already exists.

| # | Change | Because |
|---|---|---|
| 0.1 | `open` is defined as a **negative** (§4) | The positive definition silently deleted every account with no challenge row — live-capital, manual and CSV accounts — from the dashboard |
| 0.2 | Acknowledgement lives on the **challenge row**, not the account (§2.2) | An account accumulates many settled challenge rows; an account-level flag pre-acknowledges the second pass and eats its strip |
| 0.3 | Suppression is keyed to the **event**, not a clock (§2.4) | `reopenChallenge` already exists and has no suppression, so today reopening loops: the engine re-settles on the next ingest, forever |
| 0.4 | Scope reads a denormalised `closed_at` column (§4) | `resolveScope` runs on every API call; the draft's definition needed a per-request join at the 1000-concurrent-user bar |
| 0.5 | One strip on the card, the rest via notifications (§2.3) | Account Health renders exactly one account, and the dashboard's panel heights are hardcoded |
| 0.6 | Auto-acknowledge emits a notification (§2.7) | Otherwise it does the exact unexplained-P&L-change that rule 2.1 exists to prevent |
| 0.7 | Closed accounts leave the sync schedule (§5) | `queue.js` filters on `is_active` only, so a blown account keeps consuming a serial MT5-farm slot every 3 hours |
| 0.8 | The dropdown says **open**, never "active" (§3.1) | The draft banned "active" in code and then used it in the UI, which is where the collision actually confuses people |
| 0.9 | Scope needs a real unset sentinel + a deploy migration (§3.6) | `null`, `''` and `'all'` currently all mean "everything"; `'all'` cannot stay the sentinel once it means something specific |

---

## 1 · Three tiers, not two

An account sits in exactly one of three tiers. Two of them appear in the account
dropdown; the third does not.

| Tier | What it means | In dropdown | Dashboard default | Every other analytic |
|---|---|---|---|---|
| **Open** | Anything still being traded: evaluation or funded and running; settled but **not yet acknowledged**; and every account with no challenge rules at all — live capital, manual, CSV | yes, top group | yes | yes |
| **Closed** | Settled **and** acknowledged, or retired by hand. Full history kept | yes, collapsed group | no | yes |
| **Archived** | Hidden by hand in Settings › Accounts (`is_active = false`) | no | no | no |

> **Close is not Archive.**
> Archiving drops an account's logins before any query runs, so its trades vanish from
> every analytic the user has. That is almost never what a trader wants for a blown
> account. **Closed keeps the history and only leaves the dashboard's default.
> Archived leaves everything.** The UI has to say so, or people will archive by mistake.

**1.1 · An account with no challenge is Open, and that is not a special case — it is
the default.** Live-capital, manual and CSV accounts have no `challenges` row and
therefore no status. They are the reason §4 defines Open as a negative rather than a
list of qualifying statuses. `propAccounts.js` already records the same distinction for
the Portfolio buckets: *"A state with no challenge at all has no bucket — that is a
live-capital account or one with no rules, and it is not 'evaluation by default'."*

**1.2 · In code, the words are `open` and `closed`.** Not "active" — `is_active`
already means "not archived", and the collision will cost someone an afternoon. §3.1
extends the same ban to the UI copy, which is where it will actually mislead a user.

---

## 2 · When an account passes or breaches

The engine already decides this from the trades. What is new is that **nothing
disappears from the dashboard until the trader says so.** The acknowledgement is a
handover, not a dismissable notice.

**1 · Detected automatically**
`resolveChallengeOutcome` marks the challenge `passed` or `breached`, and the account
moves bucket in Prop OS › Accounts straight away — Evaluation → Passed, or → Breached.

**2 · Still fully in scope**
KPI cards, calendar, recent trades and every dashboard aggregate keep counting this
account exactly as before. Today's winning trade — the one that *caused* the pass — does
not drop out from under the trader mid-session.

**3 · One last moment, on Account Health**
A strip appears on the Account Health card carrying the outcome and the number that
produced it.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ▍PHASE PASSED                                                              │
│  GoatFundedTrader 2-Step 25K reached its $2,000 target · +$2,047.30        │
│                              [ Close account ]  [ Not passed yet ]         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ ▍ACCOUNT BREACHED                                                          │
│  FTMO 100K hit its daily loss limit · −$5,180.00                           │
│                              [ Close account ]  [ Still trading ]          │
└─────────────────────────────────────────────────────────────────────────────┘
```

**4 · The trader answers**
- **Close account** → the challenge is marked acknowledged, the account becomes Closed
  and leaves the dashboard's default scope. It stays in Prop OS and in every other
  analytic. On a pass, this is also where *Add Phase 2 account* is offered.
- **Not passed yet / Still trading** → the account reopens (§2.4) and re-detection of
  *that same outcome* is suppressed.

**5 · Or nobody answers**
Once the account has been settled for 7 days **with no new trades**, treat it as
acknowledged and say so out loud (§2.7).

### Rules

**2.1 · Print the number on the strip.**
The dashboard total is about to change by exactly this much. Showing it is what
prevents "why did my P&L drop". Every other rule in this section exists to keep that
promise true.

**2.2 · The acknowledgement is stored on the CHALLENGE row, not the account.**
`challenges.acknowledged_at`, server-side. Local state would bring the strip back on
every reload.

> **Why not the account.** An account accumulates many settled challenge rows over its
> life — the partial unique index only guarantees one *active* one, and both
> `advanceChallenge` and `reopenChallenge` leave the old rows in place. So this sequence
> is ordinary: pass → close → reopen → trade → pass again. With the flag on the account
> it is already set the second time, so the second pass is silently pre-acknowledged and
> the trader never sees the strip for the pass that actually counted. Keying it to the
> challenge also gives §2.4 its suppression key for nothing.

**2.3 · One strip on the card. The rest go through notifications.**
The card shows the strip for the account currently selected in its chips. Other
accounts with an unanswered outcome get a dot on their chip, and each raises a
notification through the existing alerts system.

> **Why not stack them.** One bad day under one firm really can breach three accounts at
> once, so the draft was right that this happens. But Account Health renders exactly one
> account — `selectedAccount`, switched by the chips — and the dashboard's panel heights
> have been hardcoded (780 / 374 / 390) since customize-layout was deleted. Three
> stacked strips either overflow a locked height or force a layout change that the
> design language treats as an invariant. The notification system already exists, is
> already where "something happened to an account" belongs, and is visible from every
> page rather than only from the dashboard.

**2.4 · "Not passed yet" reopens the challenge AND suppresses that exact outcome.**
Suppression is keyed to the **event**, not to a window: store the outcome, the rule it
came from, and the day that produced it. Re-detection fires again only when the outcome
would be produced by a *different* event — a new breach day, or a different rule. Same
rule on the same day stays quiet.

> **Why this is the blocking item.** `reopenChallenge` is already built and already
> correct about the hard part: it reverts the latest settled row, guards two concurrent
> clicks inside the statement, and un-fails the challenge group but only when no sibling
> is still breached. What it has no notion of is suppression — so today, reopening sets
> `status = 'active'`, the next ingest runs `resolveChallengeOutcome`, sees the target
> still reached, and re-settles it. The strip returns forever. Without this rule, "Not
> passed yet" is a button that works for one tick.
>
> **Why keyed to the event rather than a duration.** A fixed window is arbitrary and
> either expires too early (the strip returns while the dispute is still open with the
> firm) or too late (a genuine second breach goes unreported). "The situation materially
> changed" needs a definition to be implementable, and the triggering event is the only
> one available that is both precise and cheap: a breach is a rule plus a day, and a
> different day is a different breach.

**2.5 · A reopened PASS should offer "Edit challenge rules" as its primary action, and
editing the rules clears suppression.**

> **Why.** When a trader says a pass is wrong, the engine has usually not miscounted —
> the rules it was given are wrong. Wrong profit target, wrong minimum trading days,
> wrong start balance, wrong start date. This project has already been bitten by exactly
> that: `start_date` defaulted to `now()`, which under-counted trading days on every
> account added mid-challenge. Suppression buys time; corrected rules are the actual
> fix, and re-evaluating against them is something we *want* to happen immediately. So
> editing the rules clears the suppression rather than being blocked by it.

**2.6 · Account Health is not an exception to scope.**
The strip shows because the account genuinely is still in scope, not because that one
card ignores the selector. No special case for anyone to forget later.

> **Why this is load-bearing.** The card is fed by the same `accountId` scope as every
> other panel on the page. Any design where the account leaves scope *before* the trader
> acknowledges it requires the prop endpoint to ignore the selector while every other
> endpoint honours it — a per-endpoint scope exception, hidden inside one card, which is
> the hardest possible place to notice it later. Keeping the account genuinely Open
> until acknowledged is what makes this rule free.

**2.7 · Auto-acknowledgement is announced.**
When the 7-day rule fires, raise a notification naming the account and the amount
leaving the default scope.

> **Why.** Rule 2.1 exists so the dashboard total never changes without the trader being
> shown the number. An auto-acknowledgement that fires silently does precisely that,
> just on day 8 instead of day 1. The alerts system already carries this kind of event,
> so the cost is a message, not a mechanism.

**2.8 · Buttons are named for what they do.**
*Close account* — not *OK* — because the button moves an account out of the trader's
dashboard, and it should say the word that names the tier it moves it to (§1). The
negative button stays situational: *Not passed yet* for a pass, *Still trading* for a
breach.

---

## 3 · The account dropdown

One menu, identical on every page, with two explicit "all" rows always both present — so
the same words never mean two different things on two pages. **Only the pre-selected row
differs.**

```
  ● All open accounts                      5
  ○ All accounts, incl. closed            14
  ─────────────────────────────────────────
  OPEN
  ○ GFT 2-Step 25K       · P1
  ○ FTMO 100K            · Funded
  ○ Alpha Capital 50K    · P2
  ─────────────────────────────────────────
  ▸ PASSED                                 3
  ▸ BREACHED                               6
```

**3.1 · The word is "open", in the UI as well as in the code.**
"All open accounts", and the group header is OPEN.

> **Why.** The draft banned "active" in code because `is_active` means "not archived" —
> then labelled the row *All active accounts*. The UI is where that collision does
> damage: the row includes a passed-but-unacknowledged account, which Prop OS is at that
> moment displaying in its **Passed** bucket. A trader reading "active" there has been
> told two different things about one account on two pages.

**3.2 · Defaults differ per page.**
Dashboard lands on *All open accounts*. Every other analytic — Analytics, Trade Log,
Reports, Calendar — lands on *All accounts, incl. closed*.

> **Why, and state it as a rule rather than a list.** A trader's real record includes the
> accounts they blew; hiding them from Analytics would flatter everyone with a fake track
> record. The rule is **"the Dashboard defaults to open; every other analytic defaults to
> all"**, written that way on purpose, so a surface built next year inherits the answer
> instead of guessing. The draft's list omitted Reports and the Calendar page, both of
> which aggregate.

**3.3 · An explicit pick wins everywhere, and "explicit" means the user CHANGED the
value.**
No choice made → each page uses its own default. A choice made → honoured on every page,
dashboard included.

> **Why the definition matters.** Analytics already defaults to *All accounts, incl.
> closed*. If merely landing on that row counted as a pick, then visiting Analytics —
> and clicking the row that was already selected — would silently switch the Dashboard
> to include closed accounts. Recording the pick only when the value actually changes
> keeps a deliberate tick sovereign without letting navigation impersonate one.

**3.4 · Passed and Breached are collapsed groups with counts.**
Six expanded breached accounts would bury the three being traded. Remember whether the
user expanded them.

**3.5 · The top bar states the scope, not just a count.**
`All open · 5`, and when closed accounts are in scope, `5 accounts · 2 closed`.

> **Why.** This one label prevents every "these numbers look wrong" question the design
> could otherwise produce, and it is the thing that makes the whole feature safe: the
> scope is never a hidden state.

**3.6 · Scope needs a real unset sentinel, and existing users must be read as unset.**
Three values have to be distinguishable: unset, `open`, `all`.

> **Why this is a migration and not just a constant.** `resolveScope` today collapses
> `null`, `''` and `'all'` to the same thing — every owned account. Once `'all'` means
> "including closed" specifically, it can no longer double as the not-chosen sentinel.
> And every existing user's stored `user_view_state` holds one of those three values, so
> without an explicit decision the deploy would read them all as a deliberate pick and
> quietly hand every current user a dashboard containing their closed accounts. **On
> deploy, treat every pre-existing stored value as unset.** Nobody chose it under
> semantics that did not exist yet.

**3.7 · Zero open accounts is a designed state, not a blank page.**
"No open accounts", with *Add account* and *View closed accounts*. Every brand-new user
starts here, and so does anyone whose accounts have all closed.

**3.8 · Prop OS › Accounts keeps its forced single-select.**
Unchanged by any of this.

---

## 4 · "Open" is defined once, on the server

The client asks for a scope by name and never works out the list itself. If each page
computes which accounts are open, the dashboard and Prop OS will eventually disagree
about an unacknowledged passed account — and that is a bug nobody finds for months.

```js
// src/domain/accounts/accounts.js — ownedLogins() / resolveScope()

open = is_active AND closed_at IS NULL

// requested scope values
'open'   → the above            (dashboard default)
'all'    → is_active            (analytics + trade log + reports + calendar default)
'12345'  → one login, or a comma-separated list — always honoured as given
unset    → the calling page's own default (§3.2)
```

**4.1 · Open is a NEGATIVE. An account is open unless something closed it.**

> **Why.** The draft defined it positively — *challenge status is active, OR the outcome
> is unacknowledged*. An account with no challenge row at all satisfies neither clause,
> so live-capital, manual and CSV accounts would have dropped out of `open` and vanished
> from the dashboard on deploy day. Stating it negatively makes "in scope" the default
> and closing an explicit act, which is both correct for those accounts and robust to any
> status we add later. It also hands us the manual retire action in §5.1 for free — that
> action just sets the column by hand.

**4.2 · `closed_at` is a column on `mt5_accounts`, denormalised on purpose.**
Written when the trader acknowledges an outcome (or the 7-day rule fires, or they retire
the account by hand); cleared by `reopenChallenge` and by un-retiring.

> **Why not derive it from `challenges` at read time.** `resolveScope` runs on **every**
> API request, and `ownedLogins` is currently a single-table query against
> `mt5_accounts`. Deriving openness needs the latest challenge row per account — a
> `DISTINCT ON` or a lateral join — on every request, and this project is explicitly
> building to a 1000-concurrent-user bar. One nullable timestamp keeps scope resolution
> at exactly its present cost, and makes this section's claim that Open is defined in
> one place literally true rather than aspirationally true. The challenge row remains
> the record of *what happened*; the column is the record of *what the trader decided*,
> which is a different fact with a different lifetime.

---

## 5 · Lifecycle side effects

**5.1 · A manual "Close account" action exists in Prop OS › Accounts and Settings ›
Accounts.**

> **Why it has to.** A funded account never auto-passes — `profitTargetState` returns
> null when a challenge carries no profit target, and every funded row stores NULL there,
> because a funded account's journey ends in payouts rather than in a pass. So without a
> manual action its only exits are a breach or Archive, and Archive is too strong: it
> would take the account's entire history out of Analytics. Retired funded accounts would
> otherwise sit in `open` forever, dragging a dead account through the dashboard of every
> trader who ever got funded.

**5.2 · A Closed account leaves the scheduled sync rotation. Manual sync stays
available.**

> **Why, and this one has money attached.** The sync queue currently filters on
> `a.is_active` alone, so a Closed account stays in the polling rotation. On the
> self-hosted MT5 farm that is a serial worker slot every three hours, spent on an
> account that will never produce another trade — and the farm's cost is the reason
> synced-account caps are the first thing to come back if plan tiers return. Manual sync
> stays available because a trader may legitimately want one final pull after closing.
>
> An Archived account already leaves the rotation and should continue to.

**5.3 · Closing an account does not touch the challenge group.**
Group status still follows the breach, exactly as `applyChallengeOutcome` writes it
today, and `reopenChallenge` still un-fails the group only when no sibling remains
breached. Acknowledgement is a display decision; it must not become a second opinion
about whether a challenge failed.

---

## 6 · Data model

Three additions. Nothing is dropped.

| Where | Column | Purpose |
|---|---|---|
| `mt5_accounts` | `closed_at timestamptz NULL` | The scope predicate (§4.2). Set on acknowledge / auto-acknowledge / manual retire; cleared on reopen and un-retire |
| `challenges` | `acknowledged_at timestamptz NULL` | Which *outcome* the trader has answered (§2.2) |
| `challenges` | `suppressed_outcome jsonb NULL` | `{ status, reason, day }` — the event a reopen silenced (§2.4). Cleared when the challenge's rules are edited (§2.5) |

`resolveChallengeOutcome` stays pure and keeps returning a verdict from state; the
suppression check is applied by its caller when deciding whether to *write* the outcome,
in the same split the domain already uses — the rule stays testable without a database.

---

## 7 · What is already built

Worth knowing before anyone estimates this.

- `resolveChallengeOutcome` — the pass/breach decision, pure and tested
- `applyChallengeOutcome` — the write, including the group-fail cascade
- `reopenChallenge` — the full undo, including un-failing the group only when no sibling
  is still breached, and a concurrency guard inside the statement
- Prop OS › Accounts, with Evaluation / Funded / Passed / Breached buckets
- `AccountAlertBanner`, with a wired action button on the risk states (`Lock account`)
  and `action: 'challenge'` already declared but unwired on `PHASE_PASSED` /
  `TARGET_REACHED`
- Archive, as a reversible `is_active = false` that removes an account from the switcher
  and every aggregate
- The notifications system §2.3 and §2.7 route through

The genuinely new work is: two scope values, three columns, the strip's two buttons,
suppression, the dropdown's grouping, and the sync-rotation filter.

---

## 8 · Still to pin down

- **Whether a Closed account's chip stays in the Account Health card's chip row.** It is
  out of the dashboard's default scope, so probably not — but a trader who has just
  closed one may expect to see it for the rest of the session.
- **Whether "Add Phase 2 account" ships with the first cut or follows it.** It is the
  most useful thing on the strip and the most work; the strip is shippable without it.
- **Button wording, once it is on screen.** *Close account* / *Not passed yet* / *Still
  trading* are the working set.
