# STUDYTECH.AI

AI study app for developers: code tutor (syntax-highlighted code, debug / review / interview modes), coding Practice with AI code review, Flashcards, Quizzes, Mock Tests, Revision sheets, Planner, XP/streaks.

No Node.js? Just open `StudyTech.html` in Chrome or Edge and paste your Gemini key when asked.

## Run it (Windows)

1. Install Node.js 20+ from nodejs.org.
2. In this folder, copy `.env.example` to `.env` and paste your Gemini API key
   (get one at aistudio.google.com/apikey):
   ```bat
   copy .env.example .env
   notepad .env
   ```
3. Start:
   ```bat
   npm install
   npm run dev
   ```
4. Open http://localhost:5173

The key lives only in `.env`, on the server side. The browser talks to `/api/chat`, never to the AI provider directly.

## Publish it (key stays hidden)

Publish the Node version, NOT `StudyTech.html` (that file asks each visitor for their own key).
The server holds your Gemini key, and visitors must sign in before the AI answers.

Works on Render, Railway, Fly.io or any host that runs Node:

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment variables (set in the host's dashboard, never in the code):
  - `GEMINI_API_KEY` = your key
  - `SESSION_SECRET` = a long random string (see `.env.example`)
  - `NODE_ENV` = `production`
  - `ALLOWED_EMAILS` = optional, comma-separated invite list (recommended, so strangers can't use your quota)
  - `DATA_DIR` = a persistent disk path so accounts survive redeploys

Test the production build locally: `npm run build` then `npm start`, open http://localhost:3000.

Accounts are stored in `data/users.json` (passwords are hashed with scrypt). Many free hosts wipe the disk on
redeploy, so attach a persistent disk or move users to a database before real use.

## Built-in firewall (server/firewall.js)
- Security headers (CSP, no framing, no sniffing) in production.
- Blocks scanners probing for `.env`, `.git`, `wp-admin`, `.php` and similar, and bans repeat offenders for 30 minutes.
- Rate limits per IP, a cap on password guesses, and automatic temporary bans for abusers.
- Rejects cross-site POSTs and oversized requests.
- Optional `.env` settings: `BLOCKED_IPS`, `ALLOWED_IPS`, `TRUST_PROXY`, `FIREWALL_CSP=off`.
- This protects the app. Also keep Windows Firewall on locally, and use your host's network protection when published.

## Notes
- Accounts, chat history and progress are saved on the server in `data/` (`users.json` and `userdata/<id>.json`). Back this folder up, and on a host set `DATA_DIR` to a persistent disk.
- Progress (XP, streak, achievements) is saved in the browser's localStorage.
- Default model is `gemini-3.7-flash`; change it with `GEMINI_MODEL` in `.env`.
- To use Anthropic instead, set `ANTHROPIC_API_KEY` and leave `GEMINI_API_KEY` out.
