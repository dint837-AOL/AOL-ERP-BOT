# AlliedOne ERP — Complete Product Roadmap
> **Purpose:** This is the authoritative brain document. Every AI agent, developer, or stakeholder should read this file before implementing any feature. Each phase must be fully completed and verified before moving to the next.

---

## Tech Stack Decision

| Layer | Technology | Why |
|---|---|---|
| **AI Brain** | OpenAI GPT-4o (`openai` SDK) | Best-in-class function calling, TypeScript support |
| **Backend API** | Node.js + Express + TypeScript | Lightweight, fast, already in use |
| **Database** | SQLite (dev) → PostgreSQL (prod) | Zero setup locally, scales to production |
| **Web Dashboard** | Next.js 14 (App Router) | SSR + real-time, best for dashboards |
| **Mobile App** | React Native (Expo) | One codebase for iOS + Android |
| **WhatsApp** | Meta Cloud API (Official) | Required for production; use local UI for demos |
| **Notifications** | Nodemailer (Email) + WhatsApp API | Covers Requirement #1 & #2 reminders |
| **Auth** | NextAuth.js (Role-based: Admin / Employee) | Secure, simple to set up |
| **Hosting** | Vercel (Web) + Railway (API/DB) | Free tier, instant deploys |

---

## Phase 0: Foundation & MVP Demo
**Goal:** Get a working demo to show the boss TODAY. No real AI needed yet.
**Duration:** Day 1 (Already Partially Done)

### Tasks
- [x] Initialize TypeScript Node.js project
- [x] Create local Web Chat UI (`public/index.html`)
- [x] Implement SQLite `attendance` table
- [x] Simulate AI intent detection for Check-In / Check-Out
- [x] Create `ROADMAP.md` (this file)
- [ ] Initialize Git repository and push to GitHub

### Demo Script for Boss
1. Open `http://localhost:3000`
2. Type: `"Good morning! I just arrived at the office"` → Bot logs IN to DB
3. Run `npx tsx check-db.ts` → Show boss the database record
4. Explain: *"This is Phase 0. Every subsequent phase adds one more requirement from your list."*

---

## Phase 1: Web Dashboard Foundation
**Covers Requirements:** #3 (Daily Dashboard), #9 (Team Briefing)
**Duration:** Week 1-2

### 1.1 Project Initialization
- Initialize Next.js 14 app in `/dashboard` folder
- Set up Tailwind CSS + Shadcn/ui component library
- Set up NextAuth.js with two roles: `ADMIN` and `EMPLOYEE`
- Connect to SQLite database via Prisma ORM

### 1.2 Daily Task Dashboard (Requirement #3 + #9)
**Database Tables:**
```sql
tasks (
  id, title, description, deadline, 
  priority ENUM('RED','ORANGE','GREEN'),
  status ENUM('PENDING','DONE','DUE'),
  created_by, assigned_to, created_at
)
```
**Features:**
- [ ] Create / Edit / Delete tasks
- [ ] Traffic Light priority system (Red, Orange, Green)
- [ ] Mark task as Done with checkmark
- [ ] Auto-mark overdue tasks as `DUE`
- [ ] Show yesterday's pending tasks at the top
- [ ] Sort by: Most Recent, Deadline, Priority
- [ ] **Morning Briefing Mode:** Single-page view of today's tasks to present to team
- [ ] **Evening Summary:** Automatically calculates % of tasks completed vs planned

### 1.3 Deliverable
- Working Next.js dashboard accessible at `http://localhost:3001`
- Login page with Admin / Employee roles
- Fully functional Task Board

---

## Phase 2: HR Attendance & Leave Management
**Covers Requirements:** #7 (HR)
**Duration:** Week 2-3

### 2.1 Attendance Tracking (Already Partially Done)
**Database Tables:**
```sql
employees (id, name, phone_number, email, role, department, join_date)
attendance (id, employee_id, action_type ENUM('IN','OUT'), timestamp)
```
**Features:**
- [x] Employee Check-In / Check-Out via Web Chat UI
- [ ] Admin view: daily attendance table for all employees
- [ ] Monthly attendance report per employee
- [ ] Late arrival detection (configurable office start time)
- [ ] Salary calculation basis: Present days x daily rate

### 2.2 Leave Management
**Database Tables:**
```sql
leave_requests (
  id, employee_id, leave_type ENUM('SICK','CASUAL','ANNUAL'),
  start_date, end_date, reason, 
  status ENUM('PENDING','APPROVED','REJECTED'),
  reviewed_by, reviewed_at
)
```
**Features:**
- [ ] Employee submits leave request via dashboard or WhatsApp chat
- [ ] Admin gets notification (Email + WhatsApp) of pending requests
- [ ] Admin can Approve / Reject with one click from dashboard
- [ ] Employee gets WhatsApp notification of decision
- [ ] Leave balance tracker per employee

