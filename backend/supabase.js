const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// ── Validate environment variables before creating client ────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('\n❌ FATAL: Missing Supabase credentials in .env file!');
  console.error('   SUPABASE_URL:', SUPABASE_URL ? '✓ set' : '✗ MISSING');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_KEY ? '✓ set' : '✗ MISSING');
  console.error('\n   Fix: Copy your keys from Supabase Dashboard → Settings → API\n');
}

// Validate key format (JWT tokens start with 'eyJ')
if (SUPABASE_KEY && !SUPABASE_KEY.startsWith('eyJ')) {
  console.error('\n⚠️  WARNING: SUPABASE_SERVICE_ROLE_KEY does not look like a valid JWT.');
  console.error('   Expected: starts with "eyJ..." (a base64 JSON Web Token)');
  console.error('   Got:', SUPABASE_KEY.slice(0, 20) + '...');
  console.error('   Fix: Get the real key from Supabase Dashboard → Settings → API\n');
}

const supabase = createClient(SUPABASE_URL || '', SUPABASE_KEY || '');

// ── Track Supabase connectivity ──────────────────────────────────
let _supabaseHealthy = null; // null = untested
let _lastHealthCheck = 0;

async function checkSupabaseHealth() {
  // Cache for 30 seconds
  if (Date.now() - _lastHealthCheck < 30000 && _supabaseHealthy !== null) {
    return _supabaseHealthy;
  }
  try {
    // Simple query to test connectivity
    const { error } = await supabase.from('students').select('srn').limit(1);
    _supabaseHealthy = !error;
    if (error) {
      console.error('⚠️  Supabase health check failed:', error.message);
      if (error.message.includes('JWT') || error.message.includes('apikey')) {
        console.error('   → Invalid API key. Check SUPABASE_SERVICE_ROLE_KEY in .env');
      } else if (error.message.includes('relation') || error.message.includes('does not exist')) {
        console.error('   → Tables not found. Run supabase_schema.sql in Supabase SQL Editor');
      }
    }
  } catch (e) {
    _supabaseHealthy = false;
    console.error('⚠️  Supabase unreachable:', e.message);
  }
  _lastHealthCheck = Date.now();
  return _supabaseHealthy;
}

// ── Wrap Supabase errors with clear messages ─────────────────────
function classifySupabaseError(error, operation) {
  const msg = error.message || String(error);
  if (msg.includes('JWT') || msg.includes('apikey') || msg.includes('Invalid API key')) {
    return `Database authentication failed. The Supabase API key is invalid. Check your .env file.`;
  }
  if (msg.includes('relation') || msg.includes('does not exist')) {
    return `Database table not found. Run supabase_schema.sql in the Supabase SQL Editor.`;
  }
  if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
    return `Duplicate entry detected during ${operation}.`;
  }
  if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
    return `Cannot reach Supabase. Check your internet connection and SUPABASE_URL.`;
  }
  return `Database error during ${operation}: ${msg}`;
}

// ── Save a new student registration ─────────────────────────────
async function saveStudent({ name, srn, sessionId }) {
  const { data, error } = await supabase
    .from('students')
    .upsert(
      { name, srn, session_id: sessionId, last_active: new Date().toISOString() },
      { onConflict: 'srn' }
    )
    .select()
    .single();

  if (error) {
    const classified = classifySupabaseError(error, 'student registration');
    console.error(`❌ saveStudent failed: ${classified}`);
    const wrapped = new Error(classified);
    wrapped.originalError = error;
    throw wrapped;
  }
  return data;
}

// ── Save a chat message ──────────────────────────────────────────
async function saveChatMessage({ sessionId, srn, role, content }) {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ session_id: sessionId, srn, role, content, created_at: new Date().toISOString() })
    .select()
    .single();

  if (error) {
    const classified = classifySupabaseError(error, 'saving chat message');
    console.error(`❌ saveChatMessage failed: ${classified}`);
    const wrapped = new Error(classified);
    wrapped.originalError = error;
    throw wrapped;
  }
  return data;
}

// ── Get conversation history for a session ───────────────────────
async function getChatHistory(sessionId, limit = 20) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('⚠️  getChatHistory failed:', error.message);
    return []; // Graceful degradation — return empty history instead of crashing
  }
  return data || [];
}

// ── Get student by SRN ───────────────────────────────────────────
async function getStudentBySRN(srn) {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('srn', srn)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('⚠️  getStudentBySRN failed:', error.message);
    throw new Error(classifySupabaseError(error, 'fetching student'));
  }
  return data;
}

// ── Save voice transcript ────────────────────────────────────────
async function saveVoiceTranscript({ sessionId, srn, transcript, response }) {
  const { error } = await supabase
    .from('voice_transcripts')
    .insert({ session_id: sessionId, srn, transcript, response, created_at: new Date().toISOString() });

  if (error) {
    console.error('⚠️  saveVoiceTranscript failed:', error.message);
    throw new Error(classifySupabaseError(error, 'saving voice transcript'));
  }
}

module.exports = {
  supabase,
  saveStudent,
  saveChatMessage,
  getChatHistory,
  getStudentBySRN,
  saveVoiceTranscript,
  checkSupabaseHealth,
};
