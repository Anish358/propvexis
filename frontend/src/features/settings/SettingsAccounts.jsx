import React, { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MoreVertical, Plus } from 'lucide-react';
import {
  Badge, Button, Card, CountBadge, EmptyState, Menu, MenuContent, MenuItem,
  MenuSeparator, MenuTrigger, Tabs,
} from '@/components/primitives';
import { AccountFormModal, EaSetupModal } from '../accounts/AccountForms.jsx';
import { deleteAccount, updateAccount } from '../../lib/api.js';
import { fmtMoney } from '../../lib/metrics.js';

// ---------------------------------------------------------------------------
// Settings › Accounts — THE account-management surface. One table, one row per
// trading account, one menu per row.
//
// THIS REPLACED TWO SURFACES, NOT ONE. Before this, `/account` listed every account
// as a card with a Manage button, and that button opened a modal that listed every
// account again with Edit / Setup / Archive / Delete on each. Two lists and a dialog
// for one job. `/account` now redirects here (nav.js) and the modal was split into
// the two focused dialogs this page opens (AccountForms.jsx).
//
// A TABLE, NOT CARDS, AND THAT IS THE MANAGEMENT/ANALYSIS LINE. Prop OS > Accounts
// shows the same accounts as cards with drawdown meters and equity curves, because
// what you do there is JUDGE an account — is it close to a limit, is it on target.
// What you do here is administer one: rename it, correct its rules, archive it, see
// whether its sync is alive. Those are one-line-per-account facts you scan down a
// column, which is what a table is for, and the row you want is found by comparing
// against its neighbours rather than by reading any single row.
//
// THE COLUMNS ARE THE ONES PROPVEXIS ACTUALLY HAS. Every cell below reads a field
// `GET /api/accounts` returns (domain/accounts/accounts.js: listAccounts) — there is
// no placeholder column and no field invented to fill a header. Two obvious
// management columns are deliberately ABSENT for that reason:
//
//   Profit calculation method   FIFO/LIFO is a broker-statement concept. PropVexis
//                               derives R and P&L per closed trade from the EA's own
//                               numbers; there is no setting, so a column would be a
//                               constant pretending to be a choice.
//   Next update                 The EA PUSHES on trade close. There is no polling
//                               schedule, so there is no next time to show. "Last
//                               Sync" is the honest half of that pair, and it is here.
//
// WHAT REPLACED THEM IS DOMAIN DATA THAT MATTERS MORE HERE: the firm, the challenge
// size and the phase, because on a prop desk "FTMO, $100K, Funded" identifies an
// account far better than a login number does.
// ---------------------------------------------------------------------------

const TABS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

const TYPE_LABEL = { eval: 'Evaluation', funded: 'Funded' };

// Firm first, broker second, "Other" last. `firm_id` is set when an account was
// prefilled from the template catalog; a hand-configured account has only whatever
// the user typed, and "Other" is what the rest of the Prop OS module calls that
// (see AccountWorkspace's header) rather than a blank cell that reads as missing data.
const firmOf = (a) => a.firm_name || a.broker || 'Other';

const money = (n) => (n == null ? '—' : fmtMoney(Number(n)));

// Date AND time, unlike every other date in the app. Elsewhere a date answers "which
// trading day"; here it answers "is this sync alive", and an account that last
// reported four hours ago is in a different state from one that reported at 09:00
// today — a bare day cannot tell them apart.
const fmtSync = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
};

// The row's sync state, as a word plus a tone — never a tone alone. Colour is a
// reinforcement here, the same rule the Prop OS health dots follow.
//
// A MANUAL ACCOUNT HAS NO SYNC STATE, and that is why it returns null rather than a
// grey "Inactive" pill. Nothing is meant to be syncing into a manual bucket, so a
// status pill in that cell would report a fault where the account is working exactly
// as designed.
function syncStatus(a) {
  if (a.is_active === false) return { label: 'Archived', tone: 'neutral' };
  if (a.kind === 'manual') return null;
  if (a.pending) return { label: 'Waiting', tone: 'warn' };
  return { label: 'Synced', tone: 'profit' };
}

