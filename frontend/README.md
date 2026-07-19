# PropVexis — Frontend (Step 3)

Live trades grid that mirrors the spreadsheet and updates the instant a trade
closes (via the backend WebSocket). Click any row to tag the discretionary fields.

## Stack
- **React 18 + Vite**
- **socket.io-client** for live `trade:upserted` / `trade:updated` events
- Custom lightweight grid (no AG Grid) — keeps deps small and reproduces the
  Photon colored-cell look + the click-to-tag UX exactly.

## Run
The backend must be running first (see ../README.md).

```bash
npm install
cp .env.example .env.local   # optional; defaults to http://localhost:3000
npm run dev                  # http://localhost:5173
```

Set `VITE_BACKEND_URL` in `.env.local` if the backend isn't on `localhost:3000`.

## What you get
- **Columns** match the sheet: Date, Session, Pair, Setup, Probability, MTF Phase,
  SL Size, MFE, Max R, Fixed R Target, M15/H1/H4 links, Comments.
- **Live**: new trades appear at the top and flash green; a `live`/`offline`
  indicator reflects the socket connection.
- **Untagged trades** are highlighted and counted in the header.
- **Tagging**: click a row → modal with dropdowns (Setup / Probability / MTF Phase),
  chart-link fields, and comments → `PATCH /api/trades/:id`. Mechanical fields
  (pips, R, P&L) are read-only — they come from the EA.

## Files
```
src/api.js          REST + socket helpers
src/constants.js    select options, color slug, formatters
src/TradesTable.jsx the grid + colored pills
src/TagModal.jsx    tagging form
src/App.jsx         state, live merge, flash-on-new
src/styles.css      Photon dark theme
```

## Next (Step 4)
Summary / Yearly dashboards from backend aggregation views, reconciled against the
spreadsheet's numbers.
