# ⚡ PollMeter — Real-Time Live Classroom Quiz & Polling Platform

[codervinitjangir/pollmeter](https://github.com/codervinitjangir/pollmeter)

A clean, high-performance Mentimeter-style classroom quiz platform built specifically for mentors and teachers. Create quizzes from topic/syllabus with AI, display a scannable QR code on the projector screen for ~50 students on phones or laptops, auto-score by speed + correctness, show live animated leaderboards with 5-second auto-advance, and export final results as CSV.

---

## 🎯 Core Features & Guardrails

- **Classroom-First Minimalist Design**: Clean, light-themed Mentimeter aesthetics with high contrast, legible typography, and no clutter (no social feeds, no accounts/signup, no complex distracting animations).
- **Instant Auto-Submit on Tap (Rule 9)**: Students tap any answer option to auto-submit immediately—no need to click an extra submit button. The answer is locked, and when the timer ends, correctness and speed points are revealed.
- **5-Second Auto-Advance Leaderboard (Rule 8)**: Displays standings after every question for 5 seconds with an animated countdown bar and pause/skip controls.
- **Animated Rank Shifting (Rule 8)**: When a student climbs (e.g., from 3rd to 1st place), their previous rank is crossed out (`#3 ➔ #1`) alongside an animated climb badge (`▲ +2`) and the displaced student drops (`#1 ➔ #2` `▼ -1`).
- **Speed + Correctness Scoring**: 1000 base points for correct answers + up to 500 points for early submission speed; 0 points for incorrect answers.
- **Projector & Fullscreen Mode**: Designed for mentors with a laptop connected to a classroom projector/TV with a single-click fullscreen toggle.
- **Instant QR & Code Join**: Big 6-digit session code and high-resolution QR code rendered automatically using the host machine's Wi-Fi / LAN IP.
- **AI Question Generation**: Enter syllabus points or choose presets (e.g. Computer Networks, Python Basics, OS, SQL) to generate structured questions in seconds. Questions can be reviewed and edited before starting.
- **Rejoin & Auto-Recovery**: Students who refresh or reconnect preserve their session, score, and submitted answers automatically.
- **📥 One-Click CSV Export**: Download final student standings, scores, and accuracy directly from the final results screen.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js · Express · Socket.io · TypeScript |
| Frontend | Vite · React 18 · TypeScript · React Router v6 |
| Styling | Pure Vanilla CSS (Mentimeter Design Tokens) |
| Animations | Canvas Confetti, CSS Keyframe Transitions |
| QR Code | `qrcode.react` (SVG/Canvas rendering) |
| Data Store | In-memory session store (Zero external DB setup needed) |

---

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9

### Installation & Run

```bash
# Clone the repository
git clone https://github.com/codervinitjangir/pollmeter.git
cd pollmeter

# Install all dependencies (root, server, and client)
npm run install:all

# Start both backend server and Vite client
npm run dev
```

- **Host Dashboard**: `http://localhost:5173/host`
- **Student Join Screen**: `http://localhost:5173/join`
- **Backend Socket/API**: `http://localhost:3001`

---

## 🤖 AI Question Generation Setup (Optional)

PollMeter comes with a built-in intelligent fallback question bank covering common topics. To enable live Google Gemini AI generation:

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/).
2. Create or edit `server/.env`:
   ```env
   GEMINI_API_KEY=AIzaSy...
   ```
3. Restart the server. In `/host`, click **✨ Start with AI**, enter your syllabus or topic, and questions will be generated instantly.

---

## 📖 Live Classroom Workflow

```
1. Host enters syllabus/topic → AI generates questions
2. Mentor reviews questions and clicks "Create Session"
3. Projector displays join code and QR code
4. ~50 students scan QR code or enter code at /join
5. Mentor starts the session
6. Question appears on phones/laptops with countdown ring
7. Student taps option → Answer auto-submits & locks instantly
8. Timer ends → Correct/Wrong status + speed bonus revealed
9. 5-second Leaderboard shows podium with animated rank shift
10. Final screen shows Champions & provides 1-click CSV Export
```

---

## 📡 Socket.io Protocol

| Direction | Event | Payload / Description |
|---|---|---|
| C → S | `join_session` | `{ code, name, participantId?, rejoinToken? }` |
| C → S | `submit_response` | `{ code, questionId, value }` (Instant auto-submit) |
| C → S | `host_start_session` | `{ code, hostId }` — Launches first question |
| C → S | `host_next_question` | `{ code, hostId }` — Shows leaderboard or advances |
| C → S | `send_reaction` | `{ code, emoji }` — Classroom reaction dock |
| S → C | `session_state` | Full state sync on join / reconnect |
| S → C | `question_started` | `{ question, index, timerStartedAt, timerEndsAt }` |
| S → C | `results_revealed` | `{ questionId, aggregated, correctAnswer }` |
| S → C | `leaderboard_updated` | `{ leaderboard, questionId, correctAnswer }` |
| S → C | `session_ended` | `{ finalResults, questions, leaderboard }` |

---

## 📄 License

MIT © [codervinitjangir](https://github.com/codervinitjangir)
