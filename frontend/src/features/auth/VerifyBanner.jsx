import React, { useState } from 'react';
import { requestVerification } from '../../lib/api.js';
import { useAuth } from '../../app/AuthContext.jsx';

/**
 * The soft half of "soft enforcement": an unverified address never blocks
 * anything, it just gets asked about here.
 *
 * Renders nothing at all for the common cases — no session, or an address
 * already verified (which includes every Google account, since Google proved it
 * at login). So the banner is invisible to almost everyone almost always, and
 * that is the intended end state rather than a gap.
 */
export default function VerifyBanner() {
  const { user } = useAuth();
  const [state, setState] = useState('idle');   // idle | sending | sent | failed | dismissed
  const [error, setError] = useState(null);

  if (!user || user.email_verified_at || state === 'dismissed') return null;

  const resend = async () => {
    setState('sending');
    setError(null);
    try {
      const { sent, alreadyVerified } = await requestVerification();
      // `sent: false` means the server could not hand the message to SES. Saying
      // "check your inbox" then would be a lie the user discovers by waiting.
      if (alreadyVerified || sent) setState('sent');
      else {
        setError('Email is not set up on this environment yet — ask an admin to verify you manually.');
        setState('failed');
      }
    } catch (err) {
      setError(err.message);
      setState('failed');
    }
  };

  return (
    <div className="verify-banner" role="status">
      <span className="verify-banner-dot" aria-hidden="true" />
      <span className="verify-banner-text">
        {state === 'sent'
          ? <>Verification email sent to <strong>{user.email}</strong>. The link works for 24 hours.</>
          : <>Confirm <strong>{user.email}</strong> to secure your account and enable password recovery.</>}
      </span>
      {error && <span className="verify-banner-error">{error}</span>}
      {state !== 'sent' && (
        <button type="button" className="verify-banner-action" onClick={resend} disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : state === 'failed' ? 'Try again' : 'Resend email'}
        </button>
      )}
      <button
        type="button" className="verify-banner-close" onClick={() => setState('dismissed')}
        aria-label="Dismiss until next visit"
      >
        ×
      </button>
    </div>
  );
}
