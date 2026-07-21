import React from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router-dom';

// Per-page actions no longer render their own row. Whatever a page passes as
// `right` (payout chip, Fees/Payouts/Manage buttons, export buttons, …) is
// portaled UP into the shared top bar's page-action slot, so the app shows a
// single bar and page content starts directly below it. `title`/`connected`/
// `onMenu` are accepted for backwards-compatible call sites but ignored.
export default function PageHeader({ right }) {
  const ctx = useOutletContext() || {};
  if (!right || !ctx.actionsSlot) return null;
  return createPortal(right, ctx.actionsSlot);
}