---

## Phase 3: Accounts & Expense Management
**Covers Requirements:** #6 (Accounts)
**Duration:** Week 3-4

### 3.1 Daily Expense Entry
**Database Tables:**
```sql
expense_categories (id, name, budget_limit)
expenses (
  id, category_id, amount, description,
  entered_by, receipt_url, created_at
)
```
**Features:**
- [ ] Quick expense entry form (Amount, Category, Description)
- [ ] Receipt photo upload (optional)
- [ ] Budget limit warnings per category (Red when over budget)

### 3.2 Accounts Dashboard
**Features:**
- [ ] Monthly expense summary by category (Bar Chart)
- [ ] Current month total spend vs budget
- [ ] "Highest spending categories" highlight
- [ ] Export to PDF / CSV for audit purposes
- [ ] Year-over-year comparison charts

### 3.3 AI Integration
- [ ] Connect OpenAI API key to backend
- [ ] User types: `"Log 16,000 taka expense for projector under IT"` - AI extracts amount, category, description automatically
- [ ] AI answers: `"What did we spend on marketing this month?"` by querying the database

---

## Phase 4: IT Payment & Password Reminders
**Covers Requirements:** #1 (Payment Due Date), #2 (Password Change)
**Duration:** Week 4-5

### 4.1 IT Asset Registry
**Database Tables:**
```sql
it_assets (
  id, name, type ENUM('DOMAIN','HOSTING','LICENSE','SUBSCRIPTION'),
  vendor, purchase_date, expiry_date, cost,
  next_payment_date, auto_renew, notes
)
password_reminders (
  id, asset_id, last_changed_date, 
  reminder_interval_months ENUM(1,3,6),
  next_reminder_date
)
```
**Features:**
- [ ] Register all IT assets with purchase and expiry dates
- [ ] Dashboard shows upcoming expirations (7 days, 30 days, 90 days)
- [ ] Color-coded urgency: Red < 7 days, Orange < 30 days, Green > 30 days

### 4.2 Automated Reminder Engine
- [ ] **Cron Job** runs daily at 9:00 AM
- [ ] Sends Email notification for assets expiring in 30, 7, and 1 day(s)
- [ ] Sends WhatsApp message for expiring assets (when Meta API is live)
- [ ] **Password Change Reminders:** If `last_changed_date + interval_months = today` then send reminder
- [ ] Promotional offer notes visible on asset detail page

---

## Phase 5: Tender Management
**Covers Requirements:** #4 (Tender)
**Duration:** Week 5-6

### 5.1 Tender Registry
**Database Tables:**
```sql
tenders (
  id, title, organization, tender_type ENUM('GOVT','PRIVATE'),
  published_date, submission_deadline,
  estimated_value, status ENUM('UPCOMING','IN_PROGRESS','SUBMITTED','WON','LOST'),
  documents_url, notes, assigned_to
)
```
**Features:**
- [ ] Add new tender with all details
- [ ] Countdown timer showing days until submission deadline
- [ ] Status pipeline: Upcoming → In Progress → Submitted → Won/Lost
- [ ] Dashboard sorted by submission deadline (most urgent first)
- [ ] 7-day, 3-day, and 1-day reminder notifications (Email + WhatsApp)
- [ ] Filter by: Status, Type (Govt/Private), Assigned Person

---

## Phase 6: Calls & Replies Tracker
**Covers Requirements:** #5 (Call/Reply)
**Duration:** Week 6-7

### 6.1 Call & Query Manager
**Database Tables:**
```sql
contacts (id, name, organization, phone, email)
scheduled_calls (
  id, contact_id, scheduled_at, purpose,
  status ENUM('PENDING','DONE','MISSED'), notes
)
inbound_queries (
  id, source ENUM('WEBSITE','FACEBOOK','LINKEDIN','WHATSAPP'),
  sender_name, query_text, received_at,
  status ENUM('UNREAD','IN_PROGRESS','REPLIED'),
  replied_by, replied_at
)
```
**Features:**
- [ ] Schedule calls with time and purpose
- [ ] Morning reminder for today's scheduled calls
- [ ] Log inbound queries from all channels manually (later: auto-import via APIs)
- [ ] Mark queries as Replied with response notes
- [ ] SLA tracking: Flag queries unanswered for > 2 hours as urgent

---

## Phase 7: Product Roadmap Module
**Covers Requirements:** #8 (Roadmap)
**Duration:** Week 7-8

