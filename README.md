# AlliedOne ERP System

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black" alt="Next.js">
  <img src="https://img.shields.io/badge/Express-Backend-blue" alt="Express">
  <img src="https://img.shields.io/badge/Database-SQLite-green" alt="SQLite">
  <img src="https://img.shields.io/badge/Status-In%20Development-orange" alt="Status">
</p>

An enterprise-grade, internal **ERP System** designed for high scalability, built using a hybrid architecture of Next.js and Express. It serves as a unified platform for managing internal operations, human resources, finances, and project tenders, while laying the foundation for a future React Native Mobile App integration and AI Chatbot.

## 🚀 Features

- **Daily Tasks Dashboard**: Real-time task tracking with smart status calculations.
- **HR & Attendance**: 
  - 1-click Check-In / Check-Out system.
  - Leave Request Management (Annual, Sick, Casual) with Approval workflows.
- **Tender Management**:
  - Central registry for Government and Private Tenders.
  - Automated Cron pipeline that alerts exactly 7, 3, and 1 days before submission deadlines.
  - Smart Countdown Timer UI.
- **Meetings & Contacts**:
  - Detailed client meeting scheduler.
  - Minute-precision alerting engine.
- **Accounts & Expenses**: 
  - Track dynamic monthly expenses across custom categories (Operations, Hardware, Software).
- **Credentials Vault**: Secure storage of IT Assets and API keys.

## 🏗 Architecture

This project strictly utilizes a **Hybrid Headless Architecture**, ensuring robust performance and future-proofing:

1. **Frontend (Next.js App Router)**: Provides a lightning-fast, reactive, and responsive Web Dashboard.
2. **Backend (Express + SQLite)**: Running on `server.ts`, the backend controls all raw database logic and Exposes REST APIs (`/api/*`).
3. **Mobile-Ready**: Because the Next.js frontend fetches JSON data exclusively from the Express APIs, a future mobile app (React Native / Flutter) can plug directly into these exact same endpoints without rewriting any backend logic.
4. **Cron Engine**: An intelligent, 1-minute precision Cron Engine runs silently in the background, executing real-time alerts.

## 💻 Getting Started

### Prerequisites
- Node.js (v18+)
- SQLite3 

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/company-erp-bot.git
   cd company-erp-bot
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Create a `.env` file in the root directory (use `.env.example` as a template if available) and add your configurations:
   ```env
   DATABASE_URL=sqlite://./openclaw.db
   ```

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   *The system will automatically initialize the SQLite database if it doesn't exist.*

5. **Access the Dashboard:**
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🛣 Roadmap & Status

- [x] **Phase 1-4**: Basic Server, UI Prototyping, and HR/Accounts modules.
- [x] **Phase 5**: Tender Management & Cron Alerts.
- [ ] **Phase 6**: Calls & Reply Tracker.
- [ ] **Phase 7**: Product Roadmap Module.
- [ ] **Phase 8**: AI Integration (OpenAI SDK + WhatsApp Web integration).
- [ ] **Phase 9**: Native Mobile Application (React Native).

## 📄 License

Internal Company Use Only. Not for open-source distribution.
