# Decisions

Small calls made while building. The brief's settled decisions are not repeated here, only the gaps it left open.

## Tooling

- **Shared code consumption.** `@frog/shared` compiles with `tsc -b` to `shared/dist` for the server at runtime. The client (Vite) and Vitest alias `@frog/shared` to `shared/src/index.ts`, so no build step is needed in dev or tests. Server dev (`tsx watch`) builds shared once first.
- **Brief path `/shared/schema.ts`** lives at `shared/src/schema.ts` (all shared sources sit under `src/`).
- **zod v3 API** (`zod@3.25`) because it is stable and well understood.
- **React Router v6**, library mode (`BrowserRouter`). No data routers, because nothing is loaded per route.
- **Express 5**, so async handler errors reach the error middleware without wrappers.
- **Node version.** The code runs on Node `>=20.19`. `DEPLOY.md` installs Node 22 LTS because Node 20 reached end-of-life in April 2026. See PLAN.md open questions.

## Data

- **`restore: true` marker** is an optional field on `List` and `Task`. Subtasks also get an optional `deletedAt` so the nightly purge can age them out.
- **`Store.epoch`** (random string) was added next to `schemaVersion`. An import replaces the store and changes the epoch. A client that syncs with an old epoch gets `409` and reloads the full store instead of merging stale data back in. Without this, "import replaces" would be undone by the next device that syncs.
- **Frog vs My Day.** `days[date].frog` holds the Frog. `days[date].myDay` holds the _other_ planned tasks, in order. The frog id never appears in `myDay`. The "full day" hint counts `frog + myDay.length`. Making a new Frog when one exists moves the old one to the top of `myDay`.
- **Carry forward logs `postponed`.** In evening planning, "Tomorrow" logs `postponed { from: today, to: tomorrow }`. Without this, a Frog that is carried forward night after night would never count as "keeps slipping". "Pick a date" logs `postponed { from: previous due or today, to: date }`.
- **Undo of completion** reopens the task and appends `reopened` (history is append-only). Undo of delete is an explicit restore (`deleted: false, restore: true`).
- **Merge tie-break.** When two versions have the same `updatedAt` but different content, the one whose JSON sorts later wins. This makes merge commutative, so the server and every client converge.
- **Archived completed tasks (90 days)** are written to `archive/YYYY.json` and then tombstoned in the live store, so clients drop them on the next sync. The tombstone is purged 30 days later as usual.
- **Drop auto-archive** runs on the server: at boot and nightly at 03:10 in the user's timezone.

## Dates and parsing

- **Weekday tokens** (`^mon`…`^sun`) mean the next occurrence _after_ today. Typing today's weekday gives next week; use `^today` for today. Full names (`^thursday`) also work.
- **Day/month without a year** (`^12oct`, `^12/10`) resolves to whichever of last year, this year, or next year is closest to today. In December, `^5/1` means next January. On 27 Sep, `^12/9` means 12 Sep this year and shows as overdue.
- **`^tom`** also accepts `^tomorrow`.
- **"Due today, not planned"** includes overdue open tasks as well as tasks due today. Otherwise overdue tasks outside My Day would be invisible on the main screen.

## Auth

- **Stateless signed cookie** holding an expiry timestamp, renewed when less than 60 days remain. Signing out clears the cookie on that device. Rotating `SESSION_SECRET` signs out every device.
- **Login rate limit** counts failed attempts only (`skipSuccessfulRequests`): 5 per 15 minutes per IP.
- **Dev defaults.** When `NODE_ENV` is not `production`, missing env gets dev defaults: data in `./.data`, password `frog`, cookie not `Secure`. Production refuses to start without `PASSWORD_HASH` and `SESSION_SECRET`.

## Client

- **Sound.** The chime is synthesised with Web Audio, so there is no audio asset and nothing extra to precache.
- **Notification permission** is requested on the first press of a timer preset, which counts as a user gesture. It is used only for the foreground end-of-timer notification.
- **Task detail** is addressed by `?task=<id>` on the current route, so it overlays any screen and survives reload.
- **Sign out** warns when the outbox has unsynced changes, then clears local data on that device.

