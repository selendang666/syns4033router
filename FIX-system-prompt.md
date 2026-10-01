# FIX.md — System Prompt Injection (GODMODE)

Dokumentasi alur **persis seperti implementasinya di repo ini**, supaya bisa
dijelaskan ke model lain tanpa menebak. Semua path di bawah sudah diverifikasi
terhadap source.

Tujuan: panel dashboard bisa menyimpan jailbreak prompt, lalu router
menyuntikkannya ke request **sebelum** diteruskan ke provider — supaya prompt
yang lu tweak di router-lah yang dipakai, bukan yang ditulis client/agent.

---

## 1. Penyimpanan — tabel `systemPrompts`

`backend/src/lib/db/migrations/003-system-prompts.js`

```
id           TEXT PRIMARY KEY
displayName  TEXT
modelTarget  TEXT NOT NULL      -- "cc/claude-opus-4-8"  atau  "*" (global)
prompt       TEXT NOT NULL
isActive     INTEGER DEFAULT 1
injectLive   INTEGER DEFAULT 0
createdAt    TEXT NOT NULL
updatedAt    TEXT NOT NULL
UNIQUE(modelTarget)
```

`UNIQUE(modelTarget)` = **satu entry per target**. Implication: tidak bisa punya
dua prompt untuk model yang sama, dan hanya boleh ada **satu** entry global.

Index: `idx_sp_model(modelTarget)`, `idx_sp_active(isActive)`.

**Dua toggle, keduanya wajib ON:**
- `isActive` — entry-nya hidup
- `injectLive` — benar-benar disuntik ke request customer

Cuma `isActive` ON = entry ada tapi nganggur. Ini sumber kebingungan yang
sering terjadi; panel menampilkan badge LIVE hanya kalau dua-duanya ON.

---

## 2. Resolusi — `getSystemPromptForModel()`

`backend/src/lib/db/repos/systemPromptsRepo.js`

```js
export const GLOBAL_TARGET = "*";

export async function getSystemPromptForModel(modelTarget) {
  const row = await db.get(
    `SELECT * FROM systemPrompts
      WHERE isActive = 1 AND injectLive = 1
        AND (modelTarget = ? OR modelTarget = ?)      -- exact ATAU wildcard
      ORDER BY CASE WHEN modelTarget = ? THEN 0 ELSE 1 END
      LIMIT 1`,
    [modelTarget, GLOBAL_TARGET, modelTarget]
  );
  return rowToSp(row);
}
```

Yang terjadi di SQL:
1. Filter `isActive=1 AND injectLive=1` — dua toggle ditegakkan di level query,
   bukan di aplikasi. Jadi tidak ada jalur yang bisa melewatkannya.
2. `modelTarget = ? OR modelTarget = '*'` — kandidat exact **dan** global.
3. `ORDER BY CASE WHEN modelTarget = ? THEN 0 ELSE 1 END` — **exact menang**.
   Tanpa klausa ini, SQLite bisa mengembalikan global dulu; per-model jadi
   tidak pernah kepakai.
4. `LIMIT 1` — satu prompt per request.

Wildcard dikerjakan di query, **bukan kolom terpisah**. Konsekuensinya tidak
perlu migration untuk menambah mode baru, dan `UNIQUE` yang sudah ada otomatis
membatasi global ke satu baris.

---

## 3. Kunci lookup — ini bagian yang paling mudah salah

`backend/open-sse/handlers/chatCore.js`

```js
const jbKeys = [`${provider}/${model}`, model].filter(Boolean);
```

`handleChatCore` menerima `{ provider, model }` yang **sudah di-resolve**.
Jadi string yang dicari adalah:

```
"provider/model"   →  "cc/claude-opus-4-8"     (dulu dicoba)
"model"            →  "claude-opus-4-8"        (fallback)
```

`modelTarget` di panel diisi **qualified**, karena itu yang dikembalikan
`/api/models` sebagai `fullModel`. Bare id cuma ketemu lewat fallback.

**Bug yang pernah terjadi di sini, dan biayanya nyata:** versi awal hanya
mencari `model` (bare). Panel menyimpan `"cc/claude-opus-4-8"`, query-nya cari
`"claude-opus-4-8"` → tidak ketemu → **prompt yang disimpan diam-diam tidak
pernah tersuntikkan sama sekali**, tanpa error apa pun. Prompt terlihat "aktif"
di panel tapi tidak pernah jalan. Sekarang dua-duanya dicoba.

Untuk **custom node** (`openai-compatible-*`), `provider` adalah **node ID**,
bukan prefix. Jadi target yang benar adalah `openai-compatible-chat-<uuid>/<model>`.
Melihat nilai `provider` di `/api/providers` memberi jawaban yang benar.

---

## 4. Injeksi — `injectJailbreak()`

`backend/src/middleware/jailbreak.js`

```js
function prependSystem(list, jbPrompt) {
  if (!Array.isArray(list) || list.length === 0) {
    return [{ role: "system", content: jbPrompt }];
  }
  const first = list[0];
  if (first && first.role === "system") {
    list[0] = { ...first, content: `${first.content}\n[GODMODE]: ${jbPrompt}` };
  } else {
    list.unshift({ role: "system", content: jbPrompt });
  }
  return list;
}
```