### 7.1 Product/Service Roadmap
**Database Tables:**
```sql
roadmap_items (
  id, title, type ENUM('PRODUCT','SERVICE'),
  description, launch_deadline,
  status ENUM('IDEATION','IN_PROGRESS','LAUNCHED','ON_HOLD'),
  budget_planned, budget_spent, expected_return,
  created_by, created_at
)
action_points (id, roadmap_item_id, title, assignee, due_date, done)
challenges (id, roadmap_item_id, description, severity ENUM('LOW','MEDIUM','HIGH'), resolved)
```
**Features:**
- [ ] Visual timeline / Gantt-style view of all roadmap items
- [ ] Add action points (sub-tasks) per product
- [ ] Log known challenges with severity tags
- [ ] Budget tracker: Planned vs Actual spend
- [ ] ROI calculator: Expected Return / Budget
- [ ] Kanban board: Ideation → In Progress → Launched

---

## Phase 8: Real AI Integration (OpenAI GPT-4o)
**Duration:** Week 8-9

This is where the system gets truly intelligent. All previous phases collected structured data. Now the AI can read that data and let users interact with everything via natural language.

### 8.1 Connect OpenAI API
- [ ] Add `OPENAI_API_KEY` to `.env`
- [ ] Install `openai` package
- [ ] Build central AI Router in `src/ai/router.ts`

### 8.2 AI Tools (Function Calling) — Full List

| Tool Name | What it does | Phase |
|---|---|---|
| `log_attendance` | Log IN/OUT for an employee | Phase 2 |
| `log_expense` | Add an expense entry | Phase 3 |
| `get_expenses_summary` | Query expenses by category/month | Phase 3 |
| `create_task` | Add a task to the daily board | Phase 1 |
| `submit_leave_request` | Employee submits leave | Phase 2 |
| `get_upcoming_tenders` | List tenders sorted by deadline | Phase 5 |
| `schedule_call` | Add a call to the tracker | Phase 6 |
| `get_it_asset_status` | Check expiry dates of IT assets | Phase 4 |

### 8.3 WhatsApp Integration (Meta Cloud API)
- [ ] Apply for Meta Business API (requires registered business)
- [ ] Connect official WhatsApp webhook to AI Router
- [ ] Employees can now use WhatsApp to do everything: log attendance, submit leave, ask questions

---

## Phase 9: Mobile App (React Native / Expo)
**Duration:** Week 10-12

### 9.1 Initialize Expo App
- [ ] `npx create-expo-app alliedone-mobile`
- [ ] Share API with the web dashboard (same backend)
- [ ] Bottom navigation: Dashboard | HR | Accounts | Tenders | Roadmap

### 9.2 Mobile-Specific Features
- [ ] **Push Notifications** via Expo Notifications (replaces Email for urgent alerts)
- [ ] **Biometric Check-In:** Employee taps "Check In" button → GPS-stamped → logged
- [ ] **Quick Expense:** Snap a photo of a receipt → AI reads the amount and logs it
- [ ] **Offline Mode:** Basic task viewing works without internet

---

## Phase 10: Production Deployment
**Duration:** Week 12-13

- [ ] Migrate SQLite → PostgreSQL on Railway
- [ ] Deploy Next.js dashboard to Vercel
- [ ] Deploy Node.js backend to Railway
- [ ] Deploy Expo mobile app to Google Play Store & Apple App Store
- [ ] Set up domain and SSL
- [ ] Set up automated database backups
- [ ] Security audit: Input validation, rate limiting, auth hardening

---

## Summary Table

| Phase | Feature | Requirement | Est. Duration |
|---|---|---|---|
| **0** | MVP Demo + Attendance Simulator | #7 partial | Day 1 DONE |
| **1** | Web Dashboard + Daily Task Board | #3, #9 | Week 1-2 |
| **2** | HR Attendance + Leave Management | #7 | Week 2-3 |
| **3** | Accounts & Expense Tracking | #6 | Week 3-4 |
| **4** | IT Payment & Password Reminders | #1, #2 | Week 4-5 |
| **5** | Tender Management | #4 | Week 5-6 |
| **6** | Calls & Reply Tracker | #5 | Week 6-7 |
| **7** | Product Roadmap Module | #8 | Week 7-8 |
| **8** | Real AI (OpenAI GPT-4o) + WhatsApp | All | Week 8-9 |
| **9** | Mobile App (React Native) | All | Week 10-12 |
| **10** | Production Deployment | All | Week 12-13 |

---

## Current Status
- **Phase 0:** In Progress (MVP Demo Ready)
- **Phase 1:** Next to implement
- **All others:** Planned

---
*Last Updated: 2026-08-16 | Maintained by: AI Agent + Development Team*