// ---------------------------------------------------------------------------
// One row's actions.
//
// A MENU RATHER THAN FOUR BUTTONS PER ROW. Four rows of four buttons is sixteen
// controls competing for attention in a table whose job is to be scanned, and the
// destructive one would be permanently one mis-click away from Archive. The menu also
// lets EA Setup appear only where it means something — a manual account has no EA —
// without leaving a hole in a button strip.
// ---------------------------------------------------------------------------
function RowMenu({ account, onEdit, onSetup, onArchive, onDelete }) {
  const archived = account.is_active === false;
  return (
    <Menu>
      {/* `icon-sm` puts this on the "smaller chrome" radius step (DESIGN-LANGUAGE §6),
          which is where an icon button belongs; the label is invisible, so it is on
          aria-label rather than being left to the glyph. */}
      <MenuTrigger
        render={<Button variant="chrome" size="icon-sm" />}
        aria-label={`Actions for ${account.label}`}
      >
        <MoreVertical aria-hidden="true" />
      </MenuTrigger>
      <MenuContent>
        <MenuItem onClick={onEdit}>Edit account</MenuItem>
        {account.kind !== 'manual' && <MenuItem onClick={onSetup}>EA setup</MenuItem>}
        <MenuSeparator />
        <MenuItem onClick={onArchive}>{archived ? 'Restore account' : 'Archive account'}</MenuItem>
        <MenuItem variant="destructive" onClick={onDelete}>Delete account</MenuItem>
      </MenuContent>
    </Menu>
  );
}

