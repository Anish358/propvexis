// Challenge groups — the multi-account challenge (migration 0027).
//
// A group is the thing a trader calls "my GFT 2-Step 25K challenge": one row that
// owns the account of each phase. The per-phase rules and the pass/breach record stay
// in `challenges`, one row per attempt, exactly as migration 0016 put them. Nothing
// here judges anything; see challengeStatus.js for the rule and prop.js for the
// figures.
//
// DATA ACCESS ONLY, in the shape of the rest of this domain: bulk reads keyed by the
// owner, and every write scoped by user_id so an id from a request body can never
// reach another trader's challenge.
import { pool, query } from '../../platform/db.js';

const num = (v) => (v == null ? null : Number(v));

function shapeGroup(r) {
  return {
    id: Number(r.id),
    firm_id: r.firm_id ?? null,
    firm_name: r.firm_name ?? null,
    product_id: r.product_id ?? null,
    start_balance: num(r.start_balance),
    status: r.status,
    // Archival state (migration 0028), which is NOT `status`: status says what the
    // challenge did, this says whether the trader still wants to see it.
    is_active: r.group_is_active,
    archived_at: r.group_archived_at ?? null,
    created_at: r.created_at,
    passed_at: r.passed_at ?? null,
    failed_at: r.failed_at ?? null,
  };
}

/**
 * Every challenge the user owns, each with the accounts in it and what each of those
 * accounts' phases DID.
 *
 * ONE QUERY, NOT ONE PER GROUP. Both callers need the whole set: the Add Account
 * wizard lists the challenges a new account could join, and Prop OS › Challenges
 * draws every journey. Per-group fetching would be N requests behind one grid.
 *
 * THE LATEST CHALLENGE ROW PER ACCOUNT IS THE ACCOUNT'S STANDING, and it has to be
 * the latest rather than the ACTIVE one: an account whose phase has passed has no
 * active row at all (that is what passing means now), and it is exactly those accounts
 * the wizard has to find — "Phase 1 passed, Phase 2 not added yet" is the case the
 * whole feature exists for. DISTINCT ON does that in one pass; the ORDER BY inside it
 * is what picks which row wins, so it is not decoration.
 *
 * ARCHIVED CHALLENGES ARE NOT HERE. A group goes is_active = false once every account
 * in it is archived (see reconcileGroup), and both callers want it gone: the wizard
 * must not offer a challenge whose phases the trader has put away, and Prop OS must
 * not draw one. Unarchiving any phase brings the whole challenge back.
 *
 * WHAT IS **NOT** HERE: the live figures. Drawdown room, target progress and health
 * come from the engine via GET /api/prop/portfolio, which every prop surface already
 * loads. Recomputing them here would be a second answer to the same question.
 */
