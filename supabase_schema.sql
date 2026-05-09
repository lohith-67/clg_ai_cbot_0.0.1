-- ================================================================
-- SNPSU Chatbot — Supabase Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor → Run
-- ================================================================

-- ── Students table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  srn           TEXT UNIQUE NOT NULL,
  session_id    TEXT,
  last_active   TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Chat messages table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id    TEXT NOT NULL,
  srn           TEXT REFERENCES students(srn) ON DELETE SET NULL,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Voice transcripts table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_transcripts (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id    TEXT NOT NULL,
  srn           TEXT REFERENCES students(srn) ON DELETE SET NULL,
  transcript    TEXT NOT NULL,
  response      TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes for performance ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chat_session     ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_srn         ON chat_messages(srn);
CREATE INDEX IF NOT EXISTS idx_voice_session    ON voice_transcripts(session_id);
CREATE INDEX IF NOT EXISTS idx_students_srn     ON students(srn);

-- ── Row Level Security (RLS) — allow service role full access ────
ALTER TABLE students         ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_transcripts ENABLE ROW LEVEL SECURITY;

-- Service role bypass (your backend uses service role key)
CREATE POLICY "service_role_all_students"
  ON students FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_messages"
  ON chat_messages FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_voice"
  ON voice_transcripts FOR ALL
  USING (auth.role() = 'service_role');

-- ── Done! ────────────────────────────────────────────────────────
-- After running this, you should see 3 tables in Table Editor:
--   students | chat_messages | voice_transcripts
