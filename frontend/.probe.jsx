import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './src/app/Sidebar.jsx';
import { RailProvider } from './src/components/primitives';
import { AuthProvider } from './src/app/AuthContext.jsx';
import './src/styles/index.css';
class B extends React.Component {
  constructor(p){super(p);this.state={e:null};}
  static getDerivedStateFromError(e){return {e};}
  render(){ return this.state.e ? <pre id="err">{String(this.state.e && this.state.e.stack)}</pre> : this.props.children; }
}
window.addEventListener('error', (e) => { const d=document.createElement('pre'); d.id='winerr'; d.textContent=String(e.message); document.body.appendChild(d); });
createRoot(document.getElementById('root')).render(
  <B><MemoryRouter initialEntries={['/journal/trades']}><AuthProvider><RailProvider className="shell">
    <Sidebar />
    <main className="shell-main">after</main>
  </RailProvider></AuthProvider></MemoryRouter></B>,
);
