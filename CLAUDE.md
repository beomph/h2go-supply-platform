# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

H2GO is a hydrogen trading/supply chain platform. It consists of a Python HTTP server (backend), vanilla JS/HTML/CSS (frontend), Supabase (auth + database), and an OpenAI-powered chatbot.

## Commands

### Local Development (Windows PowerShell)

Set environment variables before running:
```powershell
$env:OPENAI_API_KEY="your_key_here"
$env:H2GO_SUPABASE_URL="https://xxxx.supabase.co"
$env:H2GO_SUPABASE_ANON_KEY="sb_anon_key_here"
$env:H2GO_CHAT_ACCESS_CODE="optional_access_code"  # optional
```

Install Python dependencies:
```bash
python -m pip install -r requirements.txt
```

Run the server (serves on http://127.0.0.1:3000/):
```bash
python openai_test_server.py
```

Test Supabase connection:
```bash
npm run supabase:ping
```

### Utility Scripts

```bash
npm run figma-mcp:socket     # Start Figma MCP WebSocket bridge (port 3055)
npm run naver-mail            # Send email via Naver SMTP
python scripts/parse_prd_openai.py       # Parse PRD into tasks
python scripts/generate_sample_data.py  # Generate test data
```

## Architecture

### Request Flow

```
Browser (index.html / dashboard.html)
  → GET /h2go-config.js        # Server injects Supabase URL + anon key at runtime
  → Supabase Auth (signup/login via @supabase/supabase-js)
  → Dashboard loads
  → POST /api/chat             # Chatbot requests (OpenAI key never sent to browser)
```

### Backend: `openai_test_server.py`

Single Python file serving as the entire backend:
- Serves all static files (HTML/JS/CSS)
- `GET /h2go-config.js` — dynamically injects Supabase config from env vars
- `POST /api/chat` and `POST /api/respond` — proxies to OpenAI ChatCompletion with per-IP rate limiting (default: 12 req/60 sec, controlled by `H2GO_RATE_WINDOW_SEC` / `H2GO_RATE_MAX`)
- `GET /api/health`, `GET /api/verify` — health check and access code verification

### Frontend Files

| File | Purpose |
|------|---------|
| `index.html` + `script.js` + `styles.css` | Landing page, login/registration, Supabase auth |
| `dashboard.html` + `dashboard.js` + `dashboard.css` | Main app UI — order management, role switching |
| `chatbot.js` | Chat widget, calls `/api/chat`, session-based access code |
| `transport-assets.html/js/css` | Transport vehicle tracking with Leaflet.js maps |
| `figma-tokens.css` | CSS design tokens (sourced from Figma) |

### Database (Supabase)

Key tables:
- `auth.users` — Supabase built-in auth
- `member_profiles` — Extended user info: `business_parties`, `authority` (admin/manager/monitoring), `login_id`, `username`
- `h2go_orders` — Full order lifecycle with change history, T/T numbers, delivery confirmation
- `h2go_transport_assets` — Transport vehicle/asset registry

Setup scripts are in `scripts/supabase_*.sql`.

### User Roles

Two primary business roles (set at registration, switchable):
- **Supplier** (`판매` mode) — manages sales, registers in supplier directory
- **Consumer** (`구매` mode) — places orders, views supplier directory
- **Transporter** — purchase mode only

Authority levels: admin / manager / monitoring

### Deployment (Render)

Config in `render.yaml`. Build: `pip install -r requirements.txt`. Start: `python openai_test_server.py`. All secrets are set as Render env vars (never in code).

## Cursor Rules (from `.cursor/rules/`)

- **git-push-default**: Always commit and push to `origin/main` after changes. Set git config at repo scope if needed.
- **prd-auto-update**: Update `.taskmaster/docs/prd.txt` after any code changes. Format: 3–7 line summaries with WHAT/WHY/WHO-WHERE. No secrets in PRD.
- **figma-mcp**: Use TalkToFigma MCP via WebSocket on port 3055. Call `/join_channel` before any Figma commands.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
