// Objective rule adherence: does a trade obey its strategy's rules?
//
// Rules are OBJECTIVE predicates over the MECHANICAL fields the EA already
// captures (session, direction, SL size, symbol, open time) — things knowable
// at/around entry, never the outcome. So adherence is derived, not self-
// reported: the journal can say "8 of these trades broke your ≤15-pip SL rule"
// without the trader ticking a box. This is the Phase 2 differentiator.
//
// Everything here is PURE (no DB, no clock) so it unit-tests cleanly and can be
// reused by the aggregation layer.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// The supported rule vocabulary. Each entry knows how to evaluate one rule
// against a trade, returning true (pass), false (break), or null (not evaluable
// — the trade lacks the field, so it's neither followed nor broken).
export const RULE_TYPES = {
  session:   { evaluable: (t) => t.session != null,
               pass: (t, r) => (r.values || []).includes(t.session) },
  direction: { evaluable: (t) => t.direction != null,
               pass: (t, r) => t.direction === r.value },
  max_sl:    { evaluable: (t) => t.sl_size_pips != null,
               pass: (t, r) => Number(t.sl_size_pips) <= Number(r.value) },
  min_sl:    { evaluable: (t) => t.sl_size_pips != null,
               pass: (t, r) => Number(t.sl_size_pips) >= Number(r.value) },
  symbols:   { evaluable: (t) => (t.symbol_base || t.symbol) != null,
               pass: (t, r) => (r.values || []).includes(t.symbol_base || t.symbol) },
  weekdays:  { evaluable: (t) => !!t.open_time,
               pass: (t, r) => (r.values || []).includes(WEEKDAYS[new Date(t.open_time).getUTCDay()]) },
  hours:     { evaluable: (t) => !!t.open_time,
               pass: (t, r) => {
                 const h = new Date(t.open_time).getUTCHours();
                 return h >= Number(r.from) && h <= Number(r.to);
               } },
};

// Evaluate one rule against a trade: true | false | null (not evaluable).
export function evaluateRule(trade, rule) {
  const spec = rule && RULE_TYPES[rule.type];
  if (!spec) return null;
  if (!spec.evaluable(trade)) return null;
  return !!spec.pass(trade, rule);
}

// Adherence status for a trade against a strategy's rule set:
//   'norules'     – the strategy defines no rules
//   'unassessed'  – rules exist but none could be evaluated (missing fields)
//   'followed'    – every evaluable rule passed
//   'broken'      – at least one evaluable rule failed (brokenRules lists them)
export function evaluateAdherence(trade, rules) {
  if (!Array.isArray(rules) || rules.length === 0) return { status: 'norules', brokenRules: [] };
  let evaluable = 0;
  const brokenRules = [];
  for (const rule of rules) {
    const res = evaluateRule(trade, rule);
    if (res === null) continue;
    evaluable += 1;
    if (res === false) brokenRules.push(rule.type);
  }
  if (evaluable === 0) return { status: 'unassessed', brokenRules: [] };
  return { status: brokenRules.length ? 'broken' : 'followed', brokenRules };
}

// Adherence for a single trade given a Map of strategy name -> rules array
// (built from the user's catalog). Resolves the trade's strategy by its `setup`
// name, then defers to evaluateAdherence. Pure — used to enrich trade payloads.
export function adherenceOf(trade, rulesByName) {
  const rules = trade && trade.setup && rulesByName ? rulesByName.get(trade.setup) : null;
  return evaluateAdherence(trade || {}, rules);
}

// Sanitize a raw rules payload before persisting: keep only known types with
// well-formed values, coerce numbers, cap the count. Returns a clean array
// (never throws) so a malformed client payload can't corrupt the stored rules.
export function normalizeRules(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || !RULE_TYPES[r.type]) continue;
    switch (r.type) {
      case 'session': {
        const values = (Array.isArray(r.values) ? r.values : []).filter((v) => ['ASIA', 'LDN', 'NY'].includes(v));
        if (values.length) out.push({ type: 'session', values });
        break;
      }
      case 'direction': {
        if (r.value === 'buy' || r.value === 'sell') out.push({ type: 'direction', value: r.value });
        break;
      }
      case 'max_sl':
      case 'min_sl': {
        const value = Number(r.value);
        if (Number.isFinite(value) && value >= 0) out.push({ type: r.type, value });
        break;
      }
      case 'symbols': {
        const values = (Array.isArray(r.values) ? r.values : [])
          .map((v) => String(v).trim().toUpperCase()).filter(Boolean).slice(0, 50);
        if (values.length) out.push({ type: 'symbols', values });
        break;
      }
      case 'weekdays': {
        const values = (Array.isArray(r.values) ? r.values : []).filter((v) => WEEKDAYS.includes(v));
        if (values.length) out.push({ type: 'weekdays', values });
        break;
      }
      case 'hours': {
        const from = Number(r.from), to = Number(r.to);
        if (Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to <= 23 && from <= to) {
          out.push({ type: 'hours', from, to });
        }
        break;
      }
      default:
        break;
    }
    if (out.length >= 20) break; // sane cap
  }
  return out;
}
