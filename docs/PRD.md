# Frog: Product Requirements

|                    |                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Owner**          | Jude Emerue                                                                                                         |
| **Status**         | Live (single user), in active development                                                                           |
| **Live at**        | `https://frog.45-77-62-61.sslip.io` (installable PWA)                                                               |
| **Last updated**   | 3 Oct 2026                                                                                                          |
| **Companion docs** | [ARCHITECTURE.md](ARCHITECTURE.md) (how it's built) · [../DECISIONS.md](../DECISIONS.md) (individual calls and why) |

> **Keeping this current.** Update this file in the same commit as any change to what Frog does: move a feature's status, add or change a requirement, and add a line to the [Changelog](#11-changelog). Statuses: **Live** (deployed), **Built** (merged, not deployed), **Planned**, **Idea**.

---

## 1. Summary

Frog is a personal execution system: a to-do app built around doing the right few things each day, not just listing everything. You capture tasks fast, Frog sorts them into an Eisenhower matrix (Do, Schedule, Delegate, Drop), you plan the day (ideally the night before), you "eat the Frog" (do the one important task first), focus on it with a timer, and finish.

It runs as an installable web app on phone and laptop, works offline, and syncs through a small server on a personal VPS.

## 2. Problem

- To-do lists grow without limit, and every day starts with the whole pile, not a plan.
- Most apps treat every task as equal; urgent work crowds out important work.
- Work tasks (Heirs: service delivery, cirvit, audits) and side projects (Siren, ABZUURD) and personal items compete in one head.
- Microsoft To Do was used before. It captures well but doesn't help decide what matters today, and recurring work (monthly reports) has to be remembered.

## 3. User

One user (Jude), on an Android or iPhone phone and a laptop.

- Works in service delivery at Heirs Technologies; juggles tickets, follow-ups with people, reports and reviews.
- Runs side projects (Siren, ABZUURD) plus personal and travel items.
- Captures on the phone throughout the day; plans and reviews on the laptop or phone.
- Timezone Africa/Lagos. Often works past midnight, so "today" lasts until 04:00.

No other users, no sharing, no teams. This is a deliberate constraint (see Non-goals).

## 4. Principles

1. **Capture in seconds.** One input, natural tokens (`@list ^fri !u +`), lands where you are.
2. **Frog decides priority from facts, not vibes.** Importance is yours; urgency comes from the due date.
3. **Today is a choice.** My Day is a short list you commit to, not everything due.
4. **One Frog first.** The single most important task gets the top of the screen and the focus.
5. **Never lose work.** Offline-first, every edit saved on the device, undo on destructive actions, backups on the server.
6. **Calm interface.** Few colours (green only for Frog and Start), quiet secondary information, nothing stretching endlessly.

## 5. Goals and non-goals

**Goals**

- Replace Microsoft To Do as the daily driver.
- Make the daily plan take about a minute.
- Keep recurring work from being forgotten.
- Work fully offline on the phone and sync when back online.

**Non-goals (for now)**

- Multiple users, shared lists, assignment to others (Delegate tracks who you're waiting on, nothing more).
- Email, calendar or Outlook integration.
- Time-of-day scheduling (tasks have dates, not times).
- Native mobile apps (the PWA covers install, offline and home-screen launch).

## 6. Core concepts

| Concept         | Meaning                                                                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Task**        | Title, list, importance, optional due date, steps, notes, optional repeat.                                                                                                                                                                              |
| **List**        | A project or area (Heirs, Siren, ABZUURD, Personal, travel…). Every task is in exactly one list.                                                                                                                                                        |
| **Quadrant**    | Derived, never stored. _Important_ is set by you; _urgent_ = flagged urgent or due within the urgency window (default 2 days, overdue included). Important + urgent = **Do**, important = **Schedule**, urgent only = **Delegate**, neither = **Drop**. |
| **My Day**      | The tasks you chose for a given day (Frog + others). Starts empty each day.                                                                                                                                                                             |
| **Frog**        | The one important task to do first today. Shown as a card at the top of My Day.                                                                                                                                                                         |
| **Logical day** | A day runs from 04:00 to 04:00 (setting), so 00:30 still belongs to the previous day.                                                                                                                                                                   |
| **Agenda**      | A calendar view (day or week) of what falls on each date, filled in automatically.                                                                                                                                                                      |
| **Repeat**      | A rule (daily, weekdays, weekly, monthly, yearly, custom) that brings a task back after it's completed.                                                                                                                                                 |

## 7. Features

### 7.1 Capture

| Requirement                                                                                                                                                          | Status |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Quick add on every main screen (inline on desktop, **+** button and bottom sheet on phone)                                                                           | Live   |
| Tokens: `@list` (existing or new list), `^date` (today, tom, weekday, `12oct`, `12/10`, ISO), `!u` urgent, `!n` not important, `+` add to My Day, `>Name` waiting on | Live   |
| Tokens show as removable chips while typing                                                                                                                          | Live   |
| Defaults follow the screen: inside a list → that list; My Day → added to My Day; Agenda day → due that day; otherwise the default list (Settings)                    | Live   |
| Visible list picker and My Day toggle under the input                                                                                                                | Live   |
| Phone: **Add** button adds and closes; keyboard Enter/Done adds and stays open; works while the keyboard is composing a word                                         | Live   |
| Repeat tokens: `*daily`, `*weekdays`, `*weekly`, `*monthly`, `*yearly`, `*2w` (every n d/w/m/y)                                                                      | Live   |

### 7.2 Prioritise (Matrix)

| Requirement                                                                                                        | Status |
| ------------------------------------------------------------------------------------------------------------------ | ------ |
| Matrix: 2×2 on desktop with drag between cells; overview + per-quadrant view on phone                              | Live   |
| Each quadrant says what it means ("Important and urgent"…); the phone overview lists each quadrant's top 3 tasks   | Built  |
| Move to quadrant from any task; moving to Schedule/Drop while the due date keeps it urgent asks to change the date | Live   |
| Delegate captures "Waiting on" and a follow-up date                                                                | Live   |
| Tasks left in Drop are archived automatically after 14 days (setting)                                              | Live   |
| Ordering by a deterministic score (quadrant, due, carried over, times postponed, has a next step)                  | Live   |

### 7.3 Plan

| Requirement                                                                                                                                                                             | Status                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Evening banner from plan time (default 20:00): **Plan tomorrow** in three steps (review today's leftovers: tomorrow / pick a date / drop; choose tasks with suggestions; pick the Frog) | Live                      |
| **Plan today** for a day that wasn't planned                                                                                                                                            | Live                      |
| A Frog that keeps slipping (postponed twice, no steps) gets a prompt to slice it into steps                                                                                             | Live                      |
| My Day: Frog card, planned tasks at full strength, "full day" hint past Frog + 4; **Plan tomorrow** (or **Plan today**) button in the header                                            | Built                     |
| My Day: "Needs a decision" block (due today or overdue; left over from the last 14 days), first 3 of each shown, Add / Add all; "Completed"                                             | Built                     |
| Task rows: title, then one line of details in words (due, next step with progress or who it's waiting on, list, repeat); no colour edge                                                 | Built                     |
| My Day empty state that surfaces leftovers prominently ("Bring them into today")                                                                                                        | Idea (see Open questions) |

### 7.4 Do

| Requirement                                                                                                                     | Status |
| ------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Focus mode: timer presets (5/25/50), pause/resume, end, wall-clock accurate, screen wake lock, chime, steps and notes alongside | Live   |
| Focus sessions logged; a running session survives reload                                                                        | Live   |
| Steps with "Slice it", next step shown on the row, complete-with-open-steps confirmation                                        | Live   |
| Complete from row, swipe right, Frog card or keyboard (X), with undo                                                            | Live   |

### 7.5 Organise

| Requirement                                                                                            | Status |
| ------------------------------------------------------------------------------------------------------ | ------ |
| Lists: create, rename, delete (moving tasks to another list)                                           | Live   |
| Row **⋯** sheet: edit, My Day, quadrant, due date, move to list, delete (undo), repeat                 | Live   |
| Task panel: title, due, repeat, quadrant, list, waiting on / follow-up, steps, notes (links clickable) | Live   |
| List sort: Recently updated (default), Priority, Due date, Name; remembered per device                 | Live   |
| Search across all tasks                                                                                | Live   |
| Completed and Archived views                                                                           | Live   |
| Open counts in the sidebar                                                                             | Live   |
| List groups / folders                                                                                  | Idea   |
| Search in the desktop sidebar                                                                          | Idea   |

### 7.6 See ahead (Agenda)

| Requirement                                                                                                           | Status |
| --------------------------------------------------------------------------------------------------------------------- | ------ |
| Day and Week views (weeks start Monday), prev/next/today, range in the URL                                            | Live   |
| Each day: tasks due, tasks planned into that day's My Day, Delegate follow-ups; overdue on top while today is in view | Live   |
| Busy days in the week scroll inside a capped box                                                                      | Live   |
| Future occurrences of repeating tasks shown as quiet previews (no checkbox, not counted; tap opens the task)          | Live   |
| A preview's colour is the quadrant the task will be in on that day                                                    | Live   |
| Mark which Agenda rows are already in My Day; add to My Day from the Agenda                                           | Idea   |

### 7.7 Repeat

| Requirement                                                                                                                                                        | Status |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Set a repeat: Never, Daily, Weekdays, Weekly on <day>, Monthly on the <nth>, Yearly on <date>, Custom (every n days/weeks/months/years; weekday toggles)           | Live   |
| Completing a repeating task creates the next one (same title, list, flags, notes, steps unticked) and says when ("Next on Thu 1 Oct"); undo restores one open task | Live   |
| Missed occurrences are skipped; monthly dates don't drift after short months                                                                                       | Live   |
| ↻ mark after the due date on rows and the Frog card                                                                                                                | Live   |
| Rescheduling one occurrence keeps the pattern; clearing the due date ends the series                                                                               | Live   |
| Evening planning's **Drop** (which clears the due date) also ends the series                                                                                       | Live   |

### 7.8 Sync, offline and install

| Requirement                                                                                     | Status |
| ----------------------------------------------------------------------------------------------- | ------ |
| Works offline; every change saved on the device first, synced within about a second when online | Live   |
| Edits on two devices merge without losing either (per field, notes and steps separately)        | Live   |
| Installable (manifest, icons, iOS tip); update notice when a new version is ready               | Live   |
| Single password sign-in; stays signed in for months; sign out warns about unsynced changes      | Live   |

### 7.9 Settings and data

| Requirement                                                                                                                                            | Status |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Plan time, day start hour, timezone, timer presets, urgency window, Drop auto-archive days, default list, wake lock, sounds, theme (system/light/dark) | Live   |
| Export the whole store as JSON; import replaces it (backed up first)                                                                                   | Live   |
| Server backups: hourly (48 kept), daily (30 kept), before import or migration; completed tasks older than 90 days move to a yearly archive file        | Live   |

## 8. Key flows

**Capture on the phone.** Tap **+** → type "Follow up with Kola ^fri" → tap **Add**. It lands in the list you're viewing (or the default list), due Friday, and shows a toast saying where it went.

**Evening plan (about a minute).** At 20:00 the banner appears → Plan tomorrow → for each leftover: Tomorrow / Pick a date / Drop → pick tasks from suggestions → confirm the Frog → done.

**Morning.** Open My Day → the Frog card is on top → **Start** opens Focus → complete → next task.

**Recurring report.** Create "Monthly service review report", due the 28th, Repeat → Monthly on the 28th. Complete it each month; the next one appears with the steps reset. The Agenda shows next month's as a preview.

## 9. Success measures (personal)

- A plan exists for most working days (days with `planned: true`).
- The Frog is completed on most planned days.
- No recurring report is missed.
- Overdue count trends down; Drop auto-archives instead of rotting.
- Microsoft To Do is no longer opened.

## 10. Open questions and backlog

| #   | Question / item                                                                                                                                         | Notes                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | **My Day when nothing is planned.** Prominent "Bring them into today" (keep daily choice) vs automatic carry-over of unfinished My Day tasks (setting). | Recommended: the prominent empty state.                             |
| 2   | **Agenda and My Day overlap for today.** Mark My Day rows in the Agenda, add to My Day from it, or make the Agenda the start screen.                    |                                                                     |
| 3   | **Deploy repeating tasks** and set "Monthly service review report" to monthly on the 28th.                                                              | Deployed 12 Oct 2026; setting the report to monthly is yours to do. |
| 4   | List groups / folders (like To Do's "project tasks").                                                                                                   |                                                                     |
| 5   | Search in the desktop sidebar.                                                                                                                          |                                                                     |
| 6   | Reminders / notifications at a time (push). The schema already reserves `pushSubscriptions`.                                                            | Needs times on tasks, a non-goal for now.                           |
| 7   | Notes from To Do for three imported tasks weren't visible; copy by hand.                                                                                | Data, not product.                                                  |
| 8   | Bring the browser end-to-end scripts into the repo so they run with `npm test`.                                                                         | See ARCHITECTURE §10.                                               |

## 11. Changelog

Newest first. One line per user-visible change; link the commit.

| Date       | Change                                                                                                                                                                                                   | Commit                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 2026-10-12 | Clearer My Day, rows and Matrix: "Needs a decision" block, visible Plan button, rows say due dates and step progress in words, quadrants explain themselves. Fixed My Day styles that were never loaded. | Built, not deployed   |
| 2026-10-12 | Drop in evening planning ends a repeat; Agenda previews use the real quadrant colour; Drop auto-archive also clears My Day. Internal restructure (task commands, Day module, sync engine) with tests.    | `e040871`             |
| 2026-10-03 | Repeating tasks (picker, tokens, auto next, Agenda previews). PRD and architecture docs.                                                                                                                 | `e040871`             |
| 2026-09-30 | Phone **+** sheet: **Add** button adds; keyboard Enter adds even while composing.                                                                                                                        | `98639a6`             |
| 2026-09-29 | List sorting (recently updated first); sticky headers; long sections scroll in capped boxes.                                                                                                             | `8ecadf3`             |
| 2026-09-28 | Quick add follows the screen; row ⋯ actions; Agenda (day/week); list names on rows, sidebar counts, My Day "Completed" and "From earlier days". Open Microsoft To Do tasks imported.                     | `eb92697`             |
| 2026-09-28 | Deployed to the VPS on `frog.45-77-62-61.sslip.io` (HTTPS, installable).                                                                                                                                 | `c7994c9`, `08673d2`  |
| 2026-09    | V1 built in milestones M0–M9: data model and sync, My Day, Matrix, Lists, Focus, evening planning, settings and PWA, deployment.                                                                         | `e31e40d` and earlier |
