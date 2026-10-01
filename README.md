# SYNS4033Router

> A self-hosted AI gateway: one endpoint, many providers, automatic fallback.

**SYNS4033Router** is a downstream fork maintained by **codestorm**, focused on portable deployment, persistent storage, secure configuration, and a more reliable dashboard experience.

The project lineage is:

1. [selendang666/syns4033router](https://github.com/selendang666/syns4033router) — the original SYNS4033Router project, routing engine, and provider integrations.
2. [selendang666/syns4033router](https://github.com/selendang666/syns4033router) — the Express backend and Vite + React frontend rewrite.
3. **SYNS4033Router by codestorm** — a continuation that packages the V2 architecture for local machines, Docker, VPS platforms, and supported PaaS environments.

The GitHub repository is still named `syns4033router` to preserve the fork URL and Git history, while the product, interface, metadata, and documentation use the **SYNS4033Router** name.

---

## SYNS4033Router vs V2 vs V3

| Capability | Original SYNS4033Router | SYNS4033Router V2 | SYNS4033Router |
|---|:---:|:---:|:---:|
| OpenAI-compatible API | ✅ | ✅ | ✅ |
| Multi-provider routing and fallback | ✅ | ✅ | ✅ |
| Separate backend and frontend | ❌ | ✅ | ✅ |
| Express backend with a Vite/React dashboard | ❌ | ✅ | ✅ |
| Multi-stage production Docker image | ❌ | ❌ | ✅ |
| API and dashboard in one service | ❌ | ❌ | ✅ |
| Local development workflow | ✅ | ✅ | ✅ |
| Docker deployment | ❌ | ❌ | ✅ |
| VPS deployment guide | ❌ | ✅ | ✅ |
| Heroku `Procfile` support | ❌ | ❌ | ✅ |
| Configurable persistent data directory | ❌ | ✅ | ✅ |
| Railway deployment configuration | ❌ | ❌ | ✅ |
| Self-hosted Material Symbols | ❌ | ❌ | ✅ |
| API-key dialog with loading and error feedback | ❌ | ❌ | ✅ |
| V3 branding, logo, and login experience | ❌ | ❌ | ✅ |
| PayPal donation QR on the login page | ❌ | ❌ | ✅ |
| Generated browser profiles excluded from Git | ❌ | ❌ | ✅ |

V3 does not claim authorship of the routing engine or provider integrations. Those remain upstream work; V3 focuses on packaging, deployment, reliability, and user experience.

---

## Features

- **OpenAI-compatible REST API** for chat, image generation, audio, embeddings, web search, and related endpoints.
- **Multi-provider routing** with load balancing, fallback, and key rotation.
- **Modern dashboard** for providers, connections, proxy pools, CLI tools, automation, usage, and security settings.
- **Password and OIDC authentication** for dashboard access.
- **SQLite or PostgreSQL persistence**, selected automatically through `DATABASE_URL`.
- **Cloudflare Workers AI automation** with Playwright, CAPTCHA providers, and temporary email.
- **Agent Skills** for Claude, Gemini, Codex, and other coding agents.
- **Portable deployment** for local machines, Docker, Railway, Heroku, and Linux VPS hosts.

---

## Architecture

```text
syns4033router/
├── backend/
│   └── src/
│       ├── routes/       # API and auto-routed endpoints
│       ├── lib/db/       # SQLite/PostgreSQL repositories and adapters
│       └── automation/   # Browser automation
├── frontend/
│   ├── public/branding/  # V3 logo and favicon
│   └── src/              # Vite + React dashboard
├── skills/               # Agent SKILL.md files
├── Dockerfile
├── Procfile
└── railway.toml
```

---

## Deployment Options

### Common Environment Variables

Start from [`backend/.env.example`](./backend/.env.example). The main runtime variables are:

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs dashboard sessions |
| `INITIAL_PASSWORD` | Initial dashboard password; required until a password is stored |
| `API_KEY_SECRET` | Signs generated API keys |
| `DATABASE_URL` | Optional PostgreSQL connection string; when set, PostgreSQL replaces SQLite |
| `DATA_DIR` | Stores SQLite data, logs, and runtime files; still used for non-database runtime files with PostgreSQL |
| `NODE_ENV` | Use `production` outside local development |
| `PORT` | HTTP port; most PaaS providers inject this automatically |

Never commit real secrets.

### Run Locally

Requirements:

- Node.js 20+
- Python 3.10+ for automation features
- Chromium or Camoufox for browser automation

Install:

```bash
git clone https://github.com/selendang666/syns4033router.git syns4033router
cd syns4033router
npm install
cp backend/.env.example backend/.env
```

Replace PaaS expressions such as `${{secret(32)}}` with normal random secrets in `backend/.env`.

Development commands:

```bash
npm run dev       # Backend and frontend with development servers
npm run backend   # Backend only
npm run frontend  # Frontend only
```

Local production mode:

```bash
npm run build
npm start
```

The production server listens on `PORT` and serves both the API and built frontend.

### Run with Docker

Build and start the image:

```bash
docker build -t syns4033router .
docker run --rm -p 3001:3001 \
  -e PORT=3001 \
  -e NODE_ENV=production \
  -e DATA_DIR=/data \
  -e JWT_SECRET=replace-with-a-random-secret \
  -e INITIAL_PASSWORD=replace-with-a-secure-password \
  -e API_KEY_SECRET=replace-with-a-random-secret \
  -v syns4033router-data:/data \
  syns4033router
```

Open `http://localhost:3001`.

### Deploy to a VPS

This works on providers such as **Hetzner, Contabo, DigitalOcean, Linode, Vultr, AWS EC2**, or any Debian/Ubuntu server.

Recommended options:

- Run the Docker image behind Nginx or Caddy.
- Run Node.js directly with systemd and Nginx.
- Store `DATA_DIR` on a persistent disk.
- Add TLS through Caddy, Certbot, or Cloudflare.

See the complete [`Linux deployment guide`](./docs/deployment-linux.md) for systemd, Nginx, backups, updates, and troubleshooting.

### Deploy to Heroku

The included [`Procfile`](./Procfile) starts the production server, while `heroku-postbuild` compiles the frontend and backend.

```bash
heroku create your-syns4033router
heroku config:set \
  NODE_ENV=production \
  JWT_SECRET=replace-with-a-random-secret \
  INITIAL_PASSWORD=replace-with-a-secure-password \
  API_KEY_SECRET=replace-with-a-random-secret \
  DATA_DIR=/tmp/syns4033router
git push heroku main
```

Heroku injects `PORT` automatically.

> Heroku's dyno filesystem is ephemeral. Set `DATABASE_URL` to a managed PostgreSQL database for persistent application data, or use Heroku only for testing with SQLite.

### Deploy to Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/syns4033router?referralCode=asepsp&utm_medium=integration&utm_source=template&utm_campaign=generic)

**OR**

1. Create a service from this repository.
2. Copy variables from `backend/.env.example` into the **Variables** tab.
3. Add a Railway PostgreSQL service and expose its `DATABASE_URL` to SYNS4033Router, or attach a Railway Volume at `/data` to keep using SQLite.
4. Generate a public domain under **Settings → Networking**.

Railway builds the included Dockerfile. It supplies `RAILWAY_PUBLIC_DOMAIN`, `RAILWAY_PRIVATE_DOMAIN`, and `PORT` automatically. The Dockerfile intentionally omits the unsupported Docker `VOLUME` instruction.

### Switching Between SQLite and PostgreSQL

- Without `DATABASE_URL`, SYNS4033Router uses SQLite at `DATA_DIR/db/data.sqlite`.
- With a non-empty `DATABASE_URL`, SYNS4033Router initializes and uses PostgreSQL.
- SQLite and PostgreSQL are separate data stores. Before switching an existing installation, export the database from the dashboard, set or remove `DATABASE_URL`, restart, then import the exported data.

---

## Main API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Health check |
| `GET /v1/models` | List models |
| `POST /v1/chat/completions` | Chat completions |
| `POST /v1/images/generations` | Image generation |
| `POST /v1/audio/speech` | Text-to-speech |
| `POST /v1/audio/transcriptions` | Speech-to-text |
| `POST /v1/embeddings` | Embeddings |
| `GET /v1/search` | Web search |

---

## Agent Skills

Start with the entry skill:

```text
https://raw.githubusercontent.com/selendang666/syns4033router/refs/heads/master/skills/syns4033router/SKILL.md
```

Additional skills are available in [`skills/`](./skills/).

---

## Donate

If this fork helps your work, you can support it through:

[PayPal — paypal.me/selaris](https://www.paypal.com/paypalme/selaris)

---

## License and Attribution

This project is licensed under the MIT License. See [`LICENSE`](./LICENSE).

Thanks to:

- [selendang666/syns4033router](https://github.com/selendang666/syns4033router) for the original project, routing logic, and provider integrations.
- [selendang666/syns4033router](https://github.com/selendang666/syns4033router) for the V2 rewrite and Express + Vite/React architecture.
- **codestorm** as the creator and maintainer of the **SYNS4033Router** continuation.

Upstream copyright notices remain intact out of respect for the original authors and in compliance with the license.