export async function challengeGroupsForUser(userId) {
  const { rows } = await query(
    `WITH latest AS (
       SELECT DISTINCT ON (c.mt5_account_id)
              c.mt5_account_id, c.id AS challenge_id, c.phase, c.status,
              c.start_date, c.passed_at, c.breached_at, c.breach_reason
         FROM challenges c
         JOIN mt5_accounts a ON a.id = c.mt5_account_id
        WHERE a.user_id = $1
        ORDER BY c.mt5_account_id, c.start_date DESC, c.id DESC
     )
     SELECT g.id, g.firm_id, g.firm_name, g.product_id, g.start_balance, g.status,
            -- ALIASED, and it must stay aliased: the account half of this SELECT
            -- also has an is_active, and pg hands back one object per row — two
            -- columns of the same name means the second silently wins, so the
            -- group would report the ARCHIVE STATE OF ITS LAST ACCOUNT.
            g.is_active AS group_is_active, g.archived_at AS group_archived_at,
            g.created_at, g.passed_at, g.failed_at,
            a.id AS account_id, a.mt5_login, a.label, a.account_type, a.kind,
            a.is_active, a.start_balance AS account_balance, a.created_at AS account_created_at,
            l.challenge_id, l.phase, l.status AS challenge_status, l.start_date,
            l.passed_at AS phase_passed_at, l.breached_at, l.breach_reason
       FROM challenge_groups g
       LEFT JOIN mt5_accounts a ON a.challenge_group_id = g.id
       LEFT JOIN latest l ON l.mt5_account_id = a.id
      WHERE g.user_id = $1 AND g.is_active
      ORDER BY g.created_at DESC, g.id DESC, l.start_date ASC NULLS LAST, a.id ASC`,
    [userId],
  );

  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.id)) groups.set(r.id, { ...shapeGroup(r), accounts: [] });
    // The LEFT JOIN survives migration 0028's reconciler, which deletes a group as
    // its last account goes: the two can still cross in a race (an account deleted
    // between this query planning and reading), and a row of nulls must not become
    // an account named `null` in the phase list. So the group comes back empty
    // rather than corrupt, and the next reconcile removes it.
    if (r.account_id == null) continue;
    groups.get(r.id).accounts.push({
      id: Number(r.account_id),
      mt5_login: num(r.mt5_login),
      label: r.label ?? null,
      account_type: r.account_type ?? null,
      kind: r.kind ?? null,
      is_active: r.is_active,
      start_balance: num(r.account_balance),
      created_at: r.account_created_at,
      // Null for an account that somehow has no challenge row — a prop account always
      // gets one at provision, so this is the pre-0016 backfill's edge, not a state
      // the app creates. Reported as null rather than defaulted to 'p1', because
      // guessing a phase here would draw a stage the trader never ran.
      challenge_id: r.challenge_id == null ? null : Number(r.challenge_id),
      phase: r.phase ?? null,
      challenge_status: r.challenge_status ?? null,
      start_date: r.start_date ?? null,
      passed_at: r.phase_passed_at ?? null,
      breached_at: r.breached_at ?? null,
      breach_reason: r.breach_reason ?? null,
    });
  }
  return [...groups.values()];
}

/**
 * Create the group a brand-new challenge starts as, inside the caller's transaction.
 *
 * Takes a client rather than using the pool: provisionAccount writes the account, the
 * group and the challenge together, and a group created outside that transaction
 * would survive a rolled-back provision as a challenge with no accounts in it.
 */
export async function insertGroup(client, userId, v) {
  const { rows } = await client.query(
    `INSERT INTO challenge_groups (user_id, firm_id, firm_name, product_id, start_balance)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, firm_id, firm_name, product_id, start_balance, status,
               is_active AS group_is_active, archived_at AS group_archived_at,
               created_at, passed_at, failed_at`,
    [userId, v.firm_id ?? null, v.firm_name ?? null, v.product_id ?? null, v.start_balance ?? null],
  );
  return shapeGroup(rows[0]);
}

/**
 * Lock and return the group a new account is joining — or null when the id is not a
 * challenge this user can add to.
 *
 * OWNERSHIP IS CHECKED HERE, IN SQL, NOT BY THE ROUTE. `challenge_group_id` arrives in
 * a request body, and the whole point of the existing-challenge branch is that it
 * names a row the client did not create in this request. `user_id = $2` is what stops
 * one trader attaching an account to another's challenge — and the route reads a null
 * return as a 400 rather than trying to distinguish "not yours" from "does not exist",
 * which would confirm the existence of someone else's row.
 *
 * NEITHER CAN AN ARCHIVED ONE (`AND is_active`): every account in it has been put
 * away, so adding a phase would resurrect the challenge through a side door instead
 * of through unarchiving one of its accounts. The route reports it the same way it
 * reports the other two refusals — one message, no distinction.
 *
 * A FAILED CHALLENGE CANNOT BE JOINED. status must still be 'active': the firm has
 * taken a breached challenge back, so adding a phase to it would be recording a login
 * that cannot exist. FOR UPDATE because the check and the attach must not straddle
 * another transaction closing the group.
 */
export async function lockJoinableGroup(client, groupId, userId) {
  const { rows } = await client.query(
    `SELECT id, firm_id, firm_name, product_id, start_balance, status,
            is_active AS group_is_active, archived_at AS group_archived_at,
            created_at, passed_at, failed_at
       FROM challenge_groups
      WHERE id = $1 AND user_id = $2 AND status = 'active' AND is_active
      FOR UPDATE`,
    [groupId, userId],
  );
  return rows.length ? shapeGroup(rows[0]) : null;
}

