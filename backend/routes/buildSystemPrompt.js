/**
 * buildSystemPrompt.js
 * ─────────────────────────────────────────────────────────────
 * Drop-in replacement for the buildSystemPrompt() function in
 * backend/routes/chat.js
 *
 * Reads BOTH:
 *   1. college_knowledge.json (manual structured data)
 *   2. _pdf_data inside the same JSON (auto-extracted from PDFs)
 *
 * And injects everything into Claude's system prompt so the bot
 * can answer detailed questions from your actual college documents.
 * ─────────────────────────────────────────────────────────────
 * Usage in chat.js:
 *   const { buildSystemPrompt } = require('./buildSystemPrompt');
 */

const fs   = require('fs');
const path = require('path');

const KB_PATH = path.resolve(process.env.KNOWLEDGE_BASE_PATH || './data/college_knowledge.json');

// ── Format PDF section for the prompt ─────────────────────────
function formatPdfSection(category, entries) {
  if (!entries || entries.length === 0) return '';

  const categoryLabel = category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  let out = `\n### ${categoryLabel} (from uploaded PDFs)\n`;

  entries.forEach(entry => {
    out += `\nSource: ${entry._source_file || 'unknown'}\n`;

    // Prefer structured content over raw dump
    if (entry.schedule_details)  out += entry.schedule_details.slice(0, 3000) + '\n';
    else if (entry.schedule)     out += JSON.stringify(entry.schedule, null, 2).slice(0, 3000) + '\n';
    else if (entry.events_list && entry.events_list.length > 0) {
      out += entry.events_list.map(e => `• ${e.name} — ${e.date}`).join('\n') + '\n';
      if (entry.full_content)    out += '\nDetails:\n' + entry.full_content.slice(0, 2000) + '\n';
    }
    else if (entry.fee_items && entry.fee_items.length > 0) {
      out += entry.fee_items.map(f => `• ${f.item}: ₹${f.amount}`).join('\n') + '\n';
      if (entry.full_content)    out += '\nFull fee document:\n' + entry.full_content.slice(0, 2000) + '\n';
    }
    else if (entry.faculty_list && entry.faculty_list.length > 0) {
      out += entry.faculty_list.join(', ') + '\n';
      if (entry.full_content)    out += '\n' + entry.full_content.slice(0, 2000) + '\n';
    }
    else if (entry.full_content) out += entry.full_content.slice(0, 3000) + '\n';
    else if (entry.content)      out += entry.content.slice(0, 3000) + '\n';

    // Tables if present
    if (entry.exam_tables || entry.fee_tables || entry.tables) {
      const tables = entry.exam_tables || entry.fee_tables || entry.tables || [];
      tables.slice(0, 3).forEach(t => {
        out += `\n[Table from page ${t.page}]\n`;
        t.data.forEach(row => {
          out += row.filter(Boolean).join(' | ') + '\n';
        });
      });
    }
  });

  return out;
}

// ── Main builder ───────────────────────────────────────────────
function buildSystemPrompt(studentName) {
  let kb = {};
  try {
    kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
  } catch (e) {
    console.error('⚠️  Could not load knowledge base:', e.message);
  }

  // Separate structured KB from PDF data
  const { _pdf_data, ...manualKB } = kb;

  // ── Build PDF context string ────────────────────────────────
  let pdfContext = '';
  if (_pdf_data && Object.keys(_pdf_data).length > 0) {
    pdfContext = '\n\n## DETAILED INFORMATION FROM OFFICIAL COLLEGE DOCUMENTS (PDFs)\n';
    pdfContext += 'Use these sections to give precise, detailed answers:\n';
    for (const [category, entries] of Object.entries(_pdf_data)) {
      pdfContext += formatPdfSection(category, entries);
    }
  }

  const hasPDFData = pdfContext.length > 100;

  return `You are SNPSU Assistant — the official AI buddy for Sapthagiri NPS University (SNPSU), Bangalore.

Your vibe:
- Talk like a chill Gen-Z college friend who actually knows everything about the campus
- Use casual language — "yo", "ngl", "lowkey", "bet", "fr", "no cap", "dw" etc naturally (don't overdo it)
- Use emojis naturally but don't spam them 😄
- Keep answers SHORT and punchy — no essays, no walls of text
- Use bullet points for lists, keep it scannable
- Be warm, funny, and relatable — like texting a helpful senior
- If you don't know something, be honest: "hmm idk about that tbh, maybe check with the office? 🤷"
- Hype up cool events and opportunities at SNPSU
- Call the student by name when you know it — makes it personal

DON'TS:
- Don't sound like a robot or a corporate FAQ
- Don't write long paragraphs — keep it conversational
- Don't answer non-SNPSU questions — just say "lol that's not really my thing, I'm your campus buddy 😅"
- Never make up facts — if it's not in your knowledge base, say so

Activation phrase: Students can say "Hey Assistant" to activate voice mode.

---

## CORE COLLEGE INFORMATION
${JSON.stringify(manualKB, null, 2)}

---
${pdfContext}

---

## HOW TO ANSWER
1. Check your knowledge base first — use exact data (dates, times, fees, names)
2. Keep replies 2-4 sentences max unless they ask for details
3. Use bullet points for anything with 3+ items
4. Be specific with numbers — don't say "around ₹50k", say "₹48,500"
5. End with something friendly like "need anything else?" or "lmk if you need more! ✌️"
${hasPDFData ? '6. You have PDF docs loaded — use them for accurate detailed answers when asked' : ''}

${studentName ? `You're chatting with: ${studentName}` : ''}`;
}

module.exports = { buildSystemPrompt };
