# CampusCheck — wireframes

Mobile-first (360 px), single responsive codebase. Desktop layouts widen the same components (two-column cards, tables gain columns) instead of introducing a second design.

## Student

### S1 — Dashboard (`/student`) — 1 tap to check in

```
┌──────────────────────────────────────┐
│ CampusCheck            ☾ Ada ▾       │
├──────────────────────────────────────┤
│ Good morning, Ada                    │
│ ⚠ Attendance warning: CSC 305 is 62% │
│ ┌──────────────────────────────────┐ │
│ │   [ Enter check-in code → ]      │ │  ← tap 1
│ └──────────────────────────────────┘ │
│ THIS WEEK                            │
│ ┌ Mon 10:00 CSC 301 · LT 2 ────────┐ │
│ │ Mon 14:00 CSC 305 · Lab 4         │ │
│ │ Wed 09:00 ENG 210 · Hall A        │ │
│ └──────────────────────────────────┘ │
│ COURSES                              │
│ ┌ CSC 301  ████████░░ 86%           ┐ │
│ │ Attended 12 / 14 · On track       │ │
│ ├ CSC 305  ██████░░░░ 62%  ⚠      ┤ │
│ │ Attended 8 / 13 · Below 75%       │ │
│ └───────────────────────────────────┘ │
├──────────────────────────────────────┤
│  Home    Check in    History   ☾     │
└──────────────────────────────────────┘
```

States: loading → skeleton cards; empty → "No courses yet — contact your department office"; error → inline retry banner.

### S2 — Check-in (`/student/check-in`) — tap 2 = code entry, tap 3 = Submit

```
┌──────────────────────────────────────┐
│ ← Check in                           │
│                                      │
│  ┌────────────────────────────────┐  │
│  │        4 8 1 5 2 0             │  │  numeric keypad, auto-submit at 6
│  └────────────────────────────────┘  │
│  [ ⧉ Scan QR code ]                  │
│                                      │
│  📍 Location is used once to confirm │
│     you are in the venue. Only the   │
│     distance is stored. Privacy →    │
│                                      │
│  [        Check in        ]  ← tap 3 │
│                                      │
│  ✓ Checked in — Present · 10:04      │
│  ⓘ Queued — will sync when online    │
└──────────────────────────────────────┘
```

Failure messages are specific: "This code expired — ask for the current one", "You are not enrolled in CSC 305", "You already checked in at 10:04 (Present)", "You appear to be 320 m from the venue (limit 150 m)".

### S3 — History (`/student/history`)

```
┌──────────────────────────────────────┐
│ Filter: [ All courses ▾ ]            │
│ CSC 301 · Mon 3 Nov · 10:04          │
│                         Present ✓    │
│ CSC 305 · Fri 31 Oct · 14:12         │
│                         Late ⏱        │
│ CSC 305 · Wed 29 Oct                 │
│                         Absent ✕     │
└──────────────────────────────────────┘
```

## Lecturer

### L1 — Dashboard (`/lecturer`)

```
┌──────────────────────────────────────┐
│ CampusCheck          ☾ Dr. Okafor ▾  │
│ [ + Start session ]                  │
│ TODAY                                │
│ ┌ CSC 301 · 10:00–12:00 · LT 2      ┐│
│ │ ● Open · 38 checked in · QR →     ││
│ ├ CSC 305 · 14:00–16:00 · Lab 4     ┤│
│ │ ○ Scheduled · Open at 13:45       ││
│ └───────────────────────────────────┘│
│ COURSES                              │
│ CSC 301 Data Structures    84 enrolled│
│ CSC 305 Database Systems   79 enrolled│
└──────────────────────────────────────┘
```

### L2 — Live session (`/lecturer/sessions/:id`) — QR + code on one screen

```
┌──────────────────────────────────────┐
│ ← CSC 301 · Mon 3 Nov · LT 2          │
│ ● Live                    [ End ]     │
│  ┌────────────────────────────────┐   │
│  │        ██ ▄▄ ██ ▄▄ ██          │   │
│  │        ██ ▄▄ ██ ▄▄ ██          │   │   QR ≥ 240 px
│  │        ██ ▄▄ ██ ▄▄ ██          │   │
│  └────────────────────────────────┘   │
│        4 8 1 5 2 0                    │   large, monospace, tracking
│        refreshes in 23 s  ▓▓▓▓░░░░░   │
│  Present 31 · Late 5 · Absent 48      │
│  ┌ Ada Obi        CSC/22/1043  ✓ 10:04┐
│  │ Bola Ade        CSC/22/1051 ⏱ 10:14│
│  │ Chika Eze       —           · —    │  → [ Correct ▾ ]
│  └───────────────────────────────────┘
│  [ Export CSV ] [ Export XLSX ]       │
└──────────────────────────────────────┘
```

Override dialog: current status → new status, **Reason (required)**, "This will be recorded in the audit trail and the student will be notified." Confirm/Cancel.

## Admin

### A1 — Overview (`/admin`)

```
┌────────────────────────────────────────────────────────────┐
│ CampusCheck     Overview | Users | Departments | Audit | ⚙ │
│ From [2026-10-01] To [2026-11-08] Dept [All ▾] Course [All]│
│ ┌────────┐┌────────┐┌────────┐┌────────┐                   │
│ │ 1,284  ││ 81.4%  ││  112   ││   17   │                   │
│ │ records││ rate   ││ flagged││ sessions                   │
│ └────────┘└────────┘└────────┘└────────┘                   │
│ BY COURSE        Course  Held  Present  Late  Rate         │
│ ▸ CSC 301          14      12     1    86%                 │
│ ▸ CSC 305          13       8     2    62%  ⚠              │
│ BY DEPARTMENT / BY LECTURER / TREND        [Export CSV/XLSX]│
└────────────────────────────────────────────────────────────┘
```

### States inventory

| Screen | Loading | Empty | Error |
| --- | --- | --- | --- |
| Dashboards | skeleton rows | "No sessions yet" + primary action | retry banner |
| Live session | QR placeholder + spinner | "No students enrolled" | "Could not refresh code — retrying" |
| Check-in | button spinner | n/a | specific, actionable message |
| Admin tables | skeleton | "No records for these filters" | retry |

Destructive/irreversible actions (end session, suspend user, purge records) use a confirmation dialog naming the exact consequence.
