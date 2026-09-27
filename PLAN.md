# Frog — build plan

Source of truth: the build brief. This file covers how the work is split up and where the code lives.

## Milestones

| # | Scope | Done when |
|---|---|---|
| M0 | Monorepo (npm workspaces), strict TS, ESLint + Prettier, Vitest, PLAN/DECISIONS | `npm test`, `npm run lint`, `npm run typecheck` pass on an empty skeleton |
| M1 | `/shared`: zod schemas, ids, dates, `logicalDate`, quadrant, next action, history, suggestions, quick-add parser, merge | All pure logic has unit tests |
| M2 | `/server`: in-memory store + atomic JSON persistence, write queue, validation, tombstones, backups, migrations, archiving, auth, every V1 endpoint | API tests cover sync merge, tombstones, auth, import/export, crash-safe writes |
| M3 | Client data layer: IndexedDB, Zustand store, outbox, sync loop, offline/error indicators, login | App boots offline from IndexedDB; edits sync |
| M4 | My Day, Frog card, task rows, dimming, task detail (sheet/panel), steps + Slice it, notes, completion + undo, hints, "Due today, not planned", quick add | Acceptance 1, 2, 5, 6 |
| M5 | Matrix (desktop 2×2 drag, mobile overview + quadrant view), Move to…, due-date conflict prompt, Delegate fields, Drop auto-archive, Lists CRUD, Completed/Archived, search | Acceptance 3 |
| M6 | Focus Mode: presets, wall-clock timer, wake lock, end screen, session log, reload recovery | Acceptance 7 |
| M7 | Evening planning: banner, 3-step flow, "Plan today", slipping prompt | Acceptance 4 |
| M8 | Settings, export/import, sign out, manifest, icons, service worker, update toast, iOS tip | Acceptance 11, 12 |
| M9 | `/deploy`: systemd, Nginx, env, deploy script, DEPLOY.md | Written down step by step |
| M10 | Polish pass at 320/390/768/1280, light/dark, keyboard only, reduced motion | Acceptance 13 |

## File tree (target)

```
/package.json              workspaces, root scripts
/tsconfig.base.json
/vitest.config.ts          projects: shared, server, client
/eslint.config.js  /.prettierrc
/shared
  src/index.ts
  src/constants.ts         APP_NAME and defaults
  src/schema.ts            zod schemas + inferred types (brief section 4)
  src/ids.ts               prefixed nanoids
  src/dates.ts             YYYY-MM-DD arithmetic, logicalDate, planning window
  src/quadrant.ts          urgency, quadrant, flags for manual moves, due conflict
  src/tasks.ts             next action, step progress, postponeCount, history append (cap 100)
  src/suggestions.ts       deterministic scoring
  src/quickadd.ts          quick-add grammar
  src/merge.ts             entity/task/store merge, future-timestamp clamp
  src/seed.ts              first-boot store
  test/*.test.ts
/server
  src/index.ts             boot, signals
  src/app.ts               express app factory (testable)
  src/config.ts            env
  src/auth.ts              signed-cookie session, login rate limit
  src/store/manager.ts     in-memory state, write queue, debounced atomic flush
  src/store/atomic.ts      tmp + fsync + rename
  src/store/backups.ts     hourly/daily/pre-migration/pre-import
  src/store/jobs.ts        tombstone purge, drop auto-archive, 90-day archive, cron
  src/migrations/index.ts  sequential migrations
  src/scripts/hash-password.ts
  test/*.test.ts
/client
  index.html  vite.config.ts
  public/fonts/*.woff2  public/icons/*
  src/main.tsx  src/App.tsx  src/sw.ts
  src/data/                db (idb), store (zustand), sync, api, actions
  src/lib/                 time, sound, wakeLock, keyboard, format
  src/components/          FrogCard, TaskRow, TaskDetail, QuickAdd, Sheet, Toasts, ...
  src/screens/             MyDay, Matrix, Lists, ListView, Focus, Plan, Settings, Login
  src/styles/              tokens.css, base.css, components.css, screens.css
  scripts/icons.mjs        renders all icons from icon.svg
/deploy
  frog.service  nginx.conf.template  .env.example  deploy.sh  DEPLOY.md
```

## Open questions (not blocking — defaults chosen, see DECISIONS.md)

1. **Node version.** The brief says Node 20 LTS, but Node 20 reached end-of-life in April 2026. The code targets `>=20.19` so it runs on 20, but `DEPLOY.md` installs Node 22 LTS. To stay on 20, change one variable in the guide.
2. **Domain.** Placeholder `tasks.example.com` until you supply the subdomain.
