// Set a user's subscription plan by email. Stand-in for the payment flow
// (Razorpay) until it lands — lets us assign/test plans now and lets ops
// grant/downgrade a user manually.
//
//   node scripts/set-plan.js <email> <free|pro|premium>
import { pool, query } from '../src/db.js';
import { isValidPlan } from '../src/plans.js';

const [email, plan] = process.argv.slice(2);

if (!email || !plan) {
  console.error('usage: node scripts/set-plan.js <email> <free|pro|premium>');
  process.exit(2);
}
if (!isValidPlan(plan)) {
  console.error(`invalid plan "${plan}" — must be one of: free, pro, premium`);
  process.exit(2);
}

async function main() {
  const { rows } = await query(
    'UPDATE users SET plan = $2 WHERE email = $1 RETURNING id, email, plan',
    [email.trim().toLowerCase(), plan]
  );
  if (!rows.length) {
    console.error(`no user found with email ${email}`);
    process.exitCode = 1;
    return;
  }
  console.log(`set ${rows[0].email} (id=${rows[0].id}) -> plan=${rows[0].plan}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
