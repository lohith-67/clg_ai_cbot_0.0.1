/**
 * server.js — SNPSU Chatbot Backend
 * ─────────────────────────────────────────────────────────────
 * Main Express server. Mounts all routes and starts the server.
 * ─────────────────────────────────────────────────────────────
 * Routes mounted:
 *   /api/chat       → routes/chat.js
 *   /api/voice      → routes/voice.js
 *   /api/knowledge  → routes/knowledge.js
 *   /api/pdf        → routes/pdf.js  (backend-route-pdf.js)
 *   /health         → inline health check
 */

require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const path      = require('path');

const chatRoutes      = require('./routes/chat');
const voiceRoutes     = require('./routes/voice');
const knowledgeRoutes = require('./routes/knowledge');
const pdfRoutes       = require('./routes/pdf');
const { checkSupabaseHealth } = require('./supabase');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── CORS ─────────────────────────────────────────────────────────
// During development: allow all origins so file:// and Live Server both work.
// In production: set FRONTEND_URL to your deployed domain.
const allowedOrigins = process.env.FRONTEND_URL || '*';
app.use(cors({
  origin:      allowedOrigins === '*' ? true : allowedOrigins.split(',').map(s => s.trim()),
  methods:     ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// ── Body parsers ─────────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting (chat messages only) ───────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute window
  max:      30,          // 30 requests per minute per IP
  message:  { error: 'Too many requests. Please slow down.' }
});
app.use('/api/chat/message', limiter);

// ── Routes ───────────────────────────────────────────────────────
app.use('/api/chat',      chatRoutes);
app.use('/api/voice',     voiceRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/pdf',       pdfRoutes);

// ── Serve frontend static files ─────────────────────────────────
// Access the chatbot at http://localhost:3001/chatbot-widget.html
app.use(express.static(path.join(__dirname, '..', 'forntend')));

// ── Health check ─────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const dbHealthy = await checkSupabaseHealth();
  res.json({
    status:    'ok',
    service:   'SNPSU Chatbot API',
    database:  dbHealthy ? 'connected' : 'error',
    timestamp: new Date().toISOString()
  });
});

// ── Global error handler ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.stack);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🎓 SNPSU Chatbot Backend running on port ${PORT}`);
  console.log(`🤖 AI Model:   ${process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'} (via Groq API)`);
  console.log(`📡 Health:     http://localhost:${PORT}/health`);
  console.log(`💬 Chat API:   http://localhost:${PORT}/api/chat`);
  console.log(`📄 PDF API:    http://localhost:${PORT}/api/pdf`);
  console.log(`📚 Knowledge:  http://localhost:${PORT}/api/knowledge`);
  console.log(`🌐 Widget:     http://localhost:${PORT}/chatbot-widget.html`);

  // Run Supabase connectivity check on startup
  console.log('\n🔍 Checking database connection...');
  const dbOk = await checkSupabaseHealth();
  if (dbOk) {
    console.log('✅ Supabase database: connected\n');
  } else {
    console.error('❌ Supabase database: FAILED');
    console.error('   The chatbot will NOT work until this is fixed.');
    console.error('   Check your .env file for valid SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY\n');
  }
});
