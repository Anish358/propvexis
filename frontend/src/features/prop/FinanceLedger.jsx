import React, { useMemo, useState } from 'react';
import { Filter, Plus, Search, X } from 'lucide-react';
import {
  Badge, Button, Card, CountBadge, EmptyState, Input, Menu, MenuCheckboxItem, MenuContent,
  MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator, MenuTrigger, Tabs,
} from '@/components/primitives';
import { fmtMoney } from '../../lib/metrics.js';
import { LEDGER_VIEWS, ledgerFilterOptions } from './financeData.js';

// Prop OS › Finance › Transactions — the ledger table and its controls.
//
// THE ROWS ARE REAL AND SO IS THE FILTERING. Every row is a payout or a fee that
// exists in the database; the view tabs, the search box and the Filters menu narrow
// the same array the KPI row above sums, which is why the tiles restate themselves
// as you filter (financeData.js owns both). Nothing here is a stub with a TODO.
//
// WHAT IS DELIBERATELY NOT HERE: row selection and bulk actions. The Trade Log has
// both, and its implementation is ~60 lines of selection state plus an allSettled
// fan-out per action — there is no per-transaction action to fan out yet (a fee is
// created and deleted, not edited), so a checkbox column would select rows for a
// menu with nothing in it. The pattern is established and one page away when there
// is something to apply.
//
// `status` is Reviewed / Not reviewed derived from the row's `source`, per the
// substitution documented in financeData.js — a manual entry was typed by the
// trader, an EA-detected one has not been confirmed by anybody yet.

const TYPE_TONE = { income: 'profit', expense: 'loss' };
const TYPE_LABEL = { income: 'Income', expense: 'Expense' };
const signTone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const fmtDay = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ---------------------------------------------------------------------------
// Controls row: view tabs, then search + filters + add, right-aligned.
// ---------------------------------------------------------------------------

