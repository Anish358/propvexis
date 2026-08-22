import React from 'react';
// PHASE 4b — on the shared Modal shell. This modal had no Escape, no role, no focus
// trap, no focus return and no scroll lock, and it did not portal; all six come from
// the shell now.
import { Modal } from '@/components/primitives';
import TradeSettingsPanel from './TradeSettingsPanel.jsx';

// Trade Settings, as a modal — the quick way in, opened from the Trade Log's toolbar
// and the top bar's avatar menu so the columns can be changed while you are looking
// at them.
//
// THE CONTROLS ARE NOT HERE ANY MORE, AND THAT IS THE POINT. They are
// `TradeSettingsPanel`, which Settings > Trade Settings renders too — see that file
// for why the settings have one implementation and two frames rather than two copies.
// What is left in this file is a dialog: a title, a way out, and nothing else.
//
// NO SAVE BUTTON, BY DESIGN. The panel writes straight through to App's persisted
// `tradeSettings`, so every change has already applied by the time you read it. The
// footer says Done because there is nothing left to commit.
export default function TradeSettingsModal({
  open, onClose,
  beRounding, setBeRounding,
  columnOverrides = {}, setColumnVisible, resetColumns,
}) {
  if (!open) return null;

  return (
    <Modal onClose={onClose} className="ts-modal" label="Trade Settings">
      <header>
        <h2>Trade Settings</h2>
        <button className="x" onClick={onClose} aria-label="Close">×</button>
      </header>

      <TradeSettingsPanel
        beRounding={beRounding}
        setBeRounding={setBeRounding}
        columnOverrides={columnOverrides}
        setColumnVisible={setColumnVisible}
        resetColumns={resetColumns}
      />

      <footer>
        <span className="footer-spacer" />
        <button className="primary" onClick={onClose}>Done</button>
      </footer>
    </Modal>
  );
}
