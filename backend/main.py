from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import json
import os
from typing import Dict, Any, List
from database import supabase
from datetime import datetime, timezone

app = FastAPI(title="Kindle Jr Backend API (Supabase/FastAPI)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

EXPECTED_QUESTION_COUNT = 60
VALID_OPTION_LETTERS = ["A", "B", "C", "D"]

class Question(BaseModel):
    id: int
    question: str
    options: Dict[str, str]
    # The JSON source key is "answer" (a single letter), but we accept
    # "correct_answer" as an alias so either source file shape works.
    correct_answer: str
    @property
    def correct_option_text(self) -> str:
        return self.options.get(self.correct_answer, "")

# Global cache for questions, keyed by lowercase track ("c", "python")
questions_db: Dict[str, List[Question]] = {}


def _load_track(track: str) -> List[Question]:
    # Parse + strictly validate one track's question bank. The source files
    # are shaped as {"title": ..., "questions": [...]} with each question
    # carrying a `question` string, an `options` object containing the
    # letters A, B, C, D, and a single-letter `answer`.
    base_dir = os.path.dirname(os.path.abspath(__file__))
    # Actual bank filenames in backend/data/ (not "questions_<track>.json").
    filename = "pythonquestions.json" if track == "python" else "cquestions.json"
    file_path = os.path.join(base_dir, "data", filename)

    with open(file_path, "r", encoding="utf-8") as f:
        raw_data = json.load(f)

    # Accept either a bare list or the {"questions": [...]} wrapper.
    if isinstance(raw_data, dict):
        raw_questions = raw_data.get("questions", [])
    else:
        raw_questions = raw_data
    valid_questions: List[Question] = []
    for index, q in enumerate(raw_questions):
        question_text = q.get("question") or q.get("text")
        options = q.get("options")
        # `answer` is the canonical key; `correct_answer` is accepted as an alias.
        correct_answer = q.get("correct_answer") or q.get("answer")

        if not isinstance(question_text, str) or not question_text.strip():
            print(f"[SKIP] {track} #{index}: missing question text")
            continue
        if not isinstance(options, dict) or not all(
            letter in options for letter in VALID_OPTION_LETTERS
        ):
            print(f"[SKIP] {track} #{index}: options must contain A, B, C, D")
            continue
        if not isinstance(correct_answer, str) or correct_answer.strip().upper() not in VALID_OPTION_LETTERS:
            print(f"[SKIP] {track} #{index}: correct_answer must be one of A/B/C/D")
            continue
        valid_questions.append(
            Question(
                id=q.get("id", index + 1),
                question=question_text,
                options={k: str(v) for k, v in options.items()},
                correct_answer=correct_answer.strip().upper(),
            )
        )

    return valid_questions
@app.on_event("startup")
async def startup_event():
    # Strict MCQ ingestion: load + validate both tracks on startup."
    for track in ["c", "python"]:
        try:
            loaded = _load_track(track)
            questions_db[track] = loaded
            if len(loaded) != EXPECTED_QUESTION_COUNT:
                print(
                    f"[WARN] track '{track}' loaded {len(loaded)} questions "
                    f"(expected {EXPECTED_QUESTION_COUNT})"
                )
            print(f"Loaded {len(loaded)} valid questions for track: {track}")
        except Exception as e:
            questions_db[track] = []
            print(f"Failed to load questions for track {track}: {e}")

class RegisterRequest(BaseModel):
    # The frontend sends collegeEmail/personalEmail/enrollmentNum; older clients
    # send email/enrollment. Aliases keep both contracts working.
    model_config = {"populate_by_name": True}
    name: str
    studentId: str
    email: str = Field(default="", alias="collegeEmail")
    personal_email: str = Field(default="", alias="personalEmail")
    enrollment: str = Field(default="", alias="enrollmentNum")
    course: str = ""
    track: str = ""

@app.post("/api/register")
async def register(req: RegisterRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    try:
        # Check if student already exists
        response = supabase.table("students").select("*").eq("student_id", req.studentId).execute()

        if response.data:
            # Student already registered
            return {"message": "Already registered", "student_id": req.studentId, "status": "existing"}

        # Create new student. `track` may only be known after track selection,
        # so it falls back to "C" to satisfy the NOT NULL column.
        new_student = {
            "student_id": req.studentId,
            "name": req.name,
            "email": req.email or req.personal_email,
            "enrollment_no": req.enrollment or "N/A",
            "track": req.track or "C",
            # started_at defaults to NOW() in DB
        }
        supabase.table("students").insert(new_student).execute()
        return {"message": "Registration successful", "student_id": req.studentId, "status": "new"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SaveAnswerRequest(BaseModel):
    # questionId arrives as a prefixed string ("c_1"/"py_1"); answer is the
    # selected option text. cheated may be supplied directly or derived from
    # the running violation count.
    studentId: str
    questionId: str
    answer: str
    currentQuestion: int = 0
    violationCount: int = 0
    cheated: bool = False

@app.post("/api/save-answer")
async def save_answer(req: SaveAnswerRequest):
    if not supabase:
        return {"status": "error", "message": "DB not configured"}
        
    try:
        # Fetch current student data
        res = supabase.table("students").select("answers, cheated").eq("student_id", req.studentId).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Student not found")
            
        student = res.data[0]
        answers = student.get("answers") or {}
        # A student is flagged cheated on the 2nd violation, or if reported
        # directly; once set it is never cleared.
        cheated = bool(
            student.get("cheated") or req.cheated or req.violationCount >= 2
        )

        # Update answers keyed by the prefixed question id ("c_1"/"py_1").
        if req.answer is not None:
            answers[str(req.questionId)] = req.answer
        
        # Update row
        supabase.table("students").update({
            "answers": answers,
            "cheated": cheated
        }).eq("student_id", req.studentId).execute()
        
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SubmitRequest(BaseModel):
    studentId: str

@app.post("/api/submit")
async def submit_quiz(req: SubmitRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
        
    try:
        # Fetch student and started_at
        res = supabase.table("students").select("*").eq("student_id", req.studentId).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Student not found")
            
        student = res.data[0]
        if student.get("submitted_at"):
            return {"status": "already_submitted"}
            
        track = (student.get("track") or "").lower()
        answers = student.get("answers") or {}
        started_at_str = student.get("started_at")

        # Parse started_at
        started_at = datetime.fromisoformat(started_at_str.replace("Z", "+00:00"))
        submitted_at = datetime.now(timezone.utc)

        # Exact integer seconds between registration and submission.
        time_taken = int((submitted_at - started_at).total_seconds())

        # Calculate score. The frontend submits the selected option TEXT (e.g.
        # "Platform-dependent") keyed by the question id ("c_1"/"py_1"), while
        # the bank stores the correct LETTER. Accept either representation.
        correct_count = 0
        track_questions = questions_db.get(track, [])
        prefix = "py" if track == "python" else "c"
        for q in track_questions:
            submitted = answers.get(f"{prefix}_{q.id}")
            if submitted is None:
                submitted = answers.get(str(q.id))
            if not submitted:
                continue
            normalized = str(submitted).strip()
            if (
                normalized.upper() == q.correct_answer
                or normalized == q.correct_option_text
            ):
                correct_count += 1

        # 1 point per correct answer, 60 questions.
        total_score = correct_count
        
        update_data = {
            "submitted_at": submitted_at.isoformat(),
            "time_taken_seconds": time_taken,
            "correct_count": correct_count,
            "total_score": total_score
        }
        
        supabase.table("students").update(update_data).eq("student_id", req.studentId).execute()
        
        return {"status": "success", "score": total_score, "time_taken": time_taken}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/leaderboard")
async def get_leaderboard():
    if not supabase:
        return {"students": []}
        
    try:
        # Sort by total_score DESC, time_taken_seconds ASC
        res = supabase.table("students").select("*").order("total_score", desc=True).order("time_taken_seconds", desc=False).execute()
        return {"students": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Health check
@app.get("/api/health")
async def health():
    return {"status": "healthy", "db_connected": supabase is not None}
