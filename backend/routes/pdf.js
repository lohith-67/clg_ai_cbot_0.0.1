/**
 * PDF Upload & Ingestion Route
 * POST /api/pdf/upload   — Upload one or more PDFs
 * GET  /api/pdf/status   — List all processed PDFs
 * POST /api/pdf/reindex  — Re-run full ingestion on all uploaded PDFs
 */

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { exec } = require('child_process');

// ── Platform-aware Python command ─────────────────────────────
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

// ── Admin password check middleware ──────────────────────────
function requireAdmin(req, res, next) {
  const pwd = req.headers['x-admin-password'] || req.query.password;
  if (pwd !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Unauthorized. Provide x-admin-password header or ?password= query.' });
  }
  next();
}

// ── Storage config ─────────────────────────────────────────────
const UPLOADS_DIR   = path.resolve(__dirname, '../../uploads');
const PROCESSED_DIR = path.resolve(__dirname, '../../processed');
const INGEST_SCRIPT = path.resolve(__dirname, '../../scripts/ingest_pdfs.py');

[UPLOADS_DIR, PROCESSED_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    // Keep original name but sanitize spaces
    const safe = file.originalname.replace(/\s+/g, '_');
    cb(null, safe);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB per file
});

// ── POST /api/pdf/upload ───────────────────────────────────────
router.post('/upload', requireAdmin, upload.array('pdfs', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No PDF files uploaded' });
  }

  const uploaded = req.files.map(f => f.originalname);
  console.log(`📄 Uploaded: ${uploaded.join(', ')}`);

  // Run ingestion script for each uploaded file
  const results = [];
  let pending = req.files.length;

  req.files.forEach(file => {
    const cmd = `${PYTHON} "${INGEST_SCRIPT}" --file "${file.path}"`;
    exec(cmd, { timeout: 120000 }, (err, stdout, stderr) => {
      results.push({
        file: file.originalname,
        success: !err,
        output: stdout || stderr || '',
        error: err ? err.message : null
      });

      pending--;
      if (pending === 0) {
        res.json({
          message: `Processed ${req.files.length} PDF(s)`,
          results
        });
      }
    });
  });
});

// ── GET /api/pdf/status ────────────────────────────────────────
router.get('/status', (req, res) => {
  try {
    const pdfs = fs.readdirSync(UPLOADS_DIR)
      .filter(f => f.toLowerCase().endsWith('.pdf'))
      .map(f => {
        const stat = fs.statSync(path.join(UPLOADS_DIR, f));
        const processedName = f.replace('.pdf', '_extracted.txt').replace('.PDF', '_extracted.txt');
        const isProcessed = fs.existsSync(path.join(PROCESSED_DIR, processedName));
        return {
          filename: f,
          size_kb: Math.round(stat.size / 1024),
          uploaded_at: stat.mtime.toISOString(),
          processed: isProcessed
        };
      });

    res.json({ count: pdfs.length, pdfs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/pdf/:filename ─────────────────────────────────
router.delete('/:filename', requireAdmin, (req, res) => {
  try {
    const safe = path.basename(req.params.filename);
    const filePath = path.join(UPLOADS_DIR, safe);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    // Also delete processed text
    const processedPath = path.join(PROCESSED_DIR, safe.replace(/\.pdf$/i, '_extracted.txt'));
    if (fs.existsSync(processedPath)) fs.unlinkSync(processedPath);

    // Remove from knowledge base
    const kbPath = path.resolve(__dirname, '../data/college_knowledge.json');
    if (fs.existsSync(kbPath)) {
      const kb = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
      if (kb._pdf_data) {
        for (const category in kb._pdf_data) {
          kb._pdf_data[category] = kb._pdf_data[category].filter(
            d => d._source_file !== safe
          );
        }
        fs.writeFileSync(kbPath, JSON.stringify(kb, null, 2));
      }
    }

    res.json({ success: true, message: `Deleted ${safe}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/pdf/reindex ──────────────────────────────────────
router.post('/reindex', requireAdmin, (req, res) => {
  const cmd = `${PYTHON} "${INGEST_SCRIPT}" --uploads-dir "${UPLOADS_DIR}"`;
  exec(cmd, { timeout: 300000 }, (err, stdout, stderr) => {
    res.json({
      success: !err,
      output: stdout || stderr,
      error: err ? err.message : null
    });
  });
});

module.exports = router;
