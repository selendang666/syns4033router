# FITUR — SYNS4033Router (fork syns4033router-jb)

> Kesimpulan fitur dari repo ini, dirangkum langsung dari struktur kode (`backend/`, `frontend/`, `skills/`, `open-sse/`) — bukan dari klaim dokumentasi vendor.

**SYNS4033Router** = AI gateway self-hosted, satu endpoint OpenAI-compatible → banyak provider, dengan routing/fallback otomatis. Monorepo: `backend` (Express + open-sse), `frontend` (Vite + React dashboard), `skills` (agent SKILL.md).

---

## 1. API Surface (OpenAI-compatible REST)

Endpoint utama di-mount lewat `autoRouter` (scan `src/routes/**/route.ts` → `GET/POST ... /api/...` lalu di-remap ke `/v1`). Kategori route:

- **Chat**: `v1/chat/completions` + Responses API handler (`responsesHandler.js`, `chatCore`)
- **Images**: `imageGenerationCore.js` — param def di `config/imageParamDefs.js`
- **Audio**: STT (`sttCore.js`), TTS (`tts.js`), video generation (`videoGeneration.js`)
- **Embeddings**: `embeddingsCore.js` + `embeddingProviders`
- **Web search & fetch**: `search.js`, `fetch.js`
- Lainnya: `health`, `keys`, `models`, `pricing`, `usage`, `version`, `translator`, `tags`, `combos`, `locale`, `init`, `shutdown`, `provider-nodes`, `proxy-pools`, `media-providers`, `media-proxy`, `mcp`, `cli-tools`

**Total 80+ provider/model alias** di `config/providerModels.js`, termasuk (sample):
- Chat/LLM: `openai, anthropic, gemini, claude(code), codex, deepseek, qwen, openrouter, glm, kimi, minimax, blackbox, groq, xai, mistral, perplexity, together, fireworks, cerebras, cohere, nvidia, nebius, siliconflow, hyperbolic, ollama, vertex, grok-web, sambanova, deepinfra, baseten, nous-research, glhf, llm7, lepton, kluster, ai21, predibase`, dll.
- Image gen: `sdwebui, comfyui, stability-ai, black-forest-labs, recraft, runwayml, leonardo, fal-ai, huggingface, weavy`
- TTS: `openai-tts, openrouter-tts, elevenlabs-tts, edge-tts, google-tts, gemini-tts`
- STT: `deepgram, assemblyai`
- Self-hosted: `ollama`, `local-device`

---

## 2. Routing & Provider Engineering

- **Translate layer (`open-sse/translator`)**: konversi antar format request/response (Claude ⇄ OpenAI ⇄ Gemini ⇄ Responses ⇄ Antigravity ⇄ Codex) — `detectFormat`, `translateRequest`, `translateResponse`, `FORMATS`.
- **Streaming SSE**: `utils/stream.js` — transform stream dengan usage tracking, error parsing, Responses API framing, abort/finish handling (`streamHandler.js`, `pipeWithDisconnect`, stall timeout).
- **Multi-provider routing & fallback**: load balancing, key rotation, failover antar connection (`providers`, `v1`, `models`).
- **Passthrough native lossless**: CLI tool ↔ provider sama ekosistem → skip translate, cuma swap model + Bearer (`clientDetector.js`, `isNativePassthrough`).
- **Provider-level thinking override**: `providerThinking` → inject `reasoning_effort` / `thinking.budget_tokens` (`defaultThinkingSignature.js`).
- **Tool dedupe & strip**: `toolDeduper.js` (dup tools SARA), `getModelStrip` per model.
- **Auth credit manager**: `oauthCredentialManager.js`, token refresh, proxy pool per connection (SOCKS/vercel-relay) di `services/tokenRefresh.js`.

---

## 3. Dashboard (frontend/)

Vite + React. Halaman: `landing`, `login`, `basic-chat`, `providers`, `proxy-pools`, `combos`, `cli-tools`, `automation`, `mitm`, `media-providers`, `usage`, `quota`, `translator`, `skills`, `docs`, `endpoint`, `console-log`, `profile`, `callback`.

Autentikasi: `password` (bcrypt) **dan** `OIDC` (`routes/auth/oidc/*`).

---

## 4. Persistence

- **SQLite** (better-sqlite3, sql.js) atau **PostgreSQL** (pg) — dipilih otomatis via `DATABASE_URL` (`lib/db/driver.js`, `adapters/`).
- Repositori per domain: `connectionsRepo, nodesRepo, proxyPoolsRepo, combosRepo, apiKeysRepo, pricingRepo, usageRepo, requestDetailsRepo, settingsRepo, aliasRepo, disabledModelsRepo, automationRepo`.
- Migration + backup (`migrate.js`, `backup.js`), `localDb.js` shim → layer SQLite baru.

---

## 5. Automation (browser ops)

- **Cloudflare Workers AI signup** (`automation/cloudflare_signup.py`, `cf_token_via_session.py`) — Playwright + CAPTCHA provider + temp email + proxy pool.
- **Ammail** (temp email) — `routes/automation/ammail/*` (OTP inbox + webhook).
- **Codebuddy** — route + test-proxy + debug-vnc.
- **Leonardo, Cloudflare-ai** route.
- **Health scanner** (`automation/scanner.js` + `routes/automation/scanner`) — probe `/v1/health` per connection, update `testStatus/lastTested/lastError`; GET baca settings, POST terima urls.

---

## 6. MITM (middlebox untuk CLI/model IDE)

`backend/src/mitm/` — proxy lokal dengan cert install untuk agent/IDE:
- `handlers/`: **antigravity, copilot, cursor, kiro, codebuddy(?) via base**
- DNS config, cert install, db reader, winElevated, anti version intercept (`antigravityIdeVersion.js`)
- `routes/mitm` di dashboard.

---

## 7. Agent Skills (skills/)

SKILL.md bawaan untuk agent: `syns4033router` (chat, embeddings, image, stt, tts, web-search, web-fetch), `multi-brain`, `using-superpowers`.

---

## 8. Fitur GODMODE (baru, commit `d4a0889`)

- **Jailbreak injection** (`src/middleware/jailbreak.js`) — inject system prompt sebelum translate, shape-aware (`messages`/`input`/`contents`). Env: `GODMODE_JB`.
- **Watermark SSE** (`open-sse/transformer/watermark.js`) — tambah `data:{watermark}` sebelum `[DONE]`, chunk-boundary-safe. Env: `GODMODE_WM` (+ `GODMODE_WM_TEXT`).
- **Health scanner** — lihat §5.

---

## 9. Deployment

Docker (`Dockerfile`, `.dockerignore`), Heroku (`Procfile`), Railway (`railway.toml`), VPS (nginx.conf, `docs/deployment-linux.md`), `fix-router.js`.

---

## Catatan status

- `npm run typecheck` (backend + frontend) **pass** (exit 0).
- `npm run build` penuh **belum** diverifikasi di mesin ini — `better-sqlite3` native butuh node-gyp build yang gagal karena setup Python host; `npm i --ignore-scripts` + typecheck jalan.
