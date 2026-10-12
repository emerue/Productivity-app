# Frog: Client Brief

|                    |                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------- |
| **Client**         | Jude Emerue                                                                                  |
| **Date**           | 11 Oct 2026                                                                                  |
| **Companion docs** | [PRD.md](PRD.md) (features and status) · [ARCHITECTURE.md](ARCHITECTURE.md) (how it's built) |

Frog is a personal execution app that turns a growing to-do list into a short daily plan; this brief sets out what the client needs from its next phase.

## Background

The client, Jude Emerue, works in service delivery at Heirs Technologies and runs two side projects, Siren and ABZUURD. Work tickets, follow-ups with colleagues, monthly reports, side-project tasks and personal errands all compete for the same attention.

Microsoft To Do captured these well but did not help decide what mattered each day. Lists kept growing, urgent items crowded out important ones, and recurring work such as the monthly service review report had to be remembered by hand.

Frog replaces it. It sorts every task into an urgent/important matrix (Do, Schedule, Delegate, Drop), asks for a short plan each evening, and puts the single most important task, the "Frog", first each morning.

## Objectives

The goal is for Frog to fully replace Microsoft To Do as the client's daily tool.

| Objective                               | Measured by                                                             |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Plan each working day in about a minute | Most working days have a saved plan                                     |
| Do the most important task first        | The Frog is completed on most planned days                              |
| Never miss recurring work               | No monthly or weekly report slips                                       |
| Keep the backlog honest                 | Overdue count trends down; untouched low-value tasks archive themselves |
| Work anywhere, including offline        | Capture and completion work on the phone with no signal and sync later  |
| One tool, not two                       | Microsoft To Do is no longer opened                                     |

## The user

Frog has one user: the client. There are no teams, shared lists or other accounts.

- **Devices:** a phone (installed as an app) for capture through the day, and a laptop for planning and review.
- **Work mix:** Heirs service delivery (tickets, cirvit, audits, reviews), the Siren and ABZUURD projects, and personal and travel items, each kept as a list.
- **Rhythm:** often works past midnight in Lagos, so a "day" runs until 04:00, not midnight.
- **Habits to support:** quick capture between meetings, chasing people for follow-ups, and recurring monthly reporting.

## Scope

The first version is live at `frog.45-77-62-61.sslip.io`; the next phase finishes recurring tasks and makes the daily plan harder to miss.

| Area               | What it covers                                                                                             | Status     |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | ---------- |
| Capture            | One-line quick add with shortcuts for list, date, urgency and My Day; lands in the list you are viewing    | Live       |
| Prioritise         | Matrix (Do, Schedule, Delegate, Drop) worked out from importance and due date; drag to move                | Live       |
| Plan               | Evening "Plan tomorrow" in three steps; My Day with the Frog on top; leftovers from earlier days           | Live       |
| Do                 | Focus timer with steps and notes; complete with undo                                                       | Live       |
| Organise           | Lists, search, sorting (recently updated first), one menu per task to edit, move or delete                 | Live       |
| See ahead          | Agenda by day or week: due, planned, follow-ups, overdue                                                   | Live       |
| Sync and offline   | Works offline on phone and laptop; changes merge across devices                                            | Live       |
| Install and data   | Installable app, settings, export and import, nightly backups                                              | Live       |
| Recurring tasks    | Daily, weekdays, weekly, monthly, yearly or custom; next one appears on completion; previews in the Agenda | Built      |
| Empty My Day       | Bring unfinished tasks into today in one tap when nothing is planned                                       | Next phase |
| Agenda and My Day  | Show what is already planned in the Agenda; add to My Day from it                                          | Next phase |
| List groups        | Folders for related lists                                                                                  | Next phase |
| Desktop search     | Search box in the sidebar                                                                                  | Next phase |
| Automated UI tests | Browser tests for every flow, run before each release                                                      | Next phase |

**Out of scope:** other users or sharing, email and calendar integration, times of day and timed reminders, native app-store apps.

## Requirements and constraints

New work must fit the existing product and its small, low-cost setup.

| Area     | Requirement                                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Platform | Installable web app (PWA) on Android, iPhone and desktop browsers; no app-store build                                                   |
| Offline  | Every action works offline and syncs later; no edit may be lost                                                                         |
| Stack    | TypeScript throughout: React web app, Node.js and Express server, shared rules between them                                             |
| Data     | One user; data kept in a single file on the server, backed up hourly and daily; export and import must keep working                     |
| Hosting  | The client's own 1 GB VPS, shared with other services; Frog must stay under 300 MB of memory                                            |
| Security | Single password sign-in over HTTPS; no third-party services or tracking                                                                 |
| Timezone | Africa/Lagos, with the day boundary at 04:00                                                                                            |
| Design   | Calm and uncluttered: green only for the Frog and Start, quiet secondary information, long lists scroll in place, light and dark themes |
| Speed    | Capture in seconds: one input and a single tap or Enter to add                                                                          |

## Deliverables and ways of working

Each change ships as working, tested software on the live server, with the docs updated alongside it.

- **Working features** deployed to the client's server, with automatic rollback if a release fails its health check.
- **Tests** for every rule and flow: unit tests run before each release; browser tests cover phone and desktop.
- **Living documents** in the repository, updated in the same change: the PRD (features and status), the architecture document, and the decision log.
- **Code** in the client's GitHub repository (`emerue/Productivity-app`), on `main`.
- **Release notes** in plain language: what changed and anything the client needs to do (for example, updating the app on the phone).
- **Approval:** the client agrees scope before work starts, and confirms before each deploy.

## Open questions for the client

These need answers before the next phase is planned.

- [ ] **Budget:** is there a budget or hours cap for the next phase?
- [ ] **Timeline:** is there a target date, for example before the next monthly report cycle?
- [ ] **Empty My Day:** keep choosing the day each morning, with leftovers one tap away (recommended), or carry unfinished tasks over automatically?
- [ ] **Start screen:** should the app open on My Day or on the Agenda?
- [ ] **Priorities:** which next-phase items matter most after recurring tasks?
- [ ] **Reminders:** are timed reminders wanted later? They need times of day on tasks, which are out of scope today.
- [ ] **Domain:** keep the free sslip.io address, or move to a custom subdomain?
