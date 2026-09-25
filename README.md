# ⚡ PollMeter Campus — Enterprise Classroom Quizzing & Academic Analytics

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-≥18.0.0-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Durable_Store-336791.svg)](https://www.postgresql.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict_Mode-blue.svg)](https://www.typescriptlang.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-Realtime_Engine-010101.svg)](https://socket.io/)

A high-concurrency, multi-tenant classroom assessment and polling platform tailored for universities and colleges. Built upon a Mentimeter-style real-time engine, **PollMeter Campus** introduces strict multi-tenant data isolation, role-based access control (`Admin` → `Mentor` → `Batch` → `Student`), durable PostgreSQL persistence, AI question generation, and deanonymized academic gradebook exports.

---

## 🏛️ Campus Architecture & Hierarchy

PollMeter Campus enforces an academic hierarchy with mechanical data isolation boundaries:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   University College Administration                    │
│      (Super-Admin: Domain policies, Faculty Directory, Audit Logs)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌───────────────────────┐                         ┌───────────────────────┐
│     Faculty Mentor    │                         │     Faculty Mentor    │
│  (Prof. Web Dev)      │                         │   (Prof. Algorithms)  │
└──────────┬────────────┘                         └──────────┬────────────┘
           │                                                 │
   [Assigned Batches]                                [Assigned Batches]
           │                                                 │
     ┌─────┴──────────────┐                            ┌─────┴──────────────┐
     ▼                    ▼                            ▼                    ▼
┌──────────────┐   ┌──────────────┐              ┌──────────────┐   ┌──────────────┐
│ 1st Year (A) │   │ 2nd Year (A) │              │ 2nd Year (B) │   │ 3rd Year (A) │
│ ~100 Students│   │ ~100 Students│              │ ~100 Students│   │ ~100 Students│
└──────────────┘   └──────────────┘              └──────────────┘   └──────────────┘
```

### Core Hierarchy Levels

1. **College / Domain**: Configured via `allowedDomains` (e.g. `@medhaviskillsuniversity.edu.in`, `@medhaviskillsunivercity.edu.in`).
2. **University Administrator (`ADMIN`)**:
   - Manages faculty mentors, departments, and batch allocations.
   - Monitors university-wide analytics (quizzes hosted, student participation, cross-subject audits).
   - Reviews compliance and export audit logs.
3. **Faculty Mentor (`MENTOR`)**:
   - Authorized subject specialist assigned to specific class cohorts.
   - Creates, edits, and hosts live quizzes tagged to a **Subject** and **Target Batch**.
   - **Strict Data Isolation**: Can only access their own quizzes, assigned batches, and gradebooks. Cross-mentor data access is blocked server-side (HTTP 403).
4. **Student Cohort (`STUDENT`)**:
   - Authenticates using their official university email (via OTP or campus Google Auth).
   - Participates in live sessions via join codes or QR scans.
   - Tracks longitudinal personal score history and ranks under "My Quiz Journey".

---

## 🔒 Strict Data Isolation & Security Rules

To ensure academic integrity, privacy, and compliance:

- **No Unified Pool**: Mentors never see other mentors' quizzes, question banks, or gradebook rosters.
- **Server-Authoritative Scoping**: Every database query for quizzes, sessions, and participant records derives the mentor identity strictly from `req.user.email` (from the verified JWT), never from client-supplied URL parameters.
- **Role Elevation Guard**: Admin privileges cannot be acquired merely by possessing a university email. Admin accounts must be explicitly seeded in the database or bootstrapped via `ADMIN_BOOTSTRAP_SECRET`.
- **Audit Trails**: Critical operations—such as CSV gradebook downloads (`REPORT_EXPORTED`), session creations (`SESSION_CREATED`), and faculty assignments (`FACULTY_ASSIGNED`)—are written to the `audit_logs` table.

---

## ⚡ Real-Time Engine (Socket.io)

The live session runtime preserves the sub-second classroom responsiveness:

- **Phase Machine**: `lobby` → `question` → `results` → `leaderboard` → `ended`.
- **Instant Auto-Submit on Tap**: Answers lock immediately upon selection—no secondary submit button required.
- **Scoring Engine**: 1,000 base points for correctness + up to 500 bonus points for response speed; 0 points for incorrect choices.
- **Animated Racing Leaderboard**: Standings display with rank shift badges (`▲ +2`, `▼ -1`) and Olympic podium celebrations.
- **Rejoin & Auto-Recovery**: Students who refresh or experience network disconnects automatically restore their session state, score, and submitted answers via cryptographic rejoin tokens.
- **Dual Persistence Bridge**: During the live quiz, the in-memory state provides real-time speed. Upon `endSession()`, all student responses, final ranks, accuracy, and scores are atomically persisted to PostgreSQL.

---

## 📊 Analytics, Reports & CSV Exports

Mentors and Administrators have access to rich reporting surfaces:

- **Multi-Horizon Date Filtering**:
  - `All Time`
  - `Today`
  - `Yesterday`
  - `Last 7 Days`
  - `Last 30 Days`
  - `Custom Date Range` (Start Date → End Date)
- **Batch-Level Filtering**: Filter reports by individual academic cohorts (`1st Year - Batch A`, `2nd Year - Batch B`, etc.).
- **Deanonymized Gradebooks**: Maps nicknames used during the live quiz to verified student college IDs, full legal names, and university email addresses.
- **One-Click CSV Export**: Downloads formatted gradebooks ready for university ERP, LMS, or spreadsheet analysis.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Backend Runtime** | Node.js (≥18) · Express · TypeScript |
| **Real-Time Engine** | Socket.io · State Machine · Rejoin Tokens |
| **Database** | PostgreSQL (`pg` Pool) + Durable JSON Fallback |
| **Authentication** | JWT (HttpOnly/Bearer) · Campus OTP · Google OAuth 2.0 |
| **AI Generation** | Google Gemini 1.5/2.0 API · Auto-Repair Fallback |
| **Frontend Framework** | React 18 · TypeScript · Vite · React Router v6 |
| **Styling** | Vanilla CSS (Zero Heavy Frameworks, Pure Custom Tokens) |
| **Visualization** | Live SVG Bar Charts · Canvas Confetti · QR Generator |

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9
- PostgreSQL (Optional for production; defaults to persistent local store if `DATABASE_URL` is omitted)

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/codervinitjangir/pollmeter.git
cd pollmeter

# Install root, backend server, and frontend client dependencies
npm run install:all
```

### 2. Environment Configuration

Create or update `server/.env`:

```env
PORT=3001
CLIENT_ORIGIN=http://localhost:5173

# Optional: PostgreSQL Connection (defaults to local persistent store if omitted)
# DATABASE_URL=postgresql://postgres:password@localhost:5432/pollmeter_campus

# Optional: AI Question Generation
# GEMINI_API_KEY=AIzaSy...

# Admin Bootstrap Security
ADMIN_BOOTSTRAP_SECRET=super_secret_bootstrap_key_msu_2026
```

### 3. Launch Development Environment

```bash
# Starts both Express backend (port 3001) and Vite frontend (port 5173)
npm run dev
```

- **Landing Page**: `http://localhost:5173/`
- **Host / Mentor Portal**: `http://localhost:5173/host`
- **Student Join Screen**: `http://localhost:5173/join`
- **Admin Console**: `http://localhost:5173/admin`
- **API & Sockets**: `http://localhost:3001`

---

## 🗄️ Database Schema Overview

```sql
-- University Faculty & Users
CREATE TABLE users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(160) UNIQUE NOT NULL,
  real_name VARCHAR(160) NOT NULL,
  role VARCHAR(20) DEFAULT 'student', -- 'student' | 'mentor' | 'admin'
  college_domain VARCHAR(120) NOT NULL,
  department VARCHAR(160),
  subject VARCHAR(160),
  batches JSONB DEFAULT '[]',
  picture TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Completed Live Quiz Sessions
CREATE TABLE quiz_sessions (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  topic VARCHAR(255) NOT NULL,
  subject VARCHAR(160) DEFAULT 'General',
  batch VARCHAR(100) DEFAULT 'General',
  host_email VARCHAR(160) NOT NULL,
  host_name VARCHAR(160),
  question_count INT DEFAULT 0,
  participant_count INT DEFAULT 0,
  questions JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP WITH TIME ZONE
);

-- Verified Student Attendance & Grades
CREATE TABLE session_participants (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64),
  real_name VARCHAR(160) NOT NULL,
  email VARCHAR(160) NOT NULL,
  screen_name VARCHAR(100) NOT NULL,
  batch VARCHAR(100) DEFAULT 'General',
  final_score INT DEFAULT 0,
  correct_count INT DEFAULT 0,
  total_questions INT DEFAULT 0,
  rank INT DEFAULT 0,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Granular Answer Audit Trail
CREATE TABLE student_responses (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  question_index INT NOT NULL,
  user_id VARCHAR(64),
  email VARCHAR(160) NOT NULL,
  real_name VARCHAR(160) NOT NULL,
  screen_name VARCHAR(100) NOT NULL,
  selected_option TEXT,
  is_correct BOOLEAN DEFAULT false,
  score INT DEFAULT 0,
  time_taken_ms INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Institutional Audit Logs
CREATE TABLE audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  actor_id VARCHAR(160) NOT NULL,
  action VARCHAR(100) NOT NULL,
  target_id VARCHAR(160),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 📡 REST & Real-Time API Summary

### Authentication & Domain Verification
- `GET /api/auth/domains` — Allowed university domains.
- `POST /api/auth/otp/send` — Dispatches 6-digit verification code.
- `POST /api/auth/otp/verify` — Validates OTP and issues campus JWT.
- `POST /api/auth/google` — Verifies Google token against allowed domains.
- `GET /api/auth/me` — Returns current authenticated profile.

### Mentor Operations (Strictly Scoped)
- `POST /api/sessions` — Initializes a live session tagged with Subject & Batch.
- `GET /api/mentor/quizzes` — Retrieves quizzes hosted by the authenticated mentor with filters (`timeRange`, `batch`, `startDate`, `endDate`).
- `GET /api/mentor/quizzes/:id` — Full session breakdown and deanonymized roster (403 for unauthorized mentors).
- `GET /api/batches` — List of available university cohorts.

### University Administration
- `GET /api/admin/overview` — University-wide counts, batch & subject distributions.
- `GET /api/admin/faculty` — Complete directory of faculty mentors with assigned batches.
- `POST /api/admin/faculty` — Add or modify mentor credentials and batch allocations.
- `DELETE /api/admin/faculty/:email` — Revoke mentor privileges.
- `GET /api/admin/students` — Audit cross-department student records and standing.
- `GET /api/admin/audit-logs` — Review security and report export actions.

### Real-Time Sockets (Socket.io)
- `join_session` — Student joins with session code, authenticated user data, and rejoin token.
- `host_join` — Authenticates presenter/host for a specific live session.
- `host_start_session` — Unlocks reading timer and begins question flow.
- `submit_response` — Student submits choice (auto-scored based on speed + correctness).
- `host_next_question` — Moves to results, leaderboard, or subsequent question.
- `send_reaction` — Dispatches floating emoji reactions onto the presenter screen.

---

## 📄 License

MIT © [codervinitjangir](https://github.com/codervinitjangir)
