# Kindle Jr 5.0 - Assessment Platform

Real-time assessment platform built for **Kindle Jr 5.0**, an IEEE GEU SB hackathon assessment exclusively designed for first-year B.Tech and BCA students at Graphic Era (Deemed to be University).

---

## Technology Stack

- **Frontend**: Next.js 14+ (App Router) + Tailwind CSS + Lucide Icons + `idb-keyval` (IndexedDB offline sync).
- **Backend**: Golang (Go 1.22) with `gorilla/mux`, Firestore Admin SDK, and Google Sheets v4 API SDK.
- **Database**: Cloud Firestore (with automated fallback to resilient In-Memory Store during local development without credentials).
- **Data Export**: Google Sheets API v4 using `GOOGLE_SHEETS_CREDENTIALS_BASE64`.
- **Containerization**: Multi-stage `Dockerfile` (Backend + Frontend) and `docker-compose.yml`.

---

## Architectural Features

1. **Zero-Delay Auto-Save Registration**: Every keystroke in the student registration form fires a debounced (300 ms) payload to the Go backend (`/api/register`). No manual save button required.
2. **Low-Latency Question Shuffling**: Upon selecting track (C or Python), the frontend fetches the question bank, shuffles the index array client-side once, and commits `shuffledOrder` to the backend.
3. **Strict 70-Minute Timer Logic**: Starts strictly on Question 1 load. Timer recalculation formula on backend during reconnects:
   $$\text{RemainingSeconds} = 4200 - \lfloor(\text{CurrentTime} - \text{StartedAt}).\text{Seconds}()\rfloor$$
4. **Network Resilience & State Recovery**:
   - Answers sync to backend immediately.
   - If network drops, responses queue in IndexedDB and flush automatically upon reconnection (`online` event).
   - Logging back in with Student ID restores exam state, timer, current question index, and all populated answers.
5. **Exact Character-for-Character Matching**: Fill-in-the-blank questions are evaluated character-by-character (`strings.TrimSpace(userAns) == strings.TrimSpace(correctAns)`).

---

## Question Bank Difficulty Rules

- **15 Aptitude Questions**: Moderate difficulty sequence completion, logic puzzles, probability, rate/slab calculation problems.
- **45 Coding Questions (C or Python)**: Restricted strictly to basic variable assignments, operators, `if`/`else`, and single `for`/`while` loops. Strictly NO functions, NO arrays/lists, NO pointers, NO nested loops.

---

## Quick Start (Running Locally)

### Option 1: Docker Compose (Recommended)

```bash
# 1. Clone repository and navigate to root
cd "Kindle jr"

# 2. Copy environment file
cp .env.example .env

# 3. Build and launch services
docker-compose up --build
```

Access:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8080/api/health`

---

### Option 2: Running Directly (Without Docker)

#### Prerequisites
- Go 1.22+
- Node.js 18+ / 20+

#### 1. Backend Setup (Golang)

```bash
cd backend
go mod download
go run ./cmd/server/main.go
```
The Go server will start on `http://localhost:8080`.

#### 2. Frontend Setup (Next.js)

```bash
cd frontend
npm install
npm run dev
```
The Next.js app will run on `http://localhost:3000`.

---

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Go server HTTP port (default `8080`) |
| `FIREBASE_PROJECT_ID` | Firestore project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to Firebase admin JSON |
| `GOOGLE_SHEETS_CREDENTIALS_BASE64` | Base64-encoded Google service account JSON |
| `GOOGLE_SHEET_ID` | Google Sheet ID for score export |
| `NEXT_PUBLIC_API_URL` | Frontend API targeting URL (`http://localhost:8080/api`) |

---

## API Endpoints

- `POST /api/register` – Zero-delay keystroke auto-save
- `POST /api/init-quiz` – Saves selected track & shuffled index array
- `POST /api/save-answer` – Auto-saves single question response
- `GET /api/state/{studentId}` – State recovery & timer recalculation
- `GET /api/questions/{track}` – Serves 60 question bank
- `POST /api/submit` – Grades exam, updates Firestore, appends row to Google Sheet
