# Frog

A personal execution system: capture, auto-prioritise, plan tomorrow the night before, eat the Frog, focus, finish.

Offline-first PWA (React + IndexedDB) with a small Node server that keeps one JSON file as the source of truth.

## Run locally

```bash
npm install
npm run build
node server/dist/index.js      # http://localhost:3080, password "frog" in dev
```

Development with live reload, in two terminals: `npm run dev:server` and `npm run dev:client` (http://localhost:5173).

Tests: `npm test` · Typecheck: `npm run typecheck` · Lint: `npm run lint`

## Deploy

See [deploy/DEPLOY.md](deploy/DEPLOY.md). Short version: `deploy/deploy.sh`.

## Layout

- `shared/`: schemas and all pure logic (quadrants, day boundary, merge, suggestions, quick-add parser)
- `server/`: Express API, safe JSON persistence, backups, auth
- `client/`: React PWA
- `deploy/`: systemd unit, Nginx template, deploy scripts

Docs: [docs/PRD.md](docs/PRD.md) (what Frog does and why, feature status, backlog) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (how it's built). Both are living documents: update them in the same commit as the change.

Background: [PLAN.md](PLAN.md) (original milestones) and [DECISIONS.md](DECISIONS.md) (calls made along the way).
