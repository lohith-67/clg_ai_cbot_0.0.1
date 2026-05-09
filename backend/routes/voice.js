/**
 * Voice Route — backend/routes/voice.js
 * ─────────────────────────────────────────────────────────────
 * Handles voice transcript logging from the chatbot widget.
 *
 * Routes:
 *   POST /api/voice/log        — Save a voice transcript + AI response
 *   GET  /api/voice/:sessionId — Fetch voice history for a session
 *   GET  /api/voice/all        — Admin: get all voice transcripts
 * ─────────────────────────────────────────────────────────────
 * Wired to: supabase.js → saveVoiceTranscript()
 *           server.js   → app.use('/api/voice', voiceRoutes)
 */

const express = require('express');
const router  = express.Router();
const { saveVoiceTranscript, supabase } = require('../supabase');

// ── POST /api/voice/log ──────────────────────────────────────────
// Called by chatbot-widget.html after a voice interaction completes.
// Body: { sessionId, srn, transcript, response }
router.post('/log', async (req, res) => {
  try {
    const { sessionId, srn, transcript, response } = req.body;

    if (!sessionId || !transcript) {
      return res.status(400).json({ error: 'sessionId and transcript are required' });
    }

    await saveVoiceTranscript({
      sessionId,
      srn: srn || null,
      transcript: transcript.trim(),
      response:   response ? response.trim() : null,
    });

    console.log(`🎙️  Voice log saved — session: ${sessionId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Voice log error:', err.message);
    res.status(500).json({ error: 'Failed to save voice transcript' });
  }
});

// ── GET /api/voice/ ──────────────────────────────────────────────
// Admin route — returns all voice transcripts across all sessions.
// Protected by ADMIN_PASSWORD env var (pass as query param ?password=xxx)
router.get('/', async (req, res) => {
  try {
    const { password, limit = 100 } = req.query;

    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { data, error } = await supabase
      .from('voice_transcripts')
      .select('session_id, srn, transcript, response, created_at')
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    if (error) throw error;

    res.json({ count: data.length, transcripts: data });
  } catch (err) {
    console.error('Voice all error:', err.message);
    res.status(500).json({ error: 'Could not fetch transcripts' });
  }
});

// ── GET /api/voice/:sessionId ────────────────────────────────────
// Returns all voice transcripts for a given session.
// Used by the chatbot widget to show voice history.
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data, error } = await supabase
      .from('voice_transcripts')
      .select('transcript, response, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) throw error;

    res.json({ transcripts: data || [] });
  } catch (err) {
    console.error('Voice fetch error:', err.message);
    res.status(500).json({ error: 'Could not fetch voice history' });
  }
});

module.exports = router;