## Design system

- **Text on green in dark mode.** The brief says primary buttons have white text on `--frog`. In dark mode `--frog` is `#6FBF93`, and white on it is about 2:1, which fails AA. `--on-frog` is white in light mode and `#0F1A14` in dark mode. `--on-danger` follows the same rule.
- **Non-Start emphasis uses ink, not green.** Green is reserved for Frog UI, Start, the running timer and focus rings. Actions that need weight but aren't Start (Sign in, a dialog's confirm, planning's Next/Finish) use `btn--ink`: `--ink` fill with `--paper` text, the same pair as toasts.
- **`--ink-3` contrast (not changed, flagged).** Dimmed tasks use `--ink-3` as the brief specifies. On `--paper` that is about 2.5:1 in light mode and 3.7:1 in dark mode, below AA for body text. The tokens are kept as written because dimming is a deliberate de-emphasis and the text is still readable. If strict AA matters more, darken `--ink-3` to about `#79827D` (light).

- **Matrix cells are separated by hairlines, not drawn as four cards**, to avoid "identical rounded cards for everything". The mobile overview uses the same hairline 2×2.
- **Empty copy for Schedule, Delegate and Drop** (the brief only gives Do): "Nothing scheduled.", "Nobody to wait on.", "Nothing to drop."
- **Ordering inside quadrants and lists** uses the suggestion score for today (then due date, then age), so the most pressing task is always on top without a separate sort setting.
- **Due-date conflict** is a small dialog (bottom sheet on mobile) with a date field, "Change date" and "Keep as is". The move itself is applied at once (flags set), so "Keep as is" just leaves the task in Do until the date moves out of the window.
- **Swipe actions** are Start (green, it is a Start action), Move to and My Day, on ink.

## Deployment

- **Build on the laptop, not the server (changes the brief's `deploy.sh`).** The brief's script pulls and builds on the VPS. The VPS is a shared 1 vCPU / 1 GB box, and the Vite build can briefly need hundreds of MB. So `deploy.sh` builds, typechecks and tests locally, then uploads a ~400 KB release. The server runs `npm ci --omit=dev -w server` (77 runtime packages) and restarts. Measured runtime use is about 70 MB. The systemd unit caps Frog at `MemoryMax=300M` so it can't squeeze the other services.
- **No git clone on the server.** Releases are unpacked into `/srv/frog/releases/<utc-stamp>-<commit>` and `/srv/frog/app` is an atomic symlink switch. The last 5 are kept. A failed health check rolls back automatically. The server needs no GitHub credentials.
- **One script, several actions.** `deploy.sh` (release, password, status, rollback, tunnel, https, backup) runs on the laptop and sends `remote.sh` over SSH. Both are idempotent, so there is no separate server-setup script.
- **Password never leaves the laptop.** `deploy.sh password` hashes locally and sends only the bcrypt hash.
- **Server address is not committed.** `FROG_HOST` lives in the git-ignored `deploy/deploy.env`.
- **Certificates** use `certbot certonly --nginx`, and then the full site from `nginx.conf.template` is enabled only if `nginx -t` passes. The template uses `listen 443 ssl http2` because Ubuntu 24.04 ships Nginx 1.24 (`http2 on;` needs 1.25.1).
- **Before a domain exists:** `deploy.sh tunnel` uses Frog at `http://localhost:3080` over SSH. Frog is not exposed on the bare IP over plain HTTP, because the session cookie is `Secure` and the password would cross the network unencrypted.
- **Off-server backups** use `scp` (`deploy.sh backup`) because Git Bash on Windows has no rsync. The brief's rsync command is in DEPLOY.md for macOS, Linux and WSL.

## Proposed (not built)

(Features that seem missing from the brief. Listed here, not built.)
