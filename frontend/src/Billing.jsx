import React from 'react';
import { useAuth } from './AuthContext.jsx';

// Pricing / plan-status page. The "Upgrade" CTAs are placeholders until the
// payment flow (Razorpay) lands — see plan PR3. Plan slugs + entitlements are
// the source of truth in the backend (src/plans.js); this is display copy.
const TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: '₹0',
    tagline: 'Journal manually, forever free.',
    features: ['Manual trade entry', 'CSV / statement import', 'Full R-based analytics'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '₹399',
    tagline: 'Auto-sync via the EA — real-time while your terminal runs.',
    features: ['Everything in Free', 'EA attach auto-sync (MT4/MT5)', 'Up to 3 trading accounts', 'Trade replay'],
    highlight: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '₹1,499',
    tagline: 'Always-on cloud sync. No EA, no setup, no PC required.',
    features: ['Everything in Pro', 'MetaApi cloud sync', '1 account included (+₹999 / extra)', 'Syncs even when your PC is off'],
  },
];

export default function Billing() {
  const { user } = useAuth();
  const current = user?.plan || 'free';

  return (
    <div className="billing">
      <h2 className="billing-title">Plans</h2>
      <p className="billing-sub">You're on the <b>{current[0].toUpperCase() + current.slice(1)}</b> plan.</p>
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
              {isCurrent ? (
                <button className="billing-cta" disabled>Current plan</button>
              ) : (
                <button className="billing-cta primary" disabled title="Payments coming soon">
                  {t.id === 'free' ? 'Downgrade' : `Upgrade to ${t.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="billing-note">Payments are coming soon. To change your plan in the meantime, contact support.</p>
    </div>
  );
}
