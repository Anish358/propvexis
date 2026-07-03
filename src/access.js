// Pure access-control decision for a verified Google login. Extracted from the
// auth route so it can be unit-tested without the OAuth/DB machinery.
//
// Caller must have already checked the email is present and Google-verified.
//   - open signup on  -> any verified account is permitted.
//   - open signup off -> the (lowercased) email must be on the allowlist,
//                        which is fail-closed when empty.
export function isEmailPermitted(email, { openSignup, allowedEmails }) {
  if (openSignup) return true;
  if (!email) return false;
  return allowedEmails.includes(email.toLowerCase());
}
