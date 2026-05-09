/**
 * Chat Route — backend/routes/chat.js
 * ─────────────────────────────────────────────────────────────
 * Uses Groq API — blazing fast cloud LLM (free tier: 30 RPM).
 * Get your free API key at: https://console.groq.com
 *
 * Routes:
 *   POST /api/chat/register           — Register student
 *   POST /api/chat/message            — Send message, get AI reply
 *   GET  /api/chat/history/:sessionId — Fetch chat history
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const router  = express.Router();
const { buildSystemPrompt } = require('./buildSystemPrompt');
const {
  saveStudent,
  saveChatMessage,
  getChatHistory,
  getStudentBySRN
} = require('../supabase');

// ── Groq Configuration ──────────────────────────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL   = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Call Groq's OpenAI-compatible chat API.
 * Groq responds in ~200ms — the fastest LLM API available.
 * Free tier: 30 requests/minute, no credit card needed.
 */
async function callGroq(messages) {
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: 1024,
      temperature: 0.7,
    })
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(`Groq API error (${response.status}): ${errBody.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── POST /api/chat/register ──────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, srn, sessionId } = req.body;

    if (!name || !srn || !sessionId) {
      return res.status(400).json({ error: 'name, srn, and sessionId are required' });
    }

    const nameTrimmed = name.trim();
    const srnUpper    = srn.trim().toUpperCase();

    const student = await saveStudent({
      name: nameTrimmed,
      srn:  srnUpper,
      sessionId
    });

    const welcomeMsg = `Hello ${nameTrimmed}! 👋 Welcome to SNPSU Assistant. I'm here to help you with anything about Sapthagiri NPS University — timetables, events, admissions, exams, and more. How can I help you today?`;

    await saveChatMessage({
      sessionId,
      srn:     srnUpper,
      role:    'assistant',
      content: welcomeMsg
    });

    res.json({ success: true, student, welcomeMessage: welcomeMsg });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: err.message || 'Registration failed.' });
  }
});

// ── POST /api/chat/message ───────────────────────────────────────
router.post('/message', async (req, res) => {
  try {
    const { message, sessionId, srn, studentName } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ error: 'message and sessionId are required' });
    }

    // Auto-register student if needed (prevents foreign key errors)
    if (srn && studentName) {
      try {
        await saveStudent({ name: studentName, srn, sessionId });
      } catch (e) {
        console.error("Auto-registration failed, ignoring:", e.message);
      }
    }

    // Save user message to Supabase
    if (srn) {
      await saveChatMessage({ sessionId, srn, role: 'user', content: message });
    }

    // Fetch recent conversation history
    const history = await getChatHistory(sessionId, 10);

    // Build messages array (OpenAI-compatible format)
    const aiMessages = [];

    // 1. System prompt with college knowledge
    aiMessages.push({
      role: 'system',
      content: buildSystemPrompt(studentName || null)
    });

    // 2. Past conversation (skip current message to avoid duplication)
    for (const m of history) {
      if (m.content === message && m.role === 'user') continue;
      aiMessages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      });
    }

    // 3. Current user message
    aiMessages.push({ role: 'user', content: message });

    // Call Groq
    console.log(`🤖 [Groq/${GROQ_MODEL}] "${message.slice(0, 60)}..."`);
    const startTime = Date.now();
    const reply = await callGroq(aiMessages);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Reply in ${elapsed}s (${reply.length} chars)`);

    // Save AI reply to Supabase
    if (srn) {
      await saveChatMessage({ sessionId, srn, role: 'assistant', content: reply });
    }

    res.json({ reply, sessionId });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to get response.' });
  }
});

// ── GET /api/chat/history/:sessionId ────────────────────────────
router.get('/history/:sessionId', async (req, res) => {
  try {
    const history = await getChatHistory(req.params.sessionId, 50);
    res.json({ history });
  } catch (err) {
    console.error('History error:', err.message);
    res.status(500).json({ error: 'Could not fetch history' });
  }
});

module.exports = router;
