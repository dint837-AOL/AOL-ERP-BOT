<h1 align="center">AlliedOne ERP System</h1>

<p align="center">
  <strong>Enterprise Resource Planning — Internal Operations Platform</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/Express-5-blue?logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D20.0.0-339933?logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Status-In%20Development-orange" alt="Status">
  <img src="https://img.shields.io/badge/License-Internal%20Use%20Only-red" alt="License">
</p>

---

## Overview

**AlliedOne ERP** is an enterprise-grade, internal operations platform built for **AlliedOne**. It provides a unified, role-based web interface for managing HR, attendance, finances, tender tracking, and team coordination — all backed by a headless REST API designed to serve both the web dashboard and a future mobile application.

The system is engineered on a **Hybrid Headless Architecture**: a Next.js frontend communicates exclusively with an Express/TypeScript backend via REST APIs, ensuring the same data layer can power a React Native mobile app in a future phase without any backend rewrites.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Application](#running-the-application)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features

| Module | Capabilities |
|---|---|
| **Daily Tasks Dashboard** | Real-time task tracking with traffic-light priority system (Red / Orange / Green), deadline management, auto-status calculations, and mobile-responsive layout |
| **HR & Attendance** | 1-click Check-In / Check-Out, monthly attendance reports with enhanced image export, late arrival detection, and salary calculation basis |
| **Leave Management** | Employee leave requests (Annual, Sick, Casual) with admin approval workflows and email/WhatsApp notifications |
| **In-App Notifications** | Real-time notification center with interactive navigation to requests, instant read-marking, and PostgreSQL persistence |
| **Tender Management** | Central registry for Government and Private tenders, smart countdown timers, and automated deadline alerts at 7, 3, and 1 days |
| **Meetings & Contacts** | Detailed client meeting scheduler with minute-precision alerting |
| **Accounts & Expenses** | Monthly expense tracking across custom categories (Operations, Hardware, Software) with budget limit warnings |
| **Credentials Vault** | Secure storage and management of IT assets, API keys, and credentials |
| **Cron Alert Engine** | Background 1-minute precision job runner for all time-sensitive notifications |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                         │
│              Next.js 16 (App Router) — Port 3000            │
│          SSR + React 19 — Role-based UI (Admin/Employee)    │
└────────────────────────┬────────────────────────────────────┘
                         │ REST API (JSON)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                       BACKEND LAYER                         │
│           Express 5 + TypeScript — server.ts                │
│       Exposes /api/* endpoints · Runs Cron Engine           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                       DATA LAYER                            │
│             SQLite (dev) → PostgreSQL (prod)                │
└─────────────────────────────────────────────────────────────┘
                         │
              (same API, future clients)
          ┌──────────────┴──────────────┐
          ▼                             ▼
  React Native Mobile App         WhatsApp Bot
    (Phase 9 — Planned)        (Phase 8 — Planned)
```

**Key Design Decisions:**

- **Headless API-First**: The Next.js frontend is a pure consumer of the Express REST API (`/api/*`). There is no direct database access from the frontend layer.
- **Mobile-Ready by Design**: Any future React Native or Flutter client can plug into the same endpoints with zero backend changes.
- **Role-Based Access Control**: JWT-based authentication with two roles — `ADMIN` and `EMPLOYEE` — controlling access at both the API and UI levels.
- **Background Cron Engine**: Runs independently of request cycles to handle time-critical alerts (tender deadlines, payment reminders, meeting notifications).

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | Next.js 16 (App Router) + React 19 | Web dashboard — SSR, routing, UI |
| **Backend** | Node.js + Express 5 + TypeScript | REST API server and business logic |
| **Database** | SQLite (dev) → PostgreSQL (prod) | Data persistence |
| **Auth** | JWT (`jsonwebtoken` + `bcryptjs`) | Stateless authentication |
| **Messaging** | WhatsApp Web.js + MessageBird SDK | WhatsApp notifications |
| **UI Library** | Lucide React | Icon system |
| **Language** | TypeScript 7 (strict mode) | End-to-end type safety |

---

## Getting Started

### Prerequisites

Ensure the following are installed on your system before proceeding:

- **Node.js** `>= 20.0.0` — [Download](https://nodejs.org/)
- **npm** `>= 9.0.0` (bundled with Node.js)
- **SQLite3** (for local development)
- **Git**

### Installation

**1. Clone the repository:**

```bash
git clone https://github.com/your-org/aol-erp-bot.git
cd aol-erp-bot
```

**2. Install dependencies:**

```bash
npm install
```

**3. Configure environment variables:**

Create a `.env` file in the project root. Required variables:

```env
# Database
DATABASE_URL=sqlite://./openclaw.db

# Authentication
JWT_SECRET=your-strong-jwt-secret-here

# Optional: WhatsApp / Messaging
MESSAGEBIRD_API_KEY=your-messagebird-key

# Optional: AI Integration (Phase 8)
OPENAI_API_KEY=your-openai-api-key
```

> **Note:** The SQLite database (`openclaw.db`) is automatically initialized on first run. No manual schema migration is required for local development.

### Running the Application

**Development mode** (starts both the Express server and Next.js with hot-reload):

```bash
npm run dev
```

The application will be available at:

| Service | URL |
|---|---|
| **Web Dashboard** | http://localhost:3000 |
| **Login Page** | http://localhost:3000/login |
| **REST API** | http://localhost:3000/api/* |

**Production mode:**

```bash
npm run build
npm start
```

---

## Project Structure

```
aol-erp-bot/
├── app/                    # Next.js App Router — pages and layouts
├── public/                 # Static assets
├── src/
│   ├── db.ts               # Database initialization and query helpers
│   ├── index.ts            # Application entry point
│   ├── openclaw-mock.ts    # Mock data for development/testing
│   ├── send-bird.ts        # MessageBird messaging integration
│   └── tools/              # Modular business logic (AI tool functions)
├── server.ts               # Express server — API routes and Cron Engine
├── check-db.ts             # CLI utility to inspect the database
├── ROADMAP.md              # Full phase-by-phase product roadmap
├── CREDENTIALS.md          # Internal login credentials reference (confidential)
├── package.json
└── tsconfig.json
```

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server (`tsx server.ts` + Next.js HMR) |
| `npm run build` | Build the Next.js production bundle |
| `npm start` | Run the application in production mode |
| `npx tsx check-db.ts` | Inspect the local SQLite database via CLI |

---

## Roadmap

The project follows a structured, phased delivery plan. See [ROADMAP.md](./ROADMAP.md) for the full breakdown.

| Phase | Milestone | Status |
|---|---|---|
| **0** | MVP Demo + Attendance Simulator | ✅ Complete |
| **1** | Web Dashboard + Daily Task Board | ✅ Complete |
| **2** | HR Attendance + Leave Management | ✅ Complete |
| **3** | Accounts & Expense Tracking | ✅ Complete |
| **4** | IT Payment & Password Reminders | ✅ Complete |
| **5** | Tender Management & Cron Alerts | ✅ Complete |
| **6** | Calls & Reply Tracker | 🔲 Planned |
| **7** | Product Roadmap Module | 🔲 Planned |
| **8** | AI Integration (OpenAI GPT-4o + WhatsApp Cloud API) | 🔲 Planned |
| **9** | Native Mobile Application (React Native / Expo) | 🔲 Planned |
| **10** | Production Deployment (Vercel + Railway + PostgreSQL) | 🔲 Planned |

---

## License

**Internal Company Use Only.**  
This software is proprietary to AlliedOne. Redistribution, modification, or use outside of AlliedOne's internal operations is strictly prohibited without written authorization.

---

*Last updated: August 2026 · Maintained by the AlliedOne Development Team*
