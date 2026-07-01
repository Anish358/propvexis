import React from 'react';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const today = new Date();
const dateLabel = `${WD[today.getDay()]}, ${MO[today.getMonth()]} ${today.getDate()}`;

export default function PageHeader({ title, connected, onMenu, right }) {
  return (
    <header className="pagehead">
      <div className="ph-left">
        {onMenu && (
          <button className="ph-menu" onClick={onMenu} aria-label="Toggle menu">
            <span /><span /><span />
          </button>
        )}
        <div>
          <div className="ph-title">{title}</div>
          <div className="ph-date">{dateLabel}</div>
        </div>
      </div>
      {right && <div className="ph-right">{right}</div>}
    </header>
  );
}
