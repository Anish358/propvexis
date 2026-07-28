// Onboarding gating — pure + side-effect-free so it's unit-testable and shared
// by the login/me responses and the /api/onboarding/complete endpoint.
//
// A user needs the setup wizard iff they have never completed it (`onboarded_at`
// is null/absent). Existing users were backfilled at migration time (see
// 0020_user_onboarding.sql), so only fresh signups return true. A missing user
// returns false — there is nothing to onboard.
export function needsOnboarding(user) {
  return !!user && !user.onboarded_at;
}
