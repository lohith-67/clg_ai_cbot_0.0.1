# 🎓 SNPSU AI Chatbot — Complete Setup Guide

## 📁 Project Structure

```
snpsu-chatbot/
├── backend/
│   ├── server.js                  ← Main Express server
│   ├── supabase.js                ← All database functions
│   ├── supabase_schema.sql        ← Run once in Supabase to create tables
│   ├── package.json
│   ├── .env.example               ← Copy to .env and fill in your keys
│   ├── data/
│   │   └── college_knowledge.json ← ⭐ YOUR COLLEGE DATA GOES HERE
│   └── routes/
│       ├── chat.js                ← AI chat logic (Groq API)
│       ├── voice.js               ← Voice logging
│       └── knowledge.js           ← Update college data via API
├── forntend/
│   ├── chatbot-widget.html        ← ⭐ The complete chatbot UI
│   └── embed-snippet.html         ← Paste into college website
└── README.md
```

---

## 🚀 STEP 1 — Set Up Supabase (Free)

1. Go to https://supabase.com → Sign up for free
2. Click **"New Project"**
   - Name: `snpsu-chatbot`
   - Database password: (save this somewhere)
   - Region: South Asia (ap-south-1)
3. Wait ~2 min for project to be ready
4. Go to **SQL Editor** (left sidebar)
5. Paste the entire contents of `backend/supabase_schema.sql` → Click **Run**
6. You should see 3 new tables: `students`, `chat_messages`, `voice_transcripts`
7. Get your keys from **Settings → API**:
   - `URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

---

## 🤖 STEP 2 — Get Groq API Key

1. Go to https://console.groq.com → Sign up
2. Go to **API Keys** → **Create API Key**
3. Copy the key → `GROQ_API_KEY`

---

## ⚙️ STEP 3 — Configure Environment

```bash
cd backend
# Create a new .env file here
```

Open `.env` and fill in:
```
GROQ_API_KEY=gsk_your_key...
GROQ_MODEL=llama-3.3-70b-versatile
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
PORT=3001
FRONTEND_URL=*
KNOWLEDGE_BASE_PATH=./data/college_knowledge.json
ADMIN_PASSWORD=your_secure_password
```

---

## 🛠️ STEP 4 — Run the Backend

```bash
cd backend
npm install
npm start
```

You should see:
```
🎓 SNPSU Chatbot Backend running on port 3001
📡 Health: http://localhost:3001/health
✅ Knowledge base loaded
```

Test it: Open http://localhost:3001/health in browser.

---

## 🌐 STEP 5 — Run the Frontend

The chatbot is a single HTML file. Open `forntend/chatbot-widget.html` in a browser.

**For local testing:**
```bash
cd forntend
npx serve .     # or just double-click the HTML file
```

**Important:** In `chatbot-widget.html`, make sure this line matches your backend:
```javascript
const API_BASE = 'http://localhost:3001/api';
```

---

## 🏫 STEP 6 — Embed on College Website

Add this one line before `</body>` on your college website:

```html
<script>
  (function() {
    var iframe = document.createElement('iframe');
    iframe.src = 'https://YOUR-DOMAIN.com/chatbot-widget.html';
    iframe.style.cssText = 'position:fixed;bottom:0;right:0;width:480px;height:700px;border:none;z-index:99999;background:transparent;';
    iframe.setAttribute('allow', 'microphone');
    document.body.appendChild(iframe);
  })();
</script>
```

Replace `YOUR-DOMAIN.com` with where you host the widget HTML.

---

## ☁️ STEP 7 — Deploy to Production

### Backend (Render.com — Free)
1. Push code to GitHub
2. Go to https://render.com → New Web Service
3. Connect your repo
4. Set environment variables (from your .env)
5. Start command: `node server.js`
6. Render gives you a URL like `https://snpsu-chatbot.onrender.com`

### Frontend (Netlify — Free)
1. Drag the `forntend/` folder to https://netlify.com/drop
2. Get URL like `https://snpsu-chatbot.netlify.app`
3. Update `API_BASE` in `chatbot-widget.html` to your Render backend URL

---

## 📚 STEP 8 — Add Your College Data (MOST IMPORTANT)

Open `backend/data/college_knowledge.json` and replace placeholder data with real info:

### What to add:
| Section | What to put |
|---------|-------------|
| `timetable` | Add each semester's timetable by day |
| `events` | Add upcoming fests, seminars, workshops |
| `departments` | Real HOD names, emails |
| `fee_structure` | Actual fee amounts |
| `exam_rules` | Your university's pass criteria |
| `placement` | Real companies, packages |
| `faq` | Common questions students ask |

### You can also update via API (without restarting):
```bash
# Update just the timetable section
curl -X PUT http://localhost:3001/api/knowledge?section=timetable \
  -H "Content-Type: application/json" \
  -d '{"CSE_SEM3": {"Monday": ["9:00-DSA", "10:00-OS"]}}'
```

---

## 🎙️ Voice Features

| Feature | How it works |
|---------|-------------|
| **Say "Hey Assistant"** | Background listener activates the bot |
| **Mic button** | Click to speak your question |
| **Voice mode toggle** | Bot speaks its replies aloud |
| **Language** | Set to `en-IN` (Indian English) |

> Note: Voice uses Chrome's built-in Web Speech API. Works best in Chrome/Edge.

---

## 🔒 Security Notes

- The `service_role` key is server-side only (in `.env`, never in frontend code)
- Rate limiting is on: 30 msgs/min per IP
- The chatbot only answers SNPSU-related questions (system prompt enforced)

---

## 📞 Support

Built for Sapthagiri NPS University. For questions about customization, contact your developer.