/** Attach an account to a group, inside the provisioning transaction. */
export async function attachAccountToGroup(client, accountId, groupId) {
  await client.query(
    'UPDATE mt5_accounts SET challenge_group_id = $1 WHERE id = $2',
    [groupId, accountId],
  );
}

/**
 * Close an account's ACTIVE challenge row as passed or breached, and fail its group
 * when it breached.
 *
 * THE `status = 'active'` GUARD IS THE IDEMPOTENCY, and it is load-bearing rather
 * than defensive: this runs on every trade ingest for the account, so without it a
 * passed phase would be re-stamped (and re-announced) on every trade that followed.
 * A zero-row update means the transition had already happened and the caller emits
 * nothing.
 *
 * Returns `{ challengeId, phase, status }` for the transition that actually happened,
 * or null when there was none.
 */
export async function applyChallengeOutcome(accountId, { status, reason = null } = {}) {
  if (status !== 'passed' && status !== 'breached') return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stamp = status === 'breached' ? 'breached_at' : 'passed_at';
    const { rows } = await client.query(
      `UPDATE challenges
          SET status = $1, ${stamp} = now(), breach_reason = $2
        WHERE mt5_account_id = $3 AND status = 'active'
        RETURNING id, phase`,
      [status, status === 'breached' ? reason : null, accountId],
    );
    if (!rows.length) { await client.query('ROLLBACK'); return null; }

    if (status === 'breached') {
      await client.query(
        `UPDATE challenge_groups g
            SET status = 'failed', failed_at = now()
           FROM mt5_accounts a
          WHERE a.id = $1 AND g.id = a.challenge_group_id AND g.status = 'active'`,
        [accountId],
      );
    }
    await client.query('COMMIT');
    return { challengeId: Number(rows[0].id), phase: rows[0].phase, status };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Put a settled phase back to running — the undo an automatic system has to have.
 *
 * WHY IT EXISTS. The status now writes itself off the engine's reading, and the engine can
 * be wrong about a real account: a stale EA balance, a payout the trader recorded late, a
 * firm that judged a technicality differently. Without a way back, one bad tick leaves a
 * phase permanently passed and its challenge waiting for a login that will never come —
 * so the override has to work in both directions, not only the direction that helps.
 *
 * REOPENS THE LATEST SETTLED ROW, and only when the account has NO active one: the partial
 * unique index allows one active challenge per account, so the guard is what stops this
 * being an integrity error rather than a refusal. `WHERE NOT EXISTS` is inside the
 * statement rather than a read followed by a write, so two clicks cannot both win.
 *
 * AND IT UN-FAILS THE CHALLENGE, because a breach is what failed it. Only when nothing
 * else in the group is still breached — a 3-phase challenge with two breached accounts is
 * still a failed challenge, and reopening one of them does not change that.
 */
export async function reopenChallenge(accountId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE challenges c
          SET status = 'active', passed_at = NULL, breached_at = NULL, breach_reason = NULL
        WHERE c.id = (
                SELECT id FROM challenges
                 WHERE mt5_account_id = $1 AND status <> 'active'
                 ORDER BY COALESCE(passed_at, breached_at) DESC, id DESC
                 LIMIT 1
              )
          AND NOT EXISTS (
                SELECT 1 FROM challenges o
                 WHERE o.mt5_account_id = $1 AND o.status = 'active'
              )
        RETURNING c.id, c.phase`,
      [accountId],
    );
    if (!rows.length) { await client.query('ROLLBACK'); return null; }

    await client.query(
      `UPDATE challenge_groups g
          SET status = 'active', failed_at = NULL
         FROM mt5_accounts a
        WHERE a.id = $1 AND g.id = a.challenge_group_id AND g.status = 'failed'
          AND NOT EXISTS (
                SELECT 1 FROM mt5_accounts sib
                  JOIN challenges sc ON sc.mt5_account_id = sib.id
                 WHERE sib.challenge_group_id = g.id AND sc.status = 'breached'
              )`,
      [accountId],
    );
    await client.query('COMMIT');
    return { challengeId: Number(rows[0].id), phase: rows[0].phase, status: 'active' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * A CHALLENGE FOLLOWS ITS ACCOUNTS.
 *
 * A challenge is not a thing a trader owns separately from the logins in it — it IS
 * those logins, grouped. So archiving every phase of a challenge has to archive the
 * challenge, and deleting every phase has to remove it. Before this, neither
 * happened: Prop OS went on drawing a challenge whose accounts had all been
 * archived, and the Add Account wizard went on offering a challenge with no accounts
 * left to continue from.
 *
 * THREE OUTCOMES, DECIDED BY THE ACCOUNTS AND NOTHING ELSE:
 *   no accounts left        -> the group is deleted
 *   every account archived  -> is_active = false, archived_at stamped
 *   any account active      -> is_active = true, archived_at cleared
 *
 * The last line is what makes this a reconciler rather than an archive function: it
 * runs after archive, unarchive AND delete, always computes the answer from the
 * current accounts, and is therefore idempotent. Unarchiving one phase of a
 * four-phase challenge brings the challenge back without anyone having to remember
 * that it had been archived.
 *
 * STATUS IS NOT TOUCHED. 'passed' / 'failed' / 'active' record what the challenge
 * DID; is_active records whether the trader wants to see it. A passed challenge is
 * precisely the kind that gets archived, and folding archival into status would
 * destroy the record of the pass.
 *
 * ARCHIVED_AT IS COALESCEd, not overwritten: re-running this on an
 * already-archived group must not keep moving the date the trader archived it.
 *
 * Takes an optional client so it can run inside the delete transaction; falls back
 * to the pool for the archive path, which has no transaction of its own.
 */
export const RECONCILE_DELETE_EMPTY_SQL = `
  DELETE FROM challenge_groups g
   WHERE g.id = $1 AND g.user_id = $2
     AND NOT EXISTS (SELECT 1 FROM mt5_accounts a WHERE a.challenge_group_id = g.id)
   RETURNING g.id;`;

export const RECONCILE_ARCHIVE_SQL = `
  UPDATE challenge_groups g
     SET is_active   = act.any_active,
         archived_at = CASE WHEN act.any_active THEN NULL ELSE COALESCE(g.archived_at, now()) END
    FROM (SELECT bool_or(a.is_active) AS any_active
            FROM mt5_accounts a
           WHERE a.challenge_group_id = $1) act
   WHERE g.id = $1 AND g.user_id = $2
     AND act.any_active IS NOT NULL
     AND g.is_active IS DISTINCT FROM act.any_active
   RETURNING g.id, g.is_active;`;

export async function reconcileGroup(groupId, userId, client = null) {
  if (groupId == null) return null;
  const run = client ? (t, v) => client.query(t, v) : (t, v) => query(t, v);
  // Empty first: a group whose last account just went has nothing for the archive
  // statement to compute over (bool_or of no rows is NULL, which its own guard
  // would then skip), so deleting it here is what keeps the two mutually exclusive.
  const gone = await run(RECONCILE_DELETE_EMPTY_SQL, [groupId, userId]);
  if (gone.rows.length) return { id: Number(groupId), deleted: true };
  const { rows } = await run(RECONCILE_ARCHIVE_SQL, [groupId, userId]);
  if (!rows.length) return null; // already in the right state — nothing changed
  return { id: Number(rows[0].id), deleted: false, is_active: rows[0].is_active };
}

/**
 * The groups an account archive/unarchive/delete could have changed.
 *
 * One account only ever sits in one group, but the caller does not always know
 * which: PATCH /api/accounts/:id gets an id and a partial body, and the delete path
 * needs the group read BEFORE the row goes. Both ask here.
 */
export async function groupIdForAccount(accountId, userId, client = null) {
  const run = client ? (t, v) => client.query(t, v) : (t, v) => query(t, v);
  const { rows } = await run(
    'SELECT challenge_group_id FROM mt5_accounts WHERE id = $1 AND user_id = $2',
    [accountId, userId],
  );
  return rows.length && rows[0].challenge_group_id != null ? Number(rows[0].challenge_group_id) : null;
}