// The trigger's children sit inside `<MenuTrigger>`, not inside the element handed to
// `render` — same shape as the top bar's Filters and account controls. MenuTrigger has
// to BE the button so `aria-haspopup` / `aria-expanded` land on the focusable element,
// and `render` is what makes that element ours. Icons carry no size prop: the Button's
// own `[&_svg]:size-4` rule sizes them per button size, which is why the top bar's
// icons don't set one either.
function FiltersMenu({ options, categories, firms, onToggleCategory, onToggleFirm, onClear }) {
  const active = categories.length + firms.length;
  return (
    <Menu>
      {/* No aria-label: the button has a visible text label, and an aria-label would
          replace "Filters" with something a voice-control user cannot see to say. */}
      <MenuTrigger render={<Button variant="chrome" size="sm" active={active > 0} />}>
        <Filter aria-hidden="true" />
        <span>Filters</span>
        {/* CountBadge, not a pill of our own: a count of applied filters is selection
            state, which the primitive already keeps grayscale. */}
        {active > 0 && <CountBadge>{active}</CountBadge>}
      </MenuTrigger>
      <MenuContent className="fin-filter-menu">
        <MenuGroup>
          <MenuGroupLabel>Category</MenuGroupLabel>
          {options.categories.map((c) => (
            <MenuCheckboxItem
              key={c}
              checked={categories.includes(c)}
              onCheckedChange={() => onToggleCategory(c)}
            >
              {c}
            </MenuCheckboxItem>
          ))}
        </MenuGroup>
        {/* One firm is not a choice — the group only appears when there is something
            to pick between. */}
        {options.firms.length > 1 && (
          <>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Firm</MenuGroupLabel>
              {options.firms.map((f) => (
                <MenuCheckboxItem
                  key={f.value}
                  checked={firms.includes(f.value)}
                  onCheckedChange={() => onToggleFirm(f.value)}
                >
                  {f.label}
                </MenuCheckboxItem>
              ))}
            </MenuGroup>
          </>
        )}
        {active > 0 && (
          <>
            <MenuSeparator />
            <MenuItem onClick={onClear}>Clear filters</MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

// Payouts and fees are two different records with two different forms, and both
// forms already exist (PayoutsModal / FeesModal). So "Add Transaction" asks which
// one rather than inventing a third, unified transaction the schema has no table
// for.
function AddTransactionMenu({ onRecordPayout, onLogFee, canRecordPayout, canLogFee }) {
  return (
    <Menu>
      <MenuTrigger render={<Button variant="primary" size="sm" />}>
        <Plus aria-hidden="true" />
        <span>Add Transaction</span>
      </MenuTrigger>
      <MenuContent>
        <MenuItem disabled={!canRecordPayout} onClick={onRecordPayout}>
          Record payout
          <span className="fin-menu-hint">money in</span>
        </MenuItem>
        <MenuItem disabled={!canLogFee} onClick={onLogFee}>
          Log fee
          <span className="fin-menu-hint">money out</span>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function LedgerControls({
  view, onView, search, onSearch, options, categories, firms,
  onToggleCategory, onToggleFirm, onClearFilters,
  onRecordPayout, onLogFee, canRecordPayout, canLogFee,
}) {
  return (
    <div className="fin-controls">
      <Tabs tabs={LEDGER_VIEWS} value={view} onChange={onView} />
      <div className="fin-controls-right">
        <div className="fin-search">
          <Search size={14} className="fin-search-icon" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search firm, account, challenge…"
            aria-label="Search transactions"
          />
          {search && (
            <button
              type="button"
              className="fin-search-clear"
              onClick={() => onSearch('')}
              aria-label="Clear search"
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </div>
        <FiltersMenu
          options={options}
          categories={categories}
          firms={firms}
          onToggleCategory={onToggleCategory}
          onToggleFirm={onToggleFirm}
          onClear={onClearFilters}
        />
        <AddTransactionMenu
          onRecordPayout={onRecordPayout}
          onLogFee={onLogFee}
          canRecordPayout={canRecordPayout}
          canLogFee={canLogFee}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The table.
//
// On `.prop-table` — the Prop OS module's table treatment — rather than a fourth
// table style, with one addition: the whole thing scrolls HORIZONTALLY inside its
// card below ~1100px. Nine columns of finance data cannot be honestly reflowed into
// a phone's width, and squeezing them is how an amount stops being readable; a
// sideways scroll keeps every figure at full size, which for money is the property
// that matters.
// ---------------------------------------------------------------------------

export function LedgerTable({ rows = [], filtered }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title={filtered ? 'No matching transactions' : 'No transactions yet'}
        description={filtered
          ? 'Nothing in this view matches the current search and filters.'
          : 'Payouts you receive and fees you pay to a prop firm appear here on one signed timeline.'}
      />
    );
  }

  return (
    <div className="fin-table-scroll">
      <table className="prop-table fin-table">
        {/* `fin-col-tight` is every column whose content has a known, short width — a
            date, a phase name, a pill, a figure. Marking them lets the three free-text
            columns (Description, Account, Firm) split what is left, instead of the
            browser's auto layout handing a third of the row to whichever cell happens
            to hold the longest string. The class is on the <th> as well as the <td>,
            because in auto layout the header participates in sizing. */}
        <thead>
          <tr>
            <th className="fin-col-tight">Date</th>
            <th>Description</th>
            <th>Account</th>
            <th className="fin-col-tight">Challenge</th>
            <th>Firm</th>
            <th className="fin-col-tight">Type</th>
            <th className="fin-col-tight">Category</th>
            <th className="fin-col-tight num">Amount</th>
            <th className="fin-col-tight">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {/* A date is not a number: left-aligned like the text it sits beside, but
                  tabular so the columns of digits line up anyway. */}
              <td className="fin-col-tight fin-col-date">{fmtDay(r.date)}</td>
              <td title={r.description}>{r.description}</td>
              <td title={r.account}>{r.account}</td>
              <td className="fin-col-tight">{r.challenge}</td>
              <td title={r.firm}>{r.firm}</td>
              <td className="fin-col-tight fin-col-badge"><Badge tone={TYPE_TONE[r.type]}>{TYPE_LABEL[r.type]}</Badge></td>
              <td className="fin-col-tight fin-col-badge"><Badge tone="neutral">{r.category}</Badge></td>
              <td className={`fin-col-tight num jo-trade-val ${signTone(r.amount)}`}>{fmtMoney(r.amount, { sign: true })}</td>
              <td className="fin-col-tight fin-col-badge">
                <Badge tone={r.status === 'reviewed' ? 'neutral' : 'warn'}>
                  {r.status === 'reviewed' ? 'Reviewed' : 'Not reviewed'}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The card that holds the title, the controls, the row count and the table.
//
// `filters` is owned by the PAGE, not by this card, and that is on purpose: the KPI
// row above the card sums the SAME filtered rows, so the narrowing has to live one
// level up where both can read it. A card that owned its own filter state would give
// the page a table describing one set of rows and tiles describing another.
export function LedgerCard({
  ledger, rows, view, onView, filters, setFilters,
  onRecordPayout, onLogFee, canRecordPayout, canLogFee,
}) {
  const options = useMemo(() => ledgerFilterOptions(ledger), [ledger]);
  const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const narrowed = rows.length !== ledger.length;

  return (
    <Card className="fin-card fin-ledger-card">
      <div className="fin-card-head">
        <div className="fin-card-titles">
          <h3>All Transaction Logs</h3>
          <p className="fin-card-sub">Every payout and fee on one signed timeline.</p>
        </div>
      </div>

      <LedgerControls
        view={view}
        onView={onView}
        search={filters.search}
        onSearch={(search) => setFilters((f) => ({ ...f, search }))}
        options={options}
        categories={filters.categories}
        firms={filters.firms}
        onToggleCategory={(c) => setFilters((f) => ({ ...f, categories: toggle(f.categories, c) }))}
        onToggleFirm={(v) => setFilters((f) => ({ ...f, firms: toggle(f.firms, v) }))}
        onClearFilters={() => setFilters((f) => ({ ...f, categories: [], firms: [] }))}
        onRecordPayout={onRecordPayout}
        onLogFee={onLogFee}
        canRecordPayout={canRecordPayout}
        canLogFee={canLogFee}
      />

      {/* A filtered table always says how much it is hiding — the same convention as
          the Trade Log toolbar's "N trades". */}
      <div className="fin-count">
        {narrowed
          ? `${rows.length} of ${ledger.length} transactions`
          : `${ledger.length} transaction${ledger.length === 1 ? '' : 's'}`}
      </div>

      <LedgerTable rows={rows} filtered={narrowed} />
    </Card>
  );
}
