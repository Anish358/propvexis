# PropVexis AI Program — Finalized Scope

**Status:** scope locked 2026-08-12. Sequencing and per-feature design deliberately NOT decided here.
**Governing constraint:** every feature must deliver real value to a working trader. Grounded in the
user's own data, allowed to say "not enough evidence," never guessing about his money.

## The organizing principle

**PropVexis computes; the LLM structures and explains.** Every feature below does one of two jobs.
Anything outside these two is where hallucination lives, and is out of scope by definition.

- **Job 1 — Structuring.** Unstructured input → one of our existing closed schemas. Output is
  validatable against a schema we own, so a wrong answer is caught, not shipped.
- **Job 2 — Judgment.** Given N slices *we* computed, say which few matter and why. Grounded,
  because the numbers are never the model's.

## Platform layer — `src/domain/ai/`

Serves all 20 build units, so it is load-bearing rather than incidental. Mirrors the existing
`platform/` vs `domain/` split; no domain logic in it.

| Module | Job |
|---|---|
| `client.js` | `@anthropic-ai/sdk` wrapper — model choice, retries, timeouts, streaming, `stop_reason: 'refusal'` + `fallbacks`. **Degrade-don't-die**, same rule as `platform/redis.js` |
| `prompts/` | Versioned registry. Every output stamped with `prompt_version` — without it, regressions are invisible |
| `schemas.js` | One closed output schema per feature, enforced via `output_config.format`. The anti-hallucination layer |
| `grounding.js` | Per-user context builders (strategies, rules, enums, aggregates), **stable-prefix-first** — prompt caching lives or dies here |
| `budget.js` | Per-user token accounting, monthly quota, plan gating. **Fail-closed**, like `domain/billing/plans.js` |
| `redact.js` | Scrub before egress. Nothing leaves the box but trade data |
| `evals/` | Golden set + accuracy harness. Most of these features make claims about the user's money |
| `jobs.js` | Batches API runner (50% cost) + on-demand path |

New tables: `ai_runs` (per-call token/cost audit), `trade_ai_suggestions`.

**Model split, driven by cache floors.** Sonnet 5 for structuring and high-volume tagging
(1024-token cache minimum); Opus 5 at `low`/`medium` effort for judgment and narrative.
**Not Haiku for anything cached** — its 4096-token floor means a ~2K rules prefix silently fails to
cache, making the cheap model the expensive one.

**Trust model, applied everywhere.** AI output never overwrites user data. It lands in a suggestion
record with `confidence`, `model`, `prompt_version`; the user's accept-or-correct becomes the
labelled eval set. This is what makes accuracy measurable instead of asserted.

**Gating.** Pro+ (mirrors `reports` in `domain/billing/plans.js`) — first features with real
per-user COGS. Hard monthly token quota per user, enforced in `budget.js`.

## Locked features

### Job 1 — Structuring

| # | Feature | Eats | Writes | Notes |
|---|---|---|---|---|
| 1 | Auto-tagger | mechanical fields, `strategies` enum, `candles` | `trade_ai_suggestions` → `setup`/`probability`/`mtf_phase` | Candles auto-enqueued on every EA ingest, so richer for EA accounts; degrades to mechanical-only for manual/CSV. `adherence` narrows candidates deterministically before the model is called |
| 2 | NL → strategy rules | free text | `strategies.rules` | Closed `RULE_TYPES` vocab. Switches on all adherence analytics |
| 3 | NL → pre-trade checklist | free text | `strategies.checklist` | **Requires prerequisite P2.** Column is currently dead |
| 4 | Smart CSV mapper | arbitrary broker CSV headers | `csv.js` mapping + confidence report | Removes the first-run wall for every non-MT5 user |
| 5 | Prop firm rule ingestion | pasted firm rules text | `challenges` config | Paste-and-confirm. URL fetch rejected — firm sites JS-render/block. Wrong DD rule = wrong breach math, so human confirm is mandatory |
| 6 | Journal scribe | braindump text | `day_notes` | Text-only. Voice would need a separate speech API, not Claude |
| 7 | Backfill from `comments` | existing `comments` text | `trade_ai_suggestions` | **Verify V1.** One-off; bootstraps #1's eval set with real labels |
| 8 | Mistake / emotion taxonomy | `day_notes` + `comments` | new dimension | Needs new column + filter-registry entry + UI. Value scales with how much the user writes |
| 9 | NL → filters ("ask your journal") | free text | `filterDefs.js` filter object | **No text-to-SQL.** The registry is already data; NL targets it and executes through the existing aggregation layer. Zero injection surface |

