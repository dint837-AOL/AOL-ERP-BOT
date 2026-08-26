# AlliedOne ERP — Feature Specification

> **Purpose:** This is the living specification document for the AlliedOne ERP System.
> It documents every feature, screen, API endpoint, and data model that has been **implemented and is currently working** in production.
> Every developer or AI agent working on this codebase must read this file before making changes.
> **Update this file every time a new feature is added, modified, or removed.**

---

> **Last Updated:** August 2026
> **Document Version:** 1.0
> **Codebase Version:** 1.0.0

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Authentication & Authorization](#2-authentication--authorization)
3. [Navigation & Layout](#3-navigation--layout)
4. [Module: Daily Tasks Dashboard](#4-module-daily-tasks-dashboard)
5. [Module: HR & Attendance](#5-module-hr--attendance)
6. [Module: Accounts & Expenses](#6-module-accounts--expenses)
7. [Module: Tender Management](#7-module-tender-management)
8. [Module: Meetings & Contacts](#8-module-meetings--contacts)
9. [Module: Credentials Vault](#9-module-credentials-vault)
10. [Module: Admin Section](#10-module-admin-section)
11. [System: Notification Engine](#11-system-notification-engine)
12. [System: Background Services](#12-system-background-services)
13. [REST API Reference](#13-rest-api-reference)
14. [Database Schema](#14-database-schema)
15. [Changelog](#15-changelog)

---

## 1. System Overview

### 1.1 Architecture

AlliedOne ERP is a **Hybrid Headless Application**:

- **Frontend:** Next.js 16 (App Router) — serves all UI pages via SSR
- **Backend:** Express 5 + TypeScript — runs as `server.ts`, registers all REST API routes
- **Database:** SQLite (local dev) / PostgreSQL via Neon (cloud/production) — auto-detected at startup
- **Process:** A single `npx tsx server.ts` process boots both layers concurrently on **port 3000**

```
Browser -> Port 3000
         |-- /api/*       -> Express (REST API)
         +-- /*           -> Next.js (SSR pages)
```

### 1.2 Supported Environments

| Environment | Database | How to trigger |
|---|---|---|
| **Local Development** | SQLite (`openclaw.db`) | `DATABASE_URL` not set or set to SQLite path |
| **Cloud / Production** | PostgreSQL (Neon DB) | `DATABASE_URL` or `POSTGRES_URL` set to `postgres://...` |

### 1.3 User Roles

| Role | Description |
|---|---|
| **Admin** | Full access to all modules, member management, attendance approval, leave review, Wi-Fi settings |
| **Employee** | Limited access — own check-in/out, own leave requests, own attendance history |

---

## 2. Authentication & Authorization

**File:** `app/login/page.tsx`, `src/openclaw-mock.ts`, `app/context/AuthContext.tsx`

### 2.1 Login Flow

- URL: `/login`
- Method: Email + Password authentication
- Backend endpoint: `POST /api/auth/login`
- On success: receives a **JWT token** (7-day expiry) + user object `{ id, name, email, role }`
- Token is stored in **HTTP cookies** (`token`, `user`) for 7 days
- Failed login returns `401 Invalid credentials`

### 2.2 Session Persistence

- `AuthContext` reads the `token` and `user` cookies on every page load
- Session is maintained across page refreshes without re-login
- Logout clears both cookies and redirects to `/login`

### 2.3 Route Protection

- `AuthGuard` component wraps all protected pages (`app/components/AuthGuard.tsx`)
- Unauthenticated users are redirected to `/login`
- Role-restricted UI elements (e.g., Admin Section link) are hidden from non-admin users

### 2.4 API Authorization

- All `/api/*` endpoints require a valid JWT passed as:
  - `Authorization: Bearer <token>` header, OR
  - `token` cookie, OR
  - `token` query parameter / request body (fallback)
- **Public endpoints** (no auth required):
  - `POST /api/auth/login`
  - `GET/POST /api/attendance/wifi-webhook`
  - `GET /api/attendance/wifi-status`
  - `POST /api/attendance/client-ping`
  - `GET /api/attendance/download-script`
  - `GET /api/attendance/active-devices`
  - `GET/POST /api/settings/wifi`
- **Admin-only endpoints:** Member create, update, delete (`POST/PUT/DELETE /api/members/:id`)

### 2.5 Password Management

- Passwords are hashed with **bcryptjs** (10 salt rounds) before storage
- New members are assigned a default password `password123` if none is specified at creation
- Passwords should be changed after first login in production

---

## 3. Navigation & Layout

**File:** `app/components/Sidebar.tsx`, `app/components/Topbar.tsx`, `app/layout.tsx`

### 3.1 Sidebar

A persistent left sidebar displays:

- **Logo:** AlliedOne ERP System (with Zap icon)
- **User Profile Widget:** Avatar (first letter of name), full name, role — shown when logged in
- **Navigation Links (Workspace group):**
  - Daily Tasks -> `/dashboard`
  - HR & Attendance -> `/hr`
  - Accounts -> `/accounts`
  - Credentials -> `/credentials`
  - Meetings -> `/meetings`
  - Tenders -> `/tenders`
  - Admin Section -> `/admin` *(Admin role only)*
  - Roadmap -> *(placeholder, "Soon" badge — not yet built)*
- **Navigation Links (Bot group):**
  - ERP Chat -> `/chat.html` *(legacy WhatsApp chat UI)*
- **Logout Button:** Clears session and redirects to `/login`
- Active route is highlighted with the `.on` CSS class

### 3.2 Topbar

A sticky top header rendered on every module page:

- **Left:** Hamburger menu (mobile), Page title (auto-derived from route or passed as prop)
- **Right:** Notification Bell icon with unread badge count
- **Notification Dropdown:** Polls `/api/notifications?member_id=<id>` every 10 seconds; displays unread messages; clicking marks them as read
- Children passed into `<Topbar>` are rendered between the title and the bell (e.g., the date navigator on the Dashboard)

### 3.3 Responsive Behavior

- **Desktop (>=768px):** Sidebar is always visible; Topbar shows full controls
- **Mobile (<768px):** Sidebar toggles via hamburger; compact date bar appears below Topbar; floating FAB button for adding tasks

---

## 4. Module: Daily Tasks Dashboard

**File:** `app/dashboard/page.tsx`
**API:** `/api/tasks`, `/api/members`
**Route:** `/dashboard`

### 4.1 Purpose

A daily operational task tracker. Each day has its own isolated task list. Admins log activities and assign them to team members. The dashboard supports date navigation to review any past or future date.

### 4.2 Task Data Model

| Field | Type | Values |
|---|---|---|
| `title` | string | Free-text activity name |
| `action_type` | enum | `ASSIGN`, `SMS`, `CALL`, `MAIL`, `MEETING`, `REMINDER` |
| `recipient` | string | Contact name, email, or phone |
| `assigned_to` | integer (FK) | Member ID |
| `status` | enum | `DONE`, `WIP`, `PENDING`, `DUE` |
| `deadline` | datetime | Optional ISO datetime string |
| `task_date` | date | The date this task belongs to (YYYY-MM-DD) |
| `is_archived` | 0 / 1 | Soft-delete flag |
| `priority` | enum | `RED`, `ORANGE`, `GREEN` (stored, not yet surfaced in UI) |

### 4.3 Views / Tabs

The Dashboard has three tabs:

#### Tab 1 — Admin View
- Full table with all columns: Action, Activity Name, Recipient, Assignee, Status, Deadline, Delete
- **Desktop:** Traditional table layout; every cell is click-to-edit inline
- **Mobile:** Rich card layout per task; tap any field to edit it
- **Inline Editing:** Clicking any cell opens the appropriate input (text, select, or datetime picker) in-place; saves on blur or Enter
- **Deadline Picker:** Auto-opens the native date/time picker on focus via `showPicker()` API

#### Tab 2 — Team View
- Filterable list of all tasks for the current date
- **Filters:** Assignee (dropdown), Action Type (dropdown), Status (dropdown), Deadline (date input)
- Displays full row data same as Admin View but filtered

#### Tab 3 — Board View
- Kanban-style breakdown grouped by team member
- Shows each member's task count, split by: Done / WIP / Pending
- Only shows members who have at least one task for the selected date
- Includes an "Unassigned" row

### 4.4 Date Navigation

- **Previous / Next Day:** Arrow buttons step one day at a time
- **Date Picker:** Clicking the current date label opens a native `<input type="date">` to jump to any date
- **"Today" Highlight:** The date label turns blue when viewing the current date
- **Desktop:** Date navigator lives in the Topbar right section
- **Mobile:** Date navigator renders as a compact sub-bar directly below the Topbar

### 4.5 Summary Bar

Displayed above the tabs:
- **Done count:** Total tasks with status `DONE`
- **WIP count:** Tasks with status `WIP` or `DUE`
- **Pending count:** Tasks with status `PENDING`

### 4.6 Adding Tasks

**Desktop (Inline Row):**
- A blank editable row at the bottom of the Admin View table
- Select Action Type, enter Activity Name, Recipient, Assignee, Status, Deadline
- Click the "Add" button or press Enter in the Title field to save

**Mobile (Floating Action Button):**
- A pulsing blue `+` FAB in the bottom-right corner
- Tapping opens a bottom sheet modal with the same fields
- Submit via the "Add Task" button inside the sheet

### 4.7 Deleting Tasks

- Trash icon on each row/card triggers a **confirmation modal** with two options:
  - **Archive** — soft-deletes (sets `is_archived = 1`), task disappears from active list but is recoverable
  - **Permanently Delete** — hard delete from database, irreversible

### 4.8 Archived Tasks

- "Archived Tasks" button (Archive icon) in the Topbar opens an Archived Tasks modal
- Lists all archived tasks for the current date
- Each archived task has a **Restore** button that moves it back to active (`is_archived = 0`)

### 4.9 Toast Notifications

Short-lived toast message (2.5s timeout) appears after: task added, archived, restored, deleted, or validation failure.

---

## 5. Module: HR & Attendance

**File:** `app/hr/page.tsx`
**API:** `/api/attendance`, `/api/leave-requests`, `/api/members`
**Route:** `/hr`

### 5.1 Purpose

Manages employee attendance (check-in / check-out) and leave requests. The view is role-gated: employees see only their own data; admins see everything.

### 5.2 Employee View

#### Check-In / Check-Out Widget
- Displays the employee's name (auto-filled from session)
- Shows **current Dhaka time** in real-time (refreshes every second)
- **Check In button:** Records attendance with action `IN` and current UTC timestamp
- **Check Out button:** Records attendance with action `OUT`
- Shows the employee's **last check-in time** for the current date
- Displays whether the employee is on **office Wi-Fi** (green badge) or remote (grey badge)

#### Wi-Fi Auto-Attendance Indicator
- Reads the Wi-Fi match status from the server
- Shows "On Office Wi-Fi" (green) or "Remote / External Network" (grey)
- Auto-attendance works when the employee's IP matches the configured office IP whitelist (see Admin Section)

#### Laptop Agent Download
- Button to download a **1-click attendance installer script** for Windows
- The script runs a background heartbeat agent that pings the server every N minutes
- Used for zero-browser automated check-in based on laptop presence on the network

#### Own Leave History
- Tabular list of the employee's own leave requests
- Columns: Type, Start Date, End Date, Reason, Status (PENDING / APPROVED / REJECTED)
- Status displayed as a colored badge

#### Submit Leave Request
- "Request Leave" button opens a modal with:
  - Leave Type: Annual / Sick / Casual
  - Start Date, End Date
  - Reason (textarea)
- Submitted leaves start with `PENDING` status

### 5.3 Admin View

#### Full Attendance Log
- Date-navigable attendance log (Previous / Next day, with "Today" label)
- Shows all employees' check-in and check-out times for the selected date
- Each row: Employee name + avatar, Check-In time, Check-Out time
- Times displayed in **Asia/Dhaka timezone**

#### Monthly Attendance Calendar
- Visual calendar heatmap for a selected employee and month
- **Traffic-light color coding:**
  - Green = Present (has a check-in record)
  - Red = Absent (no record)
  - Yellow = On Approved Leave
  - Grey = Weekend (Friday & Saturday)
- Month navigation: backward / forward arrows
- Hovering/tapping a day shows: check-in time, check-out time, or leave type

#### Export Attendance as Image
- Screenshot button captures the monthly calendar as a PNG image
- Uses `html2canvas` to render the calendar DOM to canvas and triggers browser download

#### Leave Request Management
- Shows all pending leave requests across all employees
- Admin can Approve or Reject each request with a single button click
- Approved/Rejected leaves update the employee's monthly calendar color accordingly

### 5.4 Timezone Handling

- All timestamps stored in UTC in the database
- All display formatting converts to `Asia/Dhaka` (UTC+6) timezone
- `parseTimestamp()` helper ensures consistent UTC parsing for both `Z`-suffixed and bare ISO strings

---

## 6. Module: Accounts & Expenses

**File:** `app/accounts/page.tsx`
**API:** `/api/expenses`, `/api/expense-categories`, `/api/members`
**Route:** `/accounts`

### 6.1 Purpose

Tracks monthly operational expenses against predefined budget categories. Provides a monthly summary view of spending per category.

### 6.2 Expense Categories

- Categories are pre-seeded in the database (e.g., Operations, Hardware, Software)
- Each category has a name, color, and optional budget limit
- Managed via `/api/expense-categories`

### 6.3 Quick Add (Inline Form)

A compact form at the top of the page for rapid expense entry:

| Field | Notes |
|---|---|
| Amount (BDT) | Numeric, required |
| Category | Dropdown from DB categories, required |
| Description | Optional free text |
| Date | Defaults to today, editable |

### 6.4 Detailed Add (Modal)

Full modal form with an additional "Entered By" member dropdown.

### 6.5 Expense List

- Table of all expenses for the selected month
- Month navigation: backward / forward with `YYYY-MM` selector
- Columns: Date, Category (color-coded badge), Description, Amount (BDT), Entered By
- Delete button per row
- Auto-refreshes every **60 seconds** via `setInterval`

### 6.6 Monthly Summary

- Per-category spending breakdown displayed as a card grid
- Each card: Category name (color-coded), Total spent this month
- Grand total for the month shown prominently

### 6.7 Number Formatting

- All amounts formatted with `toLocaleString('en-BD')` (Bangladeshi comma style)
- Amounts stored as `NUMERIC` in the database for precision

---

## 7. Module: Tender Management

**File:** `app/tenders/page.tsx`
**API:** `/api/tenders`
**Route:** `/tenders`

### 7.1 Purpose

A central registry for tracking Government and Private business tenders. Helps the team monitor submission deadlines and pipeline status.

### 7.2 Tender Data Model

| Field | Type | Values |
|---|---|---|
| `title` | string | Tender name |
| `organization` | string | Issuing organization |
| `tender_type` | enum | `GOVT`, `PRIVATE` |
| `published_date` | date | When published |
| `submission_deadline` | date | Hard deadline |
| `estimated_value` | numeric | BDT contract value |
| `status` | enum | `UPCOMING`, `IN_PROGRESS`, `SUBMITTED`, `WON`, `LOST` |
| `documents_url` | string | Link to tender documents |

### 7.3 Tender List

- Displays all tenders as a card grid
- Each card: Title, Organization, Type badge, Status badge, Estimated Value, Submission Deadline
- **Live Countdown Timer:** Days / Hours / Minutes remaining until deadline
  - Red = < 3 days remaining
  - Orange/yellow = < 7 days remaining
  - Green = >= 7 days remaining
  - "Deadline Passed" when expired
- Countdown auto-refreshes every minute

### 7.4 Filters

Client-side filters applied to fetched data:
- **Status filter:** ALL / UPCOMING / IN_PROGRESS / SUBMITTED / WON / LOST
- **Type filter:** ALL / GOVT / PRIVATE

### 7.5 Adding a Tender

Modal form with: Title (required), Organization, Type (GOVT/PRIVATE), Published Date, Submission Deadline (required), Estimated Value (BDT), Documents URL.
New tenders default to `status = 'UPCOMING'`.

### 7.6 Status Pipeline

Status dropdown on each card advances the tender through:
```
UPCOMING -> IN_PROGRESS -> SUBMITTED -> WON
                                     -> LOST
```
Calls `PATCH /api/tenders/:id` with `{ status: newStatus }`.

### 7.7 Automated Alerts

Cron Engine fires deadline notifications at **7 days, 3 days, and 1 day** before `submission_deadline`.

---

## 8. Module: Meetings & Contacts

**File:** `app/meetings/page.tsx`
**API:** `/api/meetings`
**Route:** `/meetings`

### 8.1 Purpose

Schedule and track upcoming client meetings with configurable multi-point reminder alerts.

### 8.2 Meeting Data Model

| Field | Type | Notes |
|---|---|---|
| `title` | string | Meeting title / purpose |
| `contact_name` | string | Client or contact person |
| `scheduled_at` | datetime (UTC) | Meeting start time |
| `reminder_minutes_before` | string | Comma-separated e.g. `"30, 15"` |

### 8.3 Meeting List

- Chronological list of all scheduled meetings
- Each card: Title, Contact Name, Scheduled time (Dhaka timezone), Reminder settings, Countdown to meeting
- Delete button with `confirm()` prompt

### 8.4 Adding a Meeting

Modal with: Title (required), Contact Name, Date & Time (required, `datetime-local`), Reminder minutes (defaults to `"30, 15"`).

### 8.5 Reminder Alerts

Cron Engine reads `reminder_minutes_before` and fires notifications for each meeting at each configured interval before the meeting starts.

---

## 9. Module: Credentials Vault

**File:** `app/credentials/page.tsx`
**API:** `/api/credentials`
**Route:** `/credentials`

### 9.1 Purpose

Securely stores IT assets, API keys, domain credentials, hosting logins. Supports expiry date tracking with automated reminder alerts.

### 9.2 Credential Data Model

| Field | Type | Notes |
|---|---|---|
| `name` | string | Service or asset name |
| `cred_type` | enum | `DOMAIN`, `HOSTING`, `API_KEY`, `EMAIL`, `SOCIAL`, `OTHER` |
| `url` | string | Login URL or service endpoint |
| `username` | string | Username or login email |
| `expiry_date` | date | When the credential/subscription expires |
| `last_changed_date` | date | When the password was last changed |
| `reminder_days_before` | string | Comma-separated e.g. `"5, 2, 1"` |

### 9.3 Credential List

- Grid of credential cards showing: Name, Type badge (with contextual icon), URL (clickable link), Expiry date, Days remaining
- Urgency color: Red (expired or < 5 days), Orange (< 15 days), Green (safe)
- Delete button per card with `confirm()` prompt

### 9.4 Adding a Credential

Modal with all fields. `reminder_days_before` defaults to `"5, 2, 1"`.

### 9.5 Automated Alerts

Cron Engine sends notifications at each `reminder_days_before` day count when `expiry_date` is approaching.

---

## 10. Module: Admin Section

**File:** `app/admin/page.tsx`
**API:** `/api/members`, `/api/settings/wifi`, `/api/attendance/active-devices`
**Route:** `/admin`
**Access:** Admin role only

### 10.1 Team Member Management

| Action | Details |
|---|---|
| **View** | Table: Avatar, Name, Email, Role, Date Added |
| **Add** | Modal: Name, Role, Email. Default password `Employee@123`. Random avatar color assigned. |
| **Edit** | Pre-filled modal. Can update Name, Role, Email, optionally reset Password. |
| **Delete** | Removes member; tasks they were assigned to become unassigned (set to NULL). |

### 10.2 Office Wi-Fi & Automated Attendance Settings

| Setting | Description |
|---|---|
| **Office Wi-Fi IP Whitelist** | Comma-separated public IPs of the office router (e.g., `103.145.120.45, 127.0.0.1`) |
| **Wi-Fi Network Display Name** | Label shown to employees on the HR page |
| **Auto Check-Out Timeout** | Minutes before system auto-logs a check-out (default: 10 mins) |
| **Enable Auto Wi-Fi Attendance** | Toggle: auto check-in when IP matches whitelist; auto check-out when IP leaves |

**"Add Current IP to Office Whitelist" button:**
- Detects admin's current public IP via `ipify.org` / `icanhazip.com` APIs
- Appends it to the whitelist field (does not save until "Save Settings" is clicked)
- Shows "Matches Office Wi-Fi" badge if current IP is already whitelisted

### 10.3 Active Laptop Devices Table

Real-time table of employees with active laptop attendance agents:

| Column | Notes |
|---|---|
| Employee | Avatar, Name, Email |
| Device / Hostname | Machine hostname |
| OS / Type | Operating system name |
| IP Address | Device IP |
| Last Heartbeat | Most recent ping (Dhaka time) |
| Status | Online badge |

- Auto-refreshes every **20 seconds**

---

## 11. System: Notification Engine

**Frontend:** `app/components/Topbar.tsx`
**Backend API:** `GET /api/notifications`, `POST /api/notifications/mark-read`

### 11.1 In-App Notifications

- Stored per-member in the `notifications` table
- Each notification: `message`, `link` (optional), `is_read`, `created_at`
- Bell icon in Topbar shows unread count badge
- Bell dropdown lists unread notifications; clicking marks as read and optionally navigates to `link`
- **Polling:** Every **10 seconds** via `setInterval`

### 11.2 System-Generated Notifications

Created automatically by the Cron Engine (see §12) for:
- Tender deadline alerts (7d, 3d, 1d before)
- Meeting reminders (N minutes before)
- Credential expiry alerts (N days before)

---

## 12. System: Background Services

**File:** `src/openclaw-mock.ts`

### 12.1 Cron Engine

Runs every **60 seconds** checking for time-sensitive events:

| Event Type | Trigger | Notifies |
|---|---|---|
| **Tender Deadline** | `submission_deadline` is exactly 7, 3, or 1 day(s) away | All members |
| **Meeting Reminder** | `scheduled_at - reminder_minutes_before` matches now | All members |
| **Credential Expiry** | `expiry_date - reminder_days_before` matches today | All members |

Notifications avoid duplicates by checking if the same event was already notified within the past 24 hours.

### 12.2 Wi-Fi Auto-Attendance

**Client Heartbeat Endpoint:** `POST /api/attendance/client-ping`
- Called by the laptop agent every N minutes
- Payload: `{ member_id, token, hostname, os_name, device_type }`
- Records device in `active_sessions`
- If IP matches office whitelist: auto check-in is logged
- If session goes silent past `auto_checkout_timeout_minutes`: auto check-out is logged

**Laptop Agent Installer:** `GET /api/attendance/download-script`
- Returns a platform-specific installer script (batch/shell) for employees to set up the background agent

### 12.3 Active Session Tracking

`active_sessions` table stores per-member device presence with last heartbeat timestamp, IP, hostname, OS name, and device type.

---

## 13. REST API Reference

All endpoints prefixed with `/api`. Unless marked **[Public]**, all require a valid JWT (see §2.4).

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` [Public] | Login; returns `{ token, user }` |

### Members
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/members` | Any | List all members |
| `POST` | `/api/members` | Admin | Create a new member |
| `PUT` | `/api/members/:id` | Admin | Update member |
| `DELETE` | `/api/members/:id` | Admin | Delete member (unassigns tasks) |

### Tasks
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tasks?date=YYYY-MM-DD[&archived=true]` | Get tasks for a date |
| `POST` | `/api/tasks` | Create a new task |
| `PATCH` | `/api/tasks/:id` | Update task fields |
| `DELETE` | `/api/tasks/:id` | Hard-delete a task |

### Attendance
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/attendance?date=YYYY-MM-DD` | Any | Get attendance log for a date |
| `POST` | `/api/attendance` | Any | Log check-in or check-out |
| `GET` | `/api/attendance/monthly?member_id=N&year=N&month=N` | Any | Monthly attendance for calendar |
| `POST` | `/api/attendance/client-ping` | Public | Laptop agent heartbeat |
| `GET` | `/api/attendance/active-devices` | Public | Active laptop agents |
| `GET` | `/api/attendance/download-script` | Public | Laptop agent installer download |
| `GET` | `/api/attendance/wifi-status` | Public | Check if current IP matches office whitelist |

### Leave Requests
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/leave-requests?member_id=N` | Employee's own leave requests |
| `GET` | `/api/leave-requests/all` | All leave requests (Admin) |
| `POST` | `/api/leave-requests` | Submit a leave request |
| `PATCH` | `/api/leave-requests/:id` | Approve or reject (Admin) |

### Expenses & Categories
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/expense-categories` | Get all categories |
| `GET` | `/api/expenses?month=YYYY-MM` | Get expenses for a month |
| `GET` | `/api/expenses/summary?month=YYYY-MM` | Per-category monthly summary |
| `POST` | `/api/expenses` | Log a new expense |
| `DELETE` | `/api/expenses/:id` | Delete an expense |

### Tenders
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tenders` | Get all tenders |
| `POST` | `/api/tenders` | Create a new tender |
| `PATCH` | `/api/tenders/:id` | Update tender status or fields |
| `DELETE` | `/api/tenders/:id` | Delete a tender |

### Meetings
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/meetings` | Get all meetings |
| `POST` | `/api/meetings` | Create a new meeting |
| `DELETE` | `/api/meetings/:id` | Delete a meeting |

### Credentials
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/credentials` | Get all credentials |
| `POST` | `/api/credentials` | Add a new credential |
| `DELETE` | `/api/credentials/:id` | Delete a credential |

### Notifications
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/notifications?member_id=N` | Get unread notifications for a member |
| `POST` | `/api/notifications/mark-read` | Mark one or all notifications as read |

### Settings
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/settings/wifi` | Public | Get Wi-Fi attendance settings |
| `POST` | `/api/settings/wifi` | Public | Save Wi-Fi attendance settings |

---

## 14. Database Schema

Both SQLite and PostgreSQL use the same logical schema. PostgreSQL uses `SERIAL PRIMARY KEY` and `TIMESTAMPTZ`; SQLite uses `INTEGER PRIMARY KEY AUTOINCREMENT` and `TEXT` for timestamps.

### `members`
```sql
id            INTEGER PRIMARY KEY AUTOINCREMENT
name          TEXT NOT NULL
email         TEXT DEFAULT ''
password_hash TEXT DEFAULT ''
role          TEXT DEFAULT 'Employee'     -- 'Admin' | 'Employee'
avatar_color  TEXT DEFAULT '#4f7eff'
created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### `attendance`
```sql
id           INTEGER PRIMARY KEY AUTOINCREMENT
member_id    INTEGER REFERENCES members(id) ON DELETE SET NULL
phone_number TEXT
action_type  TEXT NOT NULL               -- 'IN' | 'OUT'
timestamp    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### `tasks`
```sql
id           INTEGER PRIMARY KEY AUTOINCREMENT
title        TEXT NOT NULL
description  TEXT DEFAULT ''
action_type  TEXT DEFAULT 'ASSIGN'       -- 'ASSIGN'|'SMS'|'CALL'|'MAIL'|'MEETING'|'REMINDER'
recipient    TEXT DEFAULT ''
deadline     TEXT                        -- ISO datetime string
task_date    TEXT NOT NULL               -- YYYY-MM-DD
priority     TEXT DEFAULT 'GREEN'        -- 'RED'|'ORANGE'|'GREEN'
status       TEXT DEFAULT 'DONE'         -- 'DONE'|'WIP'|'PENDING'|'DUE'
assigned_to  INTEGER REFERENCES members(id) ON DELETE SET NULL
is_archived  INTEGER DEFAULT 0           -- 0=active, 1=archived
created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### `leave_requests`
```sql
id           INTEGER PRIMARY KEY AUTOINCREMENT
member_id    INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE
leave_type   TEXT NOT NULL               -- 'SICK'|'CASUAL'|'ANNUAL'
start_date   TEXT NOT NULL
end_date     TEXT NOT NULL
reason       TEXT DEFAULT ''
status       TEXT DEFAULT 'PENDING'      -- 'PENDING'|'APPROVED'|'REJECTED'
reviewed_at  TIMESTAMP
created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### `expense_categories`
```sql
id           INTEGER PRIMARY KEY AUTOINCREMENT
name         TEXT NOT NULL UNIQUE
budget_limit NUMERIC DEFAULT 0
color        TEXT DEFAULT '#4f7eff'
```

### `expenses`
```sql
id           INTEGER PRIMARY KEY AUTOINCREMENT
category_id  INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL
amount       NUMERIC NOT NULL
description  TEXT DEFAULT ''
entered_by   INTEGER REFERENCES members(id) ON DELETE SET NULL
expense_date TEXT NOT NULL
created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### `credentials`
```sql
id                   INTEGER PRIMARY KEY AUTOINCREMENT
name                 TEXT NOT NULL
cred_type            TEXT DEFAULT 'OTHER'   -- 'DOMAIN'|'HOSTING'|'API_KEY'|'EMAIL'|'SOCIAL'|'OTHER'
url                  TEXT DEFAULT ''
username             TEXT DEFAULT ''
cost                 NUMERIC DEFAULT 0
expiry_date          TEXT
last_changed_date    TEXT
reminder_days_before TEXT DEFAULT '5,2,1'
created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### `meetings`
```sql
id                      INTEGER PRIMARY KEY AUTOINCREMENT
title                   TEXT NOT NULL
contact_name            TEXT DEFAULT ''
scheduled_at            TIMESTAMP NOT NULL
reminder_minutes_before TEXT DEFAULT '30,15'
created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### `tenders`
```sql
id                  INTEGER PRIMARY KEY AUTOINCREMENT
title               TEXT NOT NULL
organization        TEXT DEFAULT ''
tender_type         TEXT DEFAULT 'PRIVATE'   -- 'GOVT'|'PRIVATE'
published_date      TEXT
submission_deadline TEXT NOT NULL
estimated_value     NUMERIC DEFAULT 0
status              TEXT DEFAULT 'UPCOMING'  -- 'UPCOMING'|'IN_PROGRESS'|'SUBMITTED'|'WON'|'LOST'
documents_url       TEXT DEFAULT ''
notes               TEXT DEFAULT ''
assigned_to         INTEGER REFERENCES members(id) ON DELETE SET NULL
created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### `settings`
```sql
key   TEXT PRIMARY KEY
value TEXT
```
*Current keys: `office_wifi_ip`, `office_wifi_name`, `wifi_auto_attendance_enabled`, `auto_checkout_timeout_minutes`*

### `active_sessions`
```sql
member_id   INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE
last_seen   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
ip          TEXT
is_wifi     INTEGER DEFAULT 1
hostname    TEXT DEFAULT ''
os_name     TEXT DEFAULT ''
device_type TEXT DEFAULT 'BROWSER'
```

### `notifications`
```sql
id         INTEGER PRIMARY KEY AUTOINCREMENT
member_id  INTEGER REFERENCES members(id) ON DELETE CASCADE
message    TEXT NOT NULL
link       TEXT DEFAULT ''
is_read    BOOLEAN DEFAULT false
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

---

## 15. Changelog

> **Instructions for developers and AI agents:** Every time you add, modify, or remove a feature, append a row to this table with the date, version bump (if applicable), and a concise description of the change. This keeps the spec accurate without requiring a full rewrite.

| Date | Change |
|---|---|
| Aug 2026 | Initial spec written — covers all live modules: Auth, Dashboard (v5 mobile-responsive), HR & Attendance (Wi-Fi auto-attendance + laptop agent + monthly calendar export), Accounts, Tenders (countdown + cron alerts), Meetings, Credentials Vault, Admin Section (member CRUD + Wi-Fi settings + active device monitor), In-App Notification Engine |

---

*Maintained by the AlliedOne Development Team · Update this document on every feature change.*
