# Changelog

Semua entri di bawah sudah diverifikasi: `npm run typecheck` (0 error),
`npm run build` (exit 0), `hermes verify` 9/9 phase `ok: true`, dan
`scripts/verify-inject-jailbreak.mjs` 13/13 pass.

Baris `[test]` = unit test yang memblokir regresi.
Baris `[live]` = dibuktikan lewat request HTTP nyata ke production.

---

## Fixed

### Jailbreak / system prompt

- ✅ Claude `body.system` ditangani — dispatch `system` diperiksa **sebelum**
      `messages`, karena request Claude membawa keduanya dan kalau `messages`
      menang duluan prompt tidak pernah sampai ke slot yang dibaca Claude
      — `backend/src/middleware/jailbreak.js:83` · `[test]`
- ✅ Gemini `system_instruction` / `systemInstruction` ditangani
      — `backend/src/middleware/jailbreak.js:87` · `[test]`
- ✅ Antigravity request-wrapper ditangani — `body.request` yang membungkus
      seluruh payload Gemini jatuh di semua branch sebelumnya, jadi prompt
      dibuang total untuk provider itu
      — `backend/src/middleware/jailbreak.js:95` · `[test]`
- ✅ Idempotensi marker — marker dicek sebelum append di 4 titik
      (`prependSystem`, `prependClaudeSystem` string + array,
      `prependGeminiSystem`), jadi retry tidak menumpuk prompt
      — `backend/src/middleware/jailbreak.js:27,44,59` · `[test]`
- ✅ Claude `system` string kosong tidak lagi menghasilkan newline di depan
      — `backend/src/middleware/jailbreak.js:44` · `[test]`

### Route mati total (500 untuk semua request)

- ✅ `/v1/responses` — `handleChat(request)` memakai identifier yang tidak pernah
      ada di scope; handler hanya menerima `(req, res)`
- ✅ `/v1/api/chat` — `request.clone()`, pola yang sama
- ✅ `/v1/responses/compact` — `request.headers`
- ✅ `/v1beta/models/*` (Gemini) — `request.headers`, plus `new Request(req.url)`
      yang tidak valid karena `req.url` adalah path, bukan URL absolut
- ✅ `/auth/oidc/start`, `/auth/oidc/test`, `/auth/oidc/callback` —
      `getPublicOrigin(request)` 11×

  Semua di `backend/src/routes/`. Ditemukan lewat static sweep 140 route file.
  · `[test]`

### Auth

- ✅ `/API/keys` dan variasi kapitalisasi lain tidak lagi melewati guard —
      path dinormalisasi sebelum dicocokkan
      — `backend/src/middleware/auth.ts:72`, `backend/src/server.ts:49`
- ✅ `PATCH /api/settings` tidak lagi bisa mematikan auth permanen lewat
      `requireLogin: false`
      — `backend/src/routes/settings/route.ts` · `[test]`
- ✅ `/v1/*` sekarang **fail closed**: `requireApiKey` default `true`, jadi
      gateway publik bukan open relay setelah satu credential dipasang
      — `backend/src/lib/db/repos/settingsRepo.js:23` · `[test]` · `[live]`
- ✅ Regression guard ditambahkan sebagai gate permanen:
      `scripts/guard-secure-defaults.mjs`, `scripts/guard-auth-path.mjs`

### Ollama shim

- ✅ `POST /v1/api/chat` membalas `200` dengan stream kosong untuk **setiap**
      kegagalan. `transformToOllama` membangun `Response` tanpa `status`
      (default 200) dan meneruskan body error — yang JSON, bukan SSE — lewat
      transform yang hanya membaca baris `data:`, sehingga hilang dan flushing
      `done: true` kosong. Semua penolakan tampak seperti jawaban sukses.
      Sekarang status ≥ 400 dipertahankan dan alasannya dikembalikan di field
      `error` — `backend/open-sse/utils/ollamaTransform.js:88` · `[live]`
      ```
      200 empty -> 401 {"error":"upstream returned 401"}
      200 empty -> 404 {"error":"upstream returned 404"}
      ```

### SSRF

- ✅ Body `#hex` malformed sebelumnya membuat `ssrfGuard` melempar, dan blok
      `catch` menelannya diam-diam lalu melaporkan "aman" — kelemahan keamanan
      yang dilaporkan sebagai keberhasilan
      — `backend/src/routes/provider-nodes/validate/route.ts:3`

### Media / dashboard

- ✅ Quota Tracker tidak lagi menyembunyikan koneksi yang tidak mendukung
      quota — semua koneksi tampil dengan alasan, bukan angka palsu
      — `backend/src/routes/providers/client/route.ts` · `[test]`
- ✅ `/v1/audio/transcriptions` menolak body non-multipart dengan `400`
      alih-alih crash `TypeError` — `backend/src/routes/v1/audio/transcriptions/route.ts`
- ✅ `/v1/audio/voices` memakai loopback, bukan origin turunan dari header
      Railway — `backend/src/routes/v1/audio/voices/route.ts` · `[live]`
- ✅ Res-variable shadowing di Kilo free-models dan 3 TTS voices route
      — `backend/src/routes/providers/kilo/free-models/route.ts`,
        `backend/src/routes/media-providers/tts/{deepgram,inworld,minimax}/voices/route.ts`
- ✅ 6 dynamic import ESM tanpa ekstensi `.js` — backend gagal boot
      — `backend/src/`
- ✅ SSE watermark crash: `ReferenceError: log is not defined`
      — `backend/open-sse/handlers/chatCore/streamingHandler.js`,
        `backend/open-sse/transformer/watermark.js` · `[test]`

---

## Out of scope — dicatat terpisah

Perubahan di `auth/oidc/*`, `routes/v1/responses/*`, `v1beta/*` dan
`ollamaTransform.js` **tidak terkait jailbreak**. Semuanya adalah hasil sweep
route yang salah ditemukan — `request` yang tidak terdefinisi dan respons error yang
tertelan transform. Dicatat di sini supaya tidak tercampur dengan entri system
prompt.

---

## Known issues

- ⚠️ **Menu Skills ada di sidebar tapi 0 route di backend.** Klik tidak
      dilayani. Katalog skill lives di frontend sebagai konstanta + URL GitHub.
      Belum ada keputusan: tambah route, atau sembunyikan menunya.
- ⚠️ **Model coverage belum lengkap.** Prompt yang masuk lewat jalur di luar
      `messages` / `input` / `contents` / `system` / `system_instruction` /
      `request` wrapper belum ditangani. Shape yang dikenal saat ini: OpenAI chat,
      OpenAI Responses, Anthropic Messages, Gemini REST (snake & camel),
      Antigravity wrapper, Ollama shim.
- ⚠️ **Idempotensi belum diuji ke model asli.** Yang terbukti adalah tidak
      menumpuk di body request pada 3× injeksi beruntun — efeknya pada
      konteks model masih perlu request nyata ke provider.
- ⚠️ **`hermes verify` belum punya CI.** GitHub Actions masih nonaktif
      (0 workflow, `enabled: false`), jadi gate hanya jalan lokal.
- ⚠️ **Produksi belum punya provider credential**, jadi request end-to-end ke
      model asli belum pernah terjadi dari production. Yang terbukti di
      production: routing, auth, dan bentuk shape sampai ke lapisan sebelum fetch
      upstream.
- ⚠️ **`[DONE]` dobel pada SSE** — terjadi dengan maupun tanpa watermark,
      jadi ini bug framing gateway yang terpisah, bukan efek watermark.