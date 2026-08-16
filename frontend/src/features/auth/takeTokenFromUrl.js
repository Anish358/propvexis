/**
 * Read the `token` query parameter and immediately strip it from the URL.
 *
 * A reset token is a live credential for the account — one POST away from a new
 * password and a session. Leaving it in `window.location` publishes it to
 * everything that reads a URL rather than a request body:
 *
 *   - Sentry. The browser SDK is initialised for every production build with
 *     tracing on, and it stamps `document.location.href` onto events and
 *     pageload transactions. `sendDefaultPii: false` does not strip URLs, so a
 *     sampled reset-link open would ship an unexpired single-use token to a
 *     third party, where it is stored and searchable. The backend goes to the
 *     trouble of storing only a SHA-256 of these tokens; exporting the
 *     plaintext to an external service would undo that.
 *   - Browser history and session restore, which outlive the 1-hour TTL.
 *   - The Referer header on any later outbound navigation.
 *   - Access logs at every proxy in front of the app.
 *
 * history.replaceState (rather than a router navigate) because this must happen
 * before React commits and before any instrumentation samples the pageload —
 * there is no render in which the URL still holds the token.
 *
 * Called as a lazy useState initialiser, so it runs exactly once per mount.
 * StrictMode's double render is why: reading it again after the strip would
 * return empty and the screen would claim the link was malformed.
 *
 * @returns {string} the token, or '' when the URL carried none.
 */
export function takeTokenFromUrl() {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token') || '';
  if (token) {
    url.searchParams.delete('token');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`
    );
  }
  return token;
}