### Job 2 — Judgment

| # | Feature | Eats | Notes |
|---|---|---|---|
| 10 | Analyst / leak-finder | `statsSql` + `adherence` | Depth depends on #1 and #2 having populated data |
| 11 | Prop challenge coach | `challenges`, `equity_snapshots`, `finance.js`, `insights.js` | Days-to-target, safe risk-per-trade, breach probability computed deterministically; model narrates |
| 12 | Report exec summary | `reports.js` | Already Pro+-gated and already composes Journal+Prop+payouts |
| 13 | Breach post-mortem | `challenges.breach_reason` + trade sequence | **Verify V2.** Only fires on a breached challenge |
| 14 | Calendar correlation | `calendar_events` | **Requires prerequisite P1.** Produces no findings until months of history accumulate — accepted deliberately |
| 15 | Trade post-mortem | `candles`, `max_r`, `mfe_pips` | Entirely about the price path, so no candles = no feature. **EA accounts only, hard** — cannot degrade like #1 |
| 16 | Behaviour guard | `adherence`, `alerts`, `notifications` | **Post-hoc, not preventive** — the EA posts closed trades, so the earliest detection is after the revenge trade already closed. Detection deterministic, phrasing model-only. P2 makes prevention possible later |

### Composite

| # | Feature | Notes |
|---|---|---|
| 17 | AI onboarding | "Describe how you trade" → strategies + rules + checklist + account in one pass. Bundles #2 + #3 + #5. Targets the empty state that churns new signups. Plugs into the existing onboarding wizard |

## Prerequisites (not AI features)

| ID | Build | Unblocks | Note |
|---|---|---|---|
| P1 | `calendar_events` table + forward accumulation | #14 | `platform/calendar.js` persists nothing today — in-process cache, ~30min TTL, current week only. No event history exists |
| P2 | Pre-trade logging surface + checklist schema + UI | #3, #17, and #16's preventive version | **Largest scope item on the list.** PropVexis has never had a pre-trade input path — it ingests closed trades only. A product module that happens to use AI |

## Verifications pending against prod

| ID | Question | Blocks |
|---|---|---|
| V1 | How much `comments` text actually exists? | #7's value |
| V2 | Has any challenge ever breached? | #13 having anything to analyze |

## Cost envelope

Roughly **$0.60–0.80 per active user per month** across all 17 at moderate use. Fine against any
sane Pro price. A power user could 20× it, which is why the hard quota in `budget.js` is not
optional — it is what keeps the tier profitable.

Batch-and-async by default keeps every AI call off the ingest hot path.

## Rejected on purpose

Recorded so the list reads as a decision, not an omission.

- **Trade signals / "should I take this trade"** — regulatory posture (see the SEBI note in the
  post-name registrations checklist) and liability. Not journaling.
- **Price prediction / forecasting** — same.
- **Anything that touches the account** — no execution, no order placement, ever.
- **Dashboard chatbot mascot** — no anchor to data.
- **An "AI score" per trade** — unfalsifiable by construction.
- **News sentiment** — no data ownership, low signal.
- **Peer benchmarking** — privacy plus tiny N. Revisit at scale.

## Known collision

The active priority in memory (`now-execution-queue`) is scale-and-hardening to the
≥1000-concurrent-user bar. This program adds COGS, an external dependency, and latency. The
batch-and-async design keeps it off the hot path, but it is a separate track and should be
sequenced deliberately rather than by drift.

## Deliberately not decided here

Build order, per-feature design, UI surfaces, and prompt content. Each feature gets its own
spec when called for.
