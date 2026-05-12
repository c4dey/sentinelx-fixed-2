# SentinelX — Deployment Guide

Deploy once, share a URL with your whole team. No terminal needed after setup.

---

## Option A — Railway (Recommended, free tier available)

1. Create a GitHub account → github.com
2. Create a new repo named `sentinelx`, upload all these files to it
3. Create a Railway account → railway.app (sign in with GitHub)
4. Click **New Project** → **Deploy from GitHub repo** → select `sentinelx`
5. Wait ~2 minutes for Railway to deploy
6. Go to **Settings → Networking → Generate Domain**
7. Share the URL (e.g. `sentinelx-production.up.railway.app`) with your team

**Set a secret key** (important):
Railway project → **Variables** tab → add `SX_SECRET` = any long random string

---

## Option B — Render (free, slightly slower)

1. Create account at render.com, connect GitHub
2. New → Web Service → connect your repo
3. Render reads `render.yaml` automatically → Create Web Service
4. Get URL like `sentinelx.onrender.com`

> Free tier sleeps after 15min idle — first load takes ~30s. Paid ($7/mo) keeps it always on.

---

## File structure

```
sentinelx-deploy/
├── server.py           ← Flask backend
├── requirements.txt    ← Python deps
├── Procfile            ← How to start the server
├── railway.json        ← Railway config
├── render.yaml         ← Render config
├── .gitignore
└── frontend/           ← All HTML/CSS/JS
    ├── index.html
    ├── js/
    └── css/
```

---

## Default accounts (change after first login)

| Email | Password | Role |
|-------|----------|------|
| admin@sentinelx.com | admin123 | Admin |
| analyst@sentinelx.com | analyst123 | Analyst |
| viewer@sentinelx.com | viewer123 | Viewer |

---

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `SX_SECRET` | JWT signing secret | `sentinelx-dev-secret-change-in-prod` |
| `SX_DB_PATH` | Database file path | `./sentinelx.db` |
| `PORT` | Port (set by Railway/Render automatically) | `5000` |

---

## Running locally (if needed)

```bash
pip install flask PyJWT gunicorn
python3 server.py
# → open http://localhost:5000
```
