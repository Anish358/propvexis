# PropVexis MT5 sync agent

Runs MT5 on **our** Windows box instead of the trader's PC, so trades taken on the
**mobile app** reach the journal. The EA only runs inside a desktop terminal; a
trader with no PC had no live sync at all.

The agent leases one account at a time from the backend, logs a warm terminal in
with the account's **read-only investor password**, reads closed trades out of
history, and posts them to the same four ingest endpoints the EA uses. Dedup,
money-math derivation and alerting are therefore shared with the EA path — there is
one contract, with two producers.

Design and costing: `docs/superpowers/specs/2026-08-18-mt5-sync-farm-design.md`.

## Layout

| File | What it is |
|---|---|
| `sync_agent.py` | the loop: lease → login → scan → post → report |
| `history.py` | deal history → ingest JSON. A port of the EA's `ProcessHistoricalClose()`/`BuildJson()`. Imports nothing from MetaTrader5, so it is testable off-Windows |
| `mt5_session.py` | the warm terminal: `initialize`/`login`, the `trade_allowed` check, broker-clock calibration |
| `api.py` | HTTP client. Worker token for `/api/sync/*`, the account's own ingest token for trades |
| `setup.ps1` | one-shot box provisioning — the box is meant to be disposable |
| `test_history.py` | `python -m unittest discover -s agent` (also runs in CI) |

## The box

Currently EC2 `t3.medium` Windows Server 2022 in `ap-south-1`, ~$0.0632/hr, stopped
when idle (~$2.74/mo for the volume). **Stop it when you are not using it** — that
is the whole reason EC2 was chosen over Lightsail, which bills a stopped instance
in full.

```bash
aws ec2 stop-instances  --region ap-south-1 --instance-ids i-024c801aaa18b40a4
aws ec2 start-instances --region ap-south-1 --instance-ids i-024c801aaa18b40a4
```

The public IP changes across a stop/start (no Elastic IP, since an idle EIP costs
more than the volume). After starting, if the box is doing a first-run backfill,
put its new IP in `RATE_LIMIT_ALLOWLIST` — 200 trades is 200 ingest POSTs and the
global limit is 300/min per IP.

## Backend configuration

Two SSM parameters per environment:

| Name | What |
|---|---|
| `SYNC_CRED_KEY` | 32 bytes, base64. AES-256-GCM key for investor passwords at rest. Generate with `node -e "import('./src/platform/secretbox.js').then(m=>console.log(m.generateKey()))"` |
| `SYNC_WORKER_TOKEN` | the agent's bearer token. `openssl rand -hex 32` |

Without `SYNC_CRED_KEY` the credential endpoints return 503 by design: storing a
broker password we cannot encrypt is worse than not offering the feature.

## Per-firm terminals — CONFIRMED, not theoretical

The generic MetaQuotes build **does not know `GoatFunded-Server`**. Verified by byte
search of `C:\mt5\gft\config\servers.dat` (50 KB): `MetaQuotes` is present in
UTF-16, `Goat` is absent entirely.

The failure this causes is worth knowing by shape, because it looks like nothing:

1. `initialize()` starts the terminal, which loads fine and opens its listener;
2. unable to log in unattended, the terminal puts up a modal **`Login` dialog**
   (window class `#32770`) in front of its main window;
3. nothing completes the IPC handshake behind a modal dialog, so `initialize()`
   returns `(-10005, 'IPC timeout')` — or worse, blocks past its own timeout;
4. the terminal log shows a clean start and no error at all.

So each firm needs its own portable install of **that firm's build**, which ships the
server. `firm_key` on the credential selects it. There is no public download for
GFT's build — it comes from their client area, behind a login.

**One-time, per firm, by a human. Two ways:**

- **Install the firm's build** into `C:\mt5\<firm>\`, run it once with `/portable`,
  log in by hand to confirm, close it. Add a `firms` entry in `config.json`.
- **Or add the server to an existing build**: RDP in, open the terminal's login
  wizard and search the broker by name — MT5 queries MetaQuotes' online directory
  and writes the server into `servers.dat`. Cheaper if the firm is listed there.

Either way, verify before walking away:

```powershell
# Should print utf16=True once the server is known to this build
$b = [IO.File]::ReadAllBytes('C:\mt5\gft\config\servers.dat')
$n = [Text.Encoding]::Unicode.GetBytes('Goat')
(0..($b.Length-$n.Length)) | Where-Object { $i=$_; -not (0..($n.Length-1) | Where-Object { $b[$i+$_] -ne $n[$_] }) } | Select-Object -First 1
```

## The two things to verify on the first real account

Neither can be settled from documentation, and both can invalidate assumptions:

1. **Does our login disturb the trader's mobile session?** The investor password is
   a separate credential, so it should not — but confirm on the friend's GFT
   account before onboarding anyone else.
2. **Does the firm issue an investor password at all?** If GFT does not, that firm
   is blocked under our investor-only rule, and we say so rather than accepting a
   master password.

## The agent runs in an interactive session, and that is not negotiable

Running it as SYSTEM (session 0) was tried first and **does not work**.
`terminal64.exe` starts and sits there at ~195 MB, but session 0 has no window
station, so the terminal's IPC endpoint never comes up and `mt5.initialize()` fails:

```
initialize attempt 1/3 failed: (-10005, 'IPC timeout')
initialize attempt 2/3 failed: (-10005, 'IPC timeout')
```

That error is indistinguishable from a dead terminal, which is why it is worth
writing down: the terminal is fine, the *session* is wrong. Verified twice on
Windows Server 2022 with a 180s timeout before switching approaches.

So the box logs itself in as a dedicated **standard** account (`pvsync`) and the
agent runs as a scheduled task at logon. Three details that matter:

- The password is stored as an **encrypted LSA secret** via Sysinternals Autologon,
  not as a plaintext `DefaultPassword` registry value. Same functionality, and
  `setup.ps1` asserts the plaintext key is absent afterwards.
- It lives at `/propvexis/sync-farm/AUTOLOGON_PASSWORD` — deliberately **not** under
  `/amey-journal/*`, because `platform/secrets.js` maps every parameter under that
  prefix into the backend's `process.env`. A Windows password would have become an
  environment variable on the API box.
- `config.json` needs an explicit **Read** grant for the agent account. Its ACL is
  protected (inheritance off) and lists only SYSTEM + Administrators, so without
  that grant the agent cannot read its own config — and the symptom is a JSON error,
  not a permission error.

Confirm it landed in the right place after a reboot:

```powershell
quser                                                    # pvsync, console, session 1
Get-Process python,terminal64 | Select ProcessName,Id,SessionId   # SessionId must be 1
```

## Clock calibration, and why a sync can legitimately refuse

MT5 reports times in the **broker's** timezone dressed as a Unix timestamp. The EA
solves this with `TimeTradeServer() - TimeGMT()`; Python has no equivalent, so the
agent derives the offset from a **live tick** and caches it per server in
`clock-offsets.json`.

A stale tick (weekend, dead symbol) tells us nothing. With no fresh tick and no
cached value the job **fails with "server clock not calibrated"** rather than
guessing. That is deliberate: a wrong offset would mislabel every trade's session
and bucket trades into the wrong day for daily-drawdown maths — silently. The
condition clears itself at the next market open.