// ---------------------------------------------------------------------------
// The table.
//
// On `.prop-table`, the app's existing table treatment, plus the horizontal scroll
// `.fin-table-scroll` gives the Finance ledger — for the same reason stated there:
// eight columns of account data cannot be honestly reflowed into a phone's width, and
// a figure squeezed until it wraps is not a smaller figure, it is an unreadable one.
// ---------------------------------------------------------------------------
function AccountsTable({ rows, onEdit, onSetup, onArchive, onDelete }) {
  return (
    <div className="set-table-scroll">
      <table className="prop-table set-table">
        <thead>
          <tr>
            {/* The class is on the <th> as well as the <td>: in auto layout the header
                participates in sizing, so a width declared only on the cell loses. */}
            <th className="set-col-name">Account</th>
            <th>Firm</th>
            <th className="set-col-tight">Type</th>
            <th className="set-col-tight num">Size</th>
            <th className="set-col-tight num">Balance</th>
            <th className="set-col-tight">Sync</th>
            <th className="set-col-tight">Last Sync</th>
            {/* No header: a column of menus is not a named field, and "Actions" over
                one icon is a label longer than the thing it labels. */}
            <th className="set-col-actions" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const status = syncStatus(a);
            return (
              <tr key={a.id}>
                <td className="set-col-name">
                  <div className="set-acct-name" title={a.label}>{a.label}</div>
                  {/* The login is the account's identity to MT5 and to nobody else, so
                      it rides under the name the trader gave it rather than taking a
                      column of its own. */}
                  <div className="set-acct-sub">
                    {a.kind === 'manual' ? 'Manual entry' : a.pending ? 'No login bound yet' : `MT5 ${a.mt5_login}`}
                  </div>
                </td>
                <td title={firmOf(a)}>{firmOf(a)}</td>
                <td className="set-col-tight set-col-badge">
                  <Badge tone={a.account_type === 'funded' ? 'profit' : 'neutral'}>
                    {TYPE_LABEL[a.account_type] || 'Evaluation'}
                  </Badge>
                </td>
                <td className="set-col-tight num set-col-figure">{money(a.start_balance)}</td>
                <td className="set-col-tight num set-col-figure">{money(a.balance)}</td>
                <td className="set-col-tight set-col-badge">
                  <span className="set-sync">
                    <span className="set-sync-word">{a.kind === 'manual' ? 'Manual' : 'Auto sync'}</span>
                    {status && <Badge tone={status.tone}>{status.label}</Badge>}
                  </span>
                </td>
                <td className="set-col-tight set-col-date">{fmtSync(a.balance_updated_at)}</td>
                <td className="set-col-actions">
                  <RowMenu
                    account={a}
                    onEdit={() => onEdit(a)}
                    onSetup={() => onSetup(a)}
                    onArchive={() => onArchive(a)}
                    onDelete={() => onDelete(a)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function SettingsAccounts() {
  const { accounts = [], reloadAccounts } = useOutletContext();
  const [tab, setTab] = useState('active');
  // `form` is { mode, account } or null; `setup` is an account or null. Two pieces of
  // state rather than one "which dialog" enum, because they open from different rows
  // for different reasons and neither is a mode of the other.
  const [form, setForm] = useState(null);
  const [setup, setSetup] = useState(null);
  const [err, setErr] = useState(null);

  // Newest first. `created_at` ascending is what the API returns (the switcher wants a
  // stable order); a management list wants the account you just added at the top,
  // because that is the one you are still working on.
  const buckets = useMemo(() => {
    const byNewest = [...accounts].sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
    return {
      active: byNewest.filter((a) => a.is_active !== false),
      archived: byNewest.filter((a) => a.is_active === false),
    };
  }, [accounts]);

  // Archiving is a soft toggle on `is_active`: the account leaves the switcher and
  // this tab, and keeps every trade it ever had. Deleting is not — see below.
  async function toggleArchive(a) {
    setErr(null);
    try {
      await updateAccount(a.id, { is_active: a.is_active === false });
      reloadAccounts?.();
    } catch (e) {
      setErr(e.message);
    }
  }

  // `confirm()` rather than a dialog of our own, deliberately. DESIGN-LANGUAGE §18
  // "destructive action confirmation" is still an open decision, and this is the
  // pattern the rest of the app already uses for the same action — inventing a
  // bespoke confirm here would settle a locked-pending question in a side street.
  async function remove(a) {
    // eslint-disable-next-line no-alert
    if (!confirm(`Delete “${a.label}”? Its trades stay in your journal but stop being linked to an account.`)) return;
    setErr(null);
    try {
      await deleteAccount(a.id);
      reloadAccounts?.();
    } catch (e) {
      setErr(e.message);
    }
  }

  // Counts in the tab labels, the same convention Prop OS > Accounts uses: an empty
  // Archived tab is worth knowing about before clicking it.
  const tabs = TABS.map((t) => ({
    value: t.value,
    label: (
      <>
        {t.label}
        <CountBadge className="set-tab-count">{buckets[t.value].length}</CountBadge>
      </>
    ),
  }));

  const rows = buckets[tab] || [];
  const noAccountsAtAll = accounts.length === 0;

  return (
    <>
      <Card className="set-card">
        <div className="set-card-head">
          <Tabs className="set-tabs" tabs={tabs} value={tab} onChange={setTab} />
          <Button variant="primary" size="sm" onClick={() => setForm({ mode: 'add', account: null })}>
            <Plus aria-hidden="true" />
            <span>Add Account</span>
          </Button>
        </div>

        {err && <div className="banner error set-error">{err}</div>}

        {rows.length === 0 ? (
          <EmptyState
            title={noAccountsAtAll ? 'No trading accounts yet' : tab === 'archived' ? 'Nothing archived' : 'No active accounts'}
            description={noAccountsAtAll
              ? 'Add your first prop challenge, funded account or manual bucket to start journaling.'
              : tab === 'archived'
                ? 'Archiving an account takes it out of the account switcher and keeps every trade it ever had, so a finished challenge stops crowding your workspace without losing its history.'
                : 'Every account you own is archived. Restore one from the Archived tab, or add a new one.'}
            actions={noAccountsAtAll && (
              <Button variant="primary" onClick={() => setForm({ mode: 'add', account: null })}>
                <Plus aria-hidden="true" />
                <span>Add Account</span>
              </Button>
            )}
          />
        ) : (
          <AccountsTable
            rows={rows}
            onEdit={(a) => setForm({ mode: 'edit', account: a })}
            onSetup={(a) => setSetup(a)}
            onArchive={toggleArchive}
            onDelete={remove}
          />
        )}
      </Card>

      {form && (
        <AccountFormModal
          mode={form.mode}
          account={form.account}
          onClose={() => setForm(null)}
          onSaved={reloadAccounts}
        />
      )}
      {setup && <EaSetupModal account={setup} onClose={() => setSetup(null)} />}
    </>
  );
}
