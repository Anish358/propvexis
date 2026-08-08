import React, { useEffect, useState } from 'react';
import { useAuth } from '../../app/AuthContext.jsx';
import { BRAND, token } from '../../lib/theme.js';
import { fetchMe, fetchBillingConfig, fetchSubscription, startSubscription, cancelSubscription } from '../../lib/api.js';

// Pricing / plan-status page. When Razorpay is configured, the Pro CTA runs a
// real recurring-subscription checkout; otherwise it stays a "coming soon"
// placeholder. Plan slugs + entitlements are the source of truth in the backend
// (src/plans.js); this is display + purchase flow.
const TIERS = [
  {
    id: 'free', name: 'Free', price: '₹0',
    tagline: 'Journal manually, forever free.',
    features: ['Manual trade entry', 'CSV / statement import', 'Full R-based analytics'],
  },
  {
    id: 'pro', name: 'Pro', price: '₹399',
    tagline: 'Auto-sync via the EA — real-time while your terminal runs.',
    features: ['Everything in Free', 'EA attach auto-sync (MT4/MT5)', 'Up to 3 trading accounts', 'Trade replay'],
    highlight: true,
  },
  {
    id: 'premium', name: 'Premium', price: '₹1,499',
    tagline: 'Always-on cloud sync. No EA, no setup, no PC required.',
    features: ['Everything in Pro', 'MetaApi cloud sync', '1 account included (+₹999 / extra)', 'Syncs even when your PC is off'],
  },
];

const RAZORPAY_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = RAZORPAY_SRC;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Razorpay checkout'));
    document.body.appendChild(s);
  });
}

export default function Billing() {
  const { user, setUser } = useAuth();
  const current = user?.plan || 'free';
  const [cfg, setCfg] = useState(null);        // { enabled, keyId }
  const [sub, setSub] = useState(null);        // current subscription row
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function refresh() {
    try { setUser(await fetchMe()); } catch { /* ignore */ }
    try { setSub((await fetchSubscription()).subscription); } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchBillingConfig().then(setCfg).catch(() => setCfg({ enabled: false }));
    fetchSubscription().then((r) => setSub(r.subscription)).catch(() => {});
  }, []);

  async function upgrade() {
    setBusy(true); setError(null);
    try {
      const { subscription_id, key_id } = await startSubscription('pro');
      await loadRazorpay();
      const rzp = new window.Razorpay({
        key: key_id,
        subscription_id,
        name: BRAND,
        description: 'Pro plan — monthly',
        theme: { color: token('--accent') },
        // Webhook is the source of truth for the plan flip; this just refreshes
        // the UI once the user finishes the checkout.
        handler: () => { setTimeout(refresh, 1500); },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.on('payment.failed', () => setError('Payment failed — please try again.'));
      rzp.open();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!confirm('Cancel your Pro subscription at the end of the current billing cycle?')) return;
    setBusy(true); setError(null);
    try {
      await cancelSubscription();
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const paymentsLive = cfg?.enabled;
  const renewal = sub?.current_end ? new Date(sub.current_end).toLocaleDateString() : null;

  function proCta() {
    if (current === 'pro') {
      return (
        <>
          <button className="billing-cta" disabled>Current plan</button>
          {sub && sub.status !== 'cancelled' && paymentsLive && (
            <button className="billing-cancel" onClick={cancel} disabled={busy}>Cancel subscription</button>
          )}
        </>
      );
    }
    if (paymentsLive) {
      return <button className="billing-cta primary" onClick={upgrade} disabled={busy}>{busy ? 'Starting…' : 'Upgrade to Pro'}</button>;
    }
    return <button className="billing-cta primary" disabled title="Payments coming soon">Upgrade to Pro</button>;
  }

  return (
    <div className="billing">
      <h2 className="billing-title">Plans</h2>
      <p className="billing-sub">
        You're on the <b>{titleCase(current)}</b> plan.
        {current === 'pro' && renewal && <> Renews {renewal}.</>}
      </p>
      {error && <div className="login-error">{error}</div>}
      <div className="billing-tiers">
        {TIERS.map((t) => {
          const isCurrent = t.id === current;
          return (
            <div key={t.id} className={`billing-card${t.highlight ? ' highlight' : ''}${isCurrent ? ' current' : ''}`}>
              <div className="billing-card-name">{t.name}</div>
              <div className="billing-card-price">{t.price}<span className="billing-per">/mo</span></div>
              <div className="billing-card-tagline">{t.tagline}</div>
              <ul className="billing-features">
                {t.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              {t.id === 'pro'
                ? proCta()
                : isCurrent
                  ? <button className="billing-cta" disabled>Current plan</button>
                  : <button className="billing-cta primary" disabled title="Coming soon">
                      {t.id === 'free' ? 'Downgrade' : 'Coming soon'}
                    </button>}
            </div>
          );
        })}
      </div>
      {!paymentsLive && <p className="billing-note">Online payments are coming soon. To change your plan meanwhile, contact support.</p>}
    </div>
  );
}
