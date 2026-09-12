-- Create Students Table
CREATE TABLE IF NOT EXISTS public.students (
    student_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    enrollment_no TEXT NOT NULL,
    track TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    total_score INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    time_taken_seconds INTEGER DEFAULT 0,
    cheated BOOLEAN DEFAULT FALSE,
    answers JSONB DEFAULT '{}'::jsonb
);

-- Enable Realtime Sync across all Admin Dashboards
ALTER PUBLICATION supabase_realtime ADD TABLE public.students;
