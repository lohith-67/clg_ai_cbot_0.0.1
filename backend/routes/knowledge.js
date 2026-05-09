/**
 * Knowledge Route — backend/routes/knowledge.js
 * ─────────────────────────────────────────────────────────────
 * Lets you view and update college_knowledge.json via API —
 * without restarting the server.
 *
 * Routes:
 *   GET  /api/knowledge              — View entire knowledge base
 *   GET  /api/knowledge?section=faq  — View one section
 *   PUT  /api/knowledge?section=faq  — Update one section (admin)
 *   POST /api/knowledge/reload       — Hot-reload KB into memory (admin)
 *   DELETE /api/knowledge?section=_pdf_data — Remove a section (admin)
 * ─────────────────────────────────────────────────────────────
 * Wired to: server.js → app.use('/api/knowledge', knowledgeRoutes)
 *           chat.js   → reads the same JSON file (reload keeps in sync)
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

// ── Resolve path to college_knowledge.json ───────────────────────
const KB_PATH = path.resolve(
  process.env.KNOWLEDGE_BASE_PATH || './data/college_knowledge.json'
);

// ── Helper: read KB from disk ────────────────────────────────────
function readKB() {
  if (!fs.existsSync(KB_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
}

// ── Helper: write KB to disk ─────────────────────────────────────
function writeKB(data) {
  fs.mkdirSync(path.dirname(KB_PATH), { recursive: true });
  fs.writeFileSync(KB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ── Admin password check middleware ──────────────────────────────
function requireAdmin(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error('❌ ADMIN_PASSWORD is not configured; rejecting admin request.');
    return res.status(503).json({ error: 'Admin access is not configured on this server.' });
  }

  const pwd = req.headers['x-admin-password'] || req.query.password;
  if (pwd !== adminPassword) {
    return res.status(403).json({ error: 'Unauthorized. Provide x-admin-password header or ?password= query.' });
  }
  next();
}

// ── GET /api/knowledge ───────────────────────────────────────────
// View full KB or a single section.
// Public route — no auth needed (it's just college info).
// Usage:
//   GET /api/knowledge               → entire JSON
//   GET /api/knowledge?section=faq   → just the faq array
router.get('/', (req, res) => {
  try {
    const kb = readKB();
    const { section } = req.query;

    if (section) {
      if (!(section in kb)) {
        return res.status(404).json({ error: `Section '${section}' not found in knowledge base` });
      }
      return res.json({ section, data: kb[section] });
    }

    // Strip out large _pdf_data from public view unless explicitly asked
    const { _pdf_data, ...publicKB } = kb;
    res.json({
      sections: Object.keys(kb),
      has_pdf_data: !!_pdf_data,
      data: publicKB,
    });
  } catch (err) {
    console.error('Knowledge GET error:', err.message);
    res.status(500).json({ error: 'Could not read knowledge base' });
  }
});

// ── PUT /api/knowledge ───────────────────────────────────────────
// Update a specific section of the knowledge base.
// Requires admin password.
// Usage:
//   PUT /api/knowledge?section=events
//   Header: x-admin-password: your_password
//   Body: { "name": "New Fest", "date": "..." }  ← replaces events section
//
// Example curl:
//   curl -X PUT http://localhost:3001/api/knowledge?section=timetable \
//     -H "Content-Type: application/json" \
//     -H "x-admin-password: snpsu_admin_2025" \
//     -d '{"CSE_SEM3": {"Monday": ["9:00-DSA", "10:00-OS"]}}'
router.put('/', requireAdmin, (req, res) => {
  try {
    const { section } = req.query;

    if (!section) {
      return res.status(400).json({ error: 'Provide ?section=name in the URL' });
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: 'Request body is empty' });
    }

    const kb = readKB();
    const oldValue = kb[section];
    kb[section] = req.body;
    writeKB(kb);

    console.log(`📚 Knowledge base updated — section: '${section}'`);
    res.json({
      success: true,
      message: `Section '${section}' updated successfully`,
      section,
      previous_keys: oldValue ? Object.keys(oldValue) : null,
      new_keys: Object.keys(req.body),
    });
  } catch (err) {
    console.error('Knowledge PUT error:', err.message);
    res.status(500).json({ error: 'Could not update knowledge base' });
  }
});

// ── POST /api/knowledge/reload ───────────────────────────────────
// Hot-reloads the knowledge base into chat.js memory.
// Call this after uploading PDFs or editing the JSON.
// Requires admin password.
router.post('/reload', requireAdmin, (req, res) => {
  try {
    // Force chat.js to re-read the file on its next request
    // by clearing Node's require cache for the JSON file
    const resolved = require.resolve(KB_PATH);
    if (require.cache[resolved]) {
      delete require.cache[resolved];
    }

    const kb = readKB();
    const sections = Object.keys(kb);

    console.log('🔄 Knowledge base reloaded from disk');
    res.json({
      success: true,
      message: 'Knowledge base reloaded. Chat will use updated data on next message.',
      sections,
      has_pdf_data: !!kb._pdf_data,
    });
  } catch (err) {
    console.error('Knowledge reload error:', err.message);
    res.status(500).json({ error: 'Could not reload knowledge base' });
  }
});

// ── DELETE /api/knowledge ────────────────────────────────────────
// Remove a section from the knowledge base entirely.
// Requires admin password.
// Usage:
//   DELETE /api/knowledge?section=_pdf_data
router.delete('/', requireAdmin, (req, res) => {
  try {
    const { section } = req.query;

    if (!section) {
      return res.status(400).json({ error: 'Provide ?section=name in the URL' });
    }

    const kb = readKB();

    if (!(section in kb)) {
      return res.status(404).json({ error: `Section '${section}' not found` });
    }

    delete kb[section];
    writeKB(kb);

    console.log(`🗑️  Knowledge base section deleted: '${section}'`);
    res.json({
      success: true,
      message: `Section '${section}' deleted`,
      remaining_sections: Object.keys(kb),
    });
  } catch (err) {
    console.error('Knowledge DELETE error:', err.message);
    res.status(500).json({ error: 'Could not delete section' });
  }
});

// ── GET /api/knowledge/sections ─────────────────────────────────
// Returns just the list of top-level section names.
// Useful for the admin panel to know what's in the KB.
router.get('/sections', (req, res) => {
  try {
    const kb = readKB();
    res.json({
      sections: Object.keys(kb),
      pdf_categories: kb._pdf_data ? Object.keys(kb._pdf_data) : [],
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not read knowledge base' });
  }
});

module.exports = router;