Perilaku:
- List kosong → bikin satu system message
- System message **sudah ada** → prompt di-**append** dengan penanda
  `\n[GODMODE]: `, **bukan** menimpa. Jadi context milik operator tetap utuh
- Tidak ada system message → di-`unshift` di depan

Dispatch bentuk payload, dipanggil berurutan; yang pertama cocok dipakai:

```
body.messages  → OpenAI chat completions
body.input     → OpenAI Responses API
body.contents  → Gemini
```

Kalau tidak ada yang cocok, body dikembalikan **utuh** — injeksi tidak pernah
melempar error.

---

## 5. Urutan keseluruhan (3 lapis, paling spesifik dulu)

`chatCore.js`:

```js
const jbKeys = [`${provider}/${model}`, model].filter(Boolean);
const jbParts = [];

for (const key of jbKeys) {
  const sp = await getSystemPromptForModel(key);
  if (sp?.prompt) { jbParts.push(sp.prompt); break; }   // ← break: satu saja
}
if (jbParts.length === 0) {                            // belum ada exact
  const g = await getSystemPromptForModel(GLOBAL_TARGET);
  if (g?.prompt) jbParts.push(g.prompt);
}
if (jbParts.length === 0) {                            // belum ada global
  const envPrompt = process.env.GODMODE_JB || "";
  if (envPrompt) jbParts.push(envPrompt);
}
if (jbParts.length > 0) {
  body = injectJailbreak(body, jbParts.join("\n\n"));
}
```

1. **Per-model** (`provider/model`, lalu `model`)
2. **Global** (`modelTarget = "*"`)
3. **Env** (`GODMODE_JB`) — last resort

`break` di loop itu penting: per-model **menggantikan** global, bukan
ditumpuk. Kalau tidak di-break, request bisa dapat dua system prompt dan
hasilnya tidak bisa diprediksi.

Mulai dari resolution (bukan di dalam translator) supaya prompt ikut terbawa
ke berbagai format upstream — satu titik injeksi untuk semua path.

---

## 6. Playground — `POST /api/system-prompts/try`

`backend/src/routes/system-prompts/try/route.ts`

Body: `{ model, message, prompt? | entryId?, compare? }`

Yang membedakan ini dari sekadar config: **menjalankan message yang sama dua
kali** —

1. **dengan prompt** — disuntik pakai `injectJailbreak()` yang **sama** dengan
   yang dipakai produksi
2. **baseline** — tanpa system message sama sekali

Dua output dikembalikan berdampingan, jadi efek prompt kelihatan, bukan
diasumsikan. Kalau hanya satu leg, tidak ada yang bisa dibandingkan.

Params: `entryId` mencoba entry tersimpan langsung; `prompt` mencoba draft.
`compare: false` untuk melewati baseline. Batas: message 8000 char, prompt 32000 char.

Pakai `authAlreadyChecked: true` saat memanggil `handleChat` — route ini sudah
di belakang guard session dashboard, jadi tidak perlu API key lagi.

**Route import di file ini relatif ke file hasil build**, bukan ke source:
`backend/dist/routes/system/system-prompts/try/`. Salah tingkat = bukan type
error, tapi **seluruh server gagal boot** dengan
`Failed to import N route file(s)`. Hitung dengan `os.path.relpath`, jangan
dengan menghitung `../` manual.

---

## 7. Verifikasi (E2E, bukan "kelihatan jalan")

Harness: `scripts/verify-menu-flows.mjs`. Untuk playground, harness terpisah
dengan upstream yang **gema system message yang dia terima** — itu satu-satunya
cara membuktikan prompt benar-benar sampai, bukan cuma respons 200.

```
leg 1 (dengan prompt)   ["<syns>JAILBREAK_MARKER_XYZ</syns>"]
leg 2 (baseline)        []
```

Guard yang harus tetap berlaku:
```
POST /api/system-prompts/try tanpa session  → 401
/v1/chat/completions tanpa API key           → 401
/API/keys (case-varied)                     → 401   ← lihat auth note
```

---

## 8. Catatan auth — BERKAILAN dengan injeksi global

Entry `modelTarget = "*"` + `injectLive = 1` berarti **satu entri affects
seluruh trafik**: semua user, semua provider. Kalau route injeksi tidak
diautentikasi, siapa pun yang bisa menulis ke tabel itu bisa menyuntik prompt
ke seluruh trafik.

Jadi ini bukan fitur keamanan. Ini fitur yang justru berbahaya kalau
tidak dijaga, karena dampaknya global. Jaga dua hal:

- `/api/system-prompts` harus di balik auth guard
- guard harus **case-insensitive** (lihat `FIX-AUTH.md` / commit `fix(auth)`)

---

## Ringkasan alur satu kalimat

```
request masuk → resolve provider+model
              → coba "provider/model"  → coba "model"
              → kalau kosong, coba "*" (global)
              → kalau masih kosong, pakai env GODMODE_JB
              → prepend sebagai system message (atau append ke system yang ada)
              → teruskan ke provider
```
