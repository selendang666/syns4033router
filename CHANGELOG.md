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
- ✅ Idempotensi marker — dicek **dan ditulis** di semua jalur tulis, jadi retry
      tidak menumpuk prompt
      — `backend/src/middleware/jailbreak.js:31,49,65` · `[test]`
      (lihat entri "marker tidak pernah ditulis" di bawah)
- ✅ Claude `system` string kosong tidak lagi menghasilkan newline di depan
      — `backend/src/middleware/jailbreak.js:49` · `[test]`

### Idempotensi: marker dicek tapi tidak pernah ditulis

Penanda `[GODMODE]: ` dicari di dalam body sebelum injeksi ulang, tapi jalur
yang menulis **tidak pernah memproduksinya** — hanya menulis `jbPrompt` polos.
Ceknya jadi dead code, dan tiap retry menambah satu salinan:

```
Gemini flat        5× injeksi -> 5 parts   (harusnya 1)
Antigravity wrapper 5× injeksi -> 5 parts   (penyebab: handler yang sama)
Gemini + ctx       5× injeksi -> 6 parts
Claude system array 5× injeksi -> 6 blocks  (bug identik, jalur berbeda)
Claude system string 5× injeksi -> 1 ✅
OpenAI messages     5× injeksi -> 1 ✅ (hanya kalau system sudah ada)
```

Yang lolos cuma jalur yang *menempel* ke teks yang sudah bertanda; jalur yang
*membuat* entri baru selalu polos. Sekarang setiap jalur tulis memakai satu
variabel `tagged`
— `backend/src/middleware/jailbreak.js:31,49,65,79` · `[test]`

Suite test ikut diperbaiki: assertion lama memakai `=== M`, yang gagal setelah
nilai jadi `[GODMODE]: M` — persis yangPRD perkirakan. Sekarang 19 case:
13 shape + 8 idempotensi (satu per jalur tulis). Sebelumnya idempotensi hanya
diuji untuk OpenAI.

### CRITICAL — `/api/version/*` terbuka tanpa autentikasi

`POST /api/version/shutdown` dan `POST /api/version/update` membalas **200
tanpa session dan tanpa API key**. Yang pertama memanggil `process.exit(0)`,
jadi siapa pun bisa mematikan router dengan satu request. Ditemukan saat audit
auth matrix; endpoint-nya dieksekusi saat itu juga dan production perlu
redeploy.

Penyebabnya dua daftar di `middleware/auth.ts` yang saling menimpa:

```js
PUBLIC_API_PATHS = [ ..., "/api/version", ... ]      // untuk info versi
if (PUBLIC_API_PATHS.some((p) => path === p || path.startsWith(p + "/")))
  return next();
```

`"/api/version/shutdown".startsWith("/api/version/")` → true, jadi seluruh
sub-path ikut jadi publik. `ALWAYS_PROTECTED` memang memuat kedua path itu,
tapi **dead code** — cabang publik `return next()` jalan lebih dulu.

Sekarang `ALWAYS_PROTECTED` dievaluasi sebelum cabang publik
— `backend/src/middleware/auth.ts:74` · `[test]`

```
POST /api/version/shutdown   200 (mati) → 401
POST /api/version/update     200       → 401
GET  /api/version            200       → 200   (tetap publik)
GET  /api/health             200       → 200
```

Guard baru `scripts/guard-auth-order.mjs` menahan kelas bug ini: ia menolak
urutan yang salah, memastikan tiap route destruktif tercatat di
`ALWAYS_PROTECTED`, dan menandai path publik yang menaungi path terlindungi.

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

### Settings menerima nilai non-boolean pada field auth

`PATCH /api/settings` meneruskan body apa adanya ke `updateSettings`, tanpa
validasi tipe. Dua sisi membaca boolean itu dengan cara berbeda:

```js
frontend  setRequireLogin(data.requireLogin !== false)      // null → true
backend   settings?.requireLogin ?? false                   // null → false
```

Akibatnya `requireLogin: null` mematikan seluruh dashboard **sambil toggle di UI
tetap menampilkan "Require login: on"** — operator melihat aman, router terbuka.
Terbukti di instance lokal:

```
PATCH {"requireLogin": null}  →  200, tersimpan sebagai null
GET /api/settings tanpa session → 200      (auth mati)
GET /api/keys     tanpa session → 200
GET /api/providers tanpa session → 200
frontend dbacanya                → null !== false = true → "ON"
```

`requireLogin: "yes"` juga tersimpan sebagai string, dan `123`/`""` ikut
diterima apa adanya.

Field boolean yang meng-gate akses kini dinormalkan di boundary — nilai bukan
boolean dipetakan ke boolean, `null`/`undefined` menjadi `true` (default yang
mengamankan, karena `?? false` akan mematikan auth)
— `backend/src/routes/settings/route.ts` · `[test]`

```
kirim null     → tersimpan True  (bool)
kirim "yes"    → tersimpan True  (bool)
kirim "false"  → tersimpan False (bool)
kirim 123      → tersimpan True  (bool)
kirim ""       → tersimpan False (bool)
set null → /api/settings tanpa session = 401  (dulu 200)
```

Boolean asli tetap dihormati: operator tetap bisa mematikan auth lewat UI, itu
fiturnya, bukan bug.

### Entry system prompt ber-alias tidak pernah dipakai

Entry di panel di-*lookup* pakai kunci yang dibangun dari `provider` dan `model`
**setelah alias di-resolve**:

```js
getModelInfoCore("oc/space-bunny-free")
  → alias map tidak resolve
  → fallback inferProviderFromModelName("space-bunny-free") → "openai"  (default)
jbKeys = ["openai/space-bunny-free", "space-bunny-free"]
```

Panel menyimpan `oc/space-bunny-free`. Tidak ada satu pun kunci yang cocok,
jadi per-model entry **tidak pernah terinjeksi** dan wildcard global diam-diam
menang — persis kebalikan dari yang didokumentasikan. Terbukti di production:

```
global=TTGLOB…  exact=TTEXACT…   →  jawaban "TTGLOB90bb6"   (wildcard menang)
entry "oc/space-bunny-free"       →  tidak pernah dipakai
entry "opencode/space-bunny-free" →  dipakai (bentuk ter-resolve)
```

Sekarang `chat.js` meneruskan `modelStr` apa adanya sebagai `requestedModel`,
dan `chatCore` mencocokkannya **lebih dulu** sebelum bentuk ter-resolve
— `backend/src/sse/handlers/chat.js:203`,
  `backend/open-sse/handlers/chatCore.js` · `[test]`

```
global + exact ada  →  "VVEXACTc11e5"   exact menang ✓
exact dihapus       →  "VVGLOB94573"    wildcard jadi fallback ✓
```

Alias `opencode → oc`, `claude → cc`, `codex → cx` ikut dipetakan sebagai kunci
kedua, karena provider bisa gagal di-resolve ke default.

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

### Validasi API key OpenRouter selalu bilang "valid"

`POST /api/providers/validate` untuk `openrouter` memprobe
`https://openrouter.ai/api/v1/models`. Endpoint itu **katalog publik** — ia
balas 200 bahkan tanpa header Authorization sama sekali:

```
GET /api/v1/models tanpa header : 200
GET /api/v1/models key sampah   : 200
GET /api/v1/models key ngawur   : 200
GET /api/v1/key    key sampah   : 401   ← yang beneran butuh auth
```

Jadi operator menambah key, dialog bilang "valid ✓", lalu setiap request
benar-benar 401. Empat provider lain yang dicek lewat `/models` (openai,
vercel-ai-gateway, gemini, deepgram) 모두 benar — semuanya 401 untuk key
sampah.

Diganti ke `/api/v1/key`, endpoint yang diautentikasi
— `backend/src/routes/providers/validate/route.ts:354` · `[test]`

### SSRF

- ✅ Body `#hex` malformed sebelumnya membuat `ssrfGuard` melempar, dan blok
      `catch` menelannya diam-diam lalu melaporkan "aman" — kelemahan keamanan
      yang dilaporkan sebagai keberhasilan
      — `backend/src/routes/provider-nodes/validate/route.ts:3`

### Combo menerima `models` dalam bentuk apa saja

`POST /api/combos` memvalidasi `name` dengan ketat — spasi dan path traversal
ditolak — tapi `models` diteruskan tanpa pemeriksaan. Semua bentuk ini diterima
dengan `201`:

```
models: []            → 201
models: "bukan-array" → 201
models: [1, 2]        → 201
```

Yang discharged ke routing adalah kode yang mengasumsikan string — ia memanggil
`modelStr.includes()` — sehingga bentuk non-string sampai apa adanya dan muncul
ke pemanggil sebagai error internal:

```
combo models: [1,2]  →  {"error":{"message":"modelStr.includes is not a function"}}
combo models: []     →  {"error":{"message":"Invalid model format"}}
combo models: "str"  →  {"error":{"message":"No active credentials for provider: openai"}}
```

Field `kind` punya masalah serupa dan lebih buruk: `kind` **bukan** strategi —
frontend memakainya sebagai penanda supaya combo media tidak muncul di daftar
LLM (`filter(c => !c.kind)`), dan tidak pernah mengirimnya saat membuat combo.
Tapi API menerimanya, dan objek di sini mencapai kolom teks lalu menggagalkan
seluruh create dengan **500**.

```
kind: {"x": 1}  →  500
kind: 123       →  201  (disimpan, tidak pernah dibaca)
```

Sekarang `kind` juga divalidasi: harus string atau null. Nilai string apa pun
diterima, karena penandanya memang bebas
— `backend/src/routes/combos/route.ts`,
  `backend/src/routes/combos/[id]/route.ts` · `[test]`

`models` juga divalidasi di boundary dan di `PUT`
— `backend/src/routes/combos/route.ts`,
  `backend/src/routes/combos/[id]/route.ts` · `[test]`

```
undefined      → ok (tidak diubah)
[]             → 400 "Add at least one model to the combo"
"str"          → 400 "Models must be an array"
[1,2]          → 400 "Each model must be a non-empty string"
[""]           → 400 "Each model must be a non-empty string"
["oc/…"]       → ok
```

Routing combo sendiri sehat: combo berisi satu model meneruskan ke model itu,
dan `round-robin` dengan dua model memang membagi panggilan.

### Rekaman usage bisa hilang tanpa jejak

`saveUsageStats` berhenti senyap kalau provider tidak mengirim usage dan
tidak ada konten yang bisa diestimasi:

```js
if (inTokens === 0 && outTokens === 0) return;   // nol log
saveRequestUsage({...}).catch(() => {});          // error ditelan
```

Request seperti itu **tidak muncul di Usage sama sekali** — bukan sebagai baris
nol, tapi hilang. Dan kalau penulisan DB gagal, tidak ada apa pun yang
tercetak, sehingga DB rusak terlihat sama dengan hari yang sepi.

Keduanya sekarang berbunyi: bail mencetak peringatan yang menyebut provider,
dan kegagalan menulis mencetak errornya. Ini juga yang membuat "stats beku"
sulit didiagnosis — tanpa log, penyebabnya tidak pernah terlihat.
— `backend/open-sse/handlers/chatCore/requestDetail.js` · `[test]`

### `/api/mcp` terdaftar protected tapi route-nya tidak ada

`PROTECTED_API_PATHS` memuat `/api/mcp`, sementara tidak ada route
`/api/mcp` di backend — permintaannya 404. Tidak bisa dieksploitasi, hanya
entri basi yang menyesatkan pembaca kode
— `backend/src/middleware/auth.ts` · `[test]`

### Toggle strategi combo menampilkan "on" walau gagal disimpan

`handleToggleRoundRobin` mengabaikan hasil `PATCH /api/settings` lalu
memperbarui state lokal apa pun hasilnya. Session kedaluwarsa menjawab 401,
dan toggle tetap tampil aktif padahal tidak ada yang tersimpan — kelas yang
sama dengan boolean tersimpan sebagai tipe yang salah
— `frontend/src/pages/combos/page.jsx` · `[test]`

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

### 31 handler yang jatuh 500 kalau request tanpa body

`const { url } = req.body;` melempar kalau body tidak pernah ter-parse,
dan yang terkirim adalah 500 dengan detail internal:

```
POST /api/cli-tools/cowork-mcp-tools   tanpa body
  sebelum → 500  {"error":"Cannot destructure property 'url' of 'req.body' as it is undefined."}
  sesudah → 400  {"error":"url required"}
```

Bukan cuma satu route. 31 handler di 30 file, termasuk `auth/login` —
permintaan login tanpa body membalas 500 beserta keterangan internal,
bukan penolakan yang bersih. Semua kini memakai `req.body || {}`.
— `backend/src/routes/**` (30 file) · `[test]`

### Media Providers: masking API key jadi hiasan

Baris "API Key" menutup key dengan `apiKey.slice(0, 8)` + titik, tapi blok
curl di bawahnya menginterpolasi key utuh:

```
API Key   sk-ec7fa••••••••••••••
curl …    -H "Authorization: Bearer sk-ec7fa4c79…a22b60d9"
```

Key penuh ada di DOM halaman itu — diperiksa dengan mencocokkan key asli
dari `/api/keys` ke `document.body.innerHTML`, dan cocok di 4 dari 6 halaman
detail. Ini satu-satunya file di seluruh frontend yang masking sekaligus
menaruh key mentah; halaman lain menampilkan penuh apa adanya atau masking
konsisten.

Kartu embedding berbeda lagi: field-nya `<input type="password">` dengan
`value={apiKey}`. Input password menutup glifnya, tapi atribut `value` tetap
memuat seluruh key — `innerHTML` tetap membocorkannya. Field itu kini mulai
kosong dan menampilkan bentuk tersamar sebagai placeholder, dengan tombol
Fill untuk experimented.

Blok curl sekarang ikut memakai `maskKey()` dan ada tombol Reveal di
sebelah baris API Key, jadi masking-nya benar-benar melindungi sampai
diminta. `combo/[id]` tidak punya baris API Key sama sekali, jadi tombolnya
ditempatkan di bawah blok curl-nya.
— `frontend/src/pages/media-providers/[kind]/[id]/page.jsx`
— `frontend/src/pages/media-providers/combo/[id]/page.jsx` · `[test]`

### Proxy Pools: "Disabled N dead proxies" disampaikan walau tidak ada yang tersimpan

Health check menguji pool, lalu menawarkan mematikan yang mati. Penanganannya
memakai `catch {}` yang kosong di sekitar `PUT isActive: false`. `fetch` hanya
menolak pada kegagalan jaringan, jadi session kedaluwarsa atau 500 masuk
sebagai promise yang berhasil dan hilang tanpa suara. Tidak ada yang menghitung
—what pun jumlah yang dilaporkan berasal dari `deadIds.length`, bukan dari
apa yang benar-benar disimpan.

Kini response diperiksa, hanya yang tersimpan yang dihitung, dan bila ada yang
gagal dilaporkan sendiri alih-alih "success".
— `frontend/src/pages/proxy-pools/page.jsx` · `[test]`

### Web: tombol Create Combo tidak pernah bisa dipakai

Halaman web mengirim `models: []`, dan API menolaknya:

```
POST /api/combos  {"name":"x","models":[],"kind":"webSearch"}
  → 400  Add at least one model to the combo
POST /api/combos  {"name":"x","kind":"webSearch"}
  → 201
```

`validateComboModels` menerima `models` yang tidak ada tapi menolak yang kosong,
jadi combo yang dimaksud mulai kosong lalu diisi di halaman detail — langkah
pertama itu mustahil. Efeknya konsekuensi dari validasi yang ditambahkan untuk
halaman `/combos`.

Selain itu sempat saya sempat mengira `POST /api/combos` menjawab `{ combos: [...] }` dan
mengubah frontend agar membaca id dari sana. Itu salah: responsnya adalah objek
combo itu sendiri, `{ id, name, kind, models, createdAt }`, jadi `created.id`
sudah benar sejak awal. Perubahan itu sudah dikembalikan.
— `frontend/src/pages/media-providers/web/page.jsx` · `[test]`

### Web: dua provider fetch-only tidak pernah muncul

Sidebar menamai halamannya "Web Fetch & Search", tapi halamannya hanya memanggil
`getProvidersByKind("webSearch")`. Dua provider yang hanya mendukung fetch
tidak pernah tampil:

```
webSearch : gemini, xai, kimi, minimax, openai, perplexity, tavily, brave-search, …  (15)
webFetch  : tavily, exa, firecrawl, jina-reader                                     (4)
hanya fetch → hilang: firecrawl, jina-reader
```

Keduanya ada di katalog dan punya `serviceKinds: ["webFetch"]`, tapi tidak ada
jalur untuk daftar itu. Halaman sekarang mengambil kedua daftar dan
menggabungkannya tanpa duplikat.
— `frontend/src/pages/media-providers/web/page.jsx` · `[test]`

### Web: kegagalan membuat combo tidak pernah memberi tahu

```
const err = await res.json();
alert(err.error || "Failed to create combo");
```

Body 500 dari error yang belum tertangani, atau halaman HTML dari gateway,
bukan JSON — `res.json()` lalu melempar, penolakan-nya lepas tanpa tertangani,
dan operator tidak melihat apa pun. Tombolnya seperti macet.

Sekarang body dibaca dengan `.catch(() => null)` dan pesannya menyebut kode
status; kalau combo sempat dibuat tapi responsnya tidak terbaca, operator diberi
tahu dengan kata-kata yang berbeda.
— `frontend/src/pages/media-providers/web/page.jsx` · `[test]`

### Halaman detail provider yang tidak melayani kind: kosong tanpa pesan

`if (!kinds.includes(kind)) return null;` membuat halaman **tanpa isi sama
sekali** — tanpa judul, tanpa penjelasan, tanpa tombol kembali. Dua kondisi
berbeda sampai ke sana dan keduanya terlihat sama:

```
/dashboard/media-providers/video/openai   → kosong   (openai memang tidak punya model video)
/dashboard/media-providers/video/weavy    → kosong   (weavy sengaja dihapus dari dashboard,
                                                        tapi katalog masih 75 model)
```

Halaman `/video/weavy` bahkan tidak punya tombol Run, padahal katalog
menyimpan 41 model video — weavy-nya dan route-nya masih hidup. Bassi `leonardo`
dan `runwayml` di lokasi yang sama merender 30 dan 2 model dengan normal.

Sekarang kedua kondisi menampilkan provider yang memang tidak melayani
jenis itu, dengan penjelasan dan tombol kembali.

Dua `return null` lain di berkas yang sama ikut menutupi
`/video/weavy`: `kindConfig` yang tidak dikenal, dan `builtInProvider` yang
`undefined` karena weavy dihapus dari `AI_PROVIDERS` di v0.6.0 sementara 75
modelnya masih ada di katalog. Keduanya kini menampilkan pesan juga.
— `frontend/src/pages/media-providers/[kind]/[id]/page.jsx` · `[test]`

### Diketahui: model Weavy tidak pernah dikirim ke Weavy

Adapter Weavy mengirim permintaan yang sama untuk **45 model**
mereka — video maupun image:

```
URL     https://api.weavy.ai/api/v1/recipes/SZXXYN7L9PN2SCTVYAlt/duplicate   ← satu template
header  x-weavy-*, authorization, User-Agent                                      ← tanpa model
body    {}                                                                        ← kosong
```

`buildUrl(_model, _creds)` dan `buildBody(_model, _body)` keduanya
mengabaikan argumen model. Satu-satunya tempat `model` dipakai adalah
`parseResponse`, yaitu **setelah** permintaan selesai, untuk menulis log dan
menyusun bentuk respons secara lokal.

Jadi di level API, `weavy-luma-ray-2`, `weavy-kling`, dan
`weavy-veo-3-1-image-to-video` semuanya menjadi permintaan yang identik.

**Belum diperbaiki dan TIDAK DIVERIFIKASI.** Tidak ada koneksi Weavy di
production, jadi tidak bisa dipastikan apa yang Weavy lakukan dengan body
kosong pada template itu — mungkin template itu memang memilih model dari
sesuatu yang lain, mungkin semua model mengembalikan hasil yang sama. Yang
terbukti hanyalah bahwa pilihan model tidak ikut terkirim. Menebak perbaikannya
tanpa bukti berisiko damaging alur yang mungkin memang berjalan.
— diverifikasi dari `backend/open-sse/handlers/imageProviders/weavy.js` · `[test]`

### STT Gemini tidak pernah bisa dipakai: nama field yang ditolak Google

Payload audio dikirim dengan nama field snake_case:

```json
{ "parts": [{ "text": "…" }, { "inline_data": { "mime_type": "audio/wav", "data": "…" } }] }
```

REST `generateContent` milik Google menerima field itu dan menjawab `400
Request contains an invalid argument`. Karena itu tidak ada satu pun model
Gemini yang bisa dipakai untuk STT — yang satu hidup ikut gagal, daniga yang
lain sudah ditarik Google dan tampil sebagai 404.

Dengan nama field kanonik (`inlineData` / `mimeType`) jalurnya jalan:

```
POST /api/v1/audio/transcriptions  file=<WAV 1 detik, 16 kHz>  model=gemini/gemini-3.1-flash-lite-preview
  → 200  {"text": "To be, or not to be, that is the question."}
```

Catatan: berkas uji adalah sinus 440 Hz tanpa suara manusia, jadi teks yang
kembali adalah karangan model, bukan transkripsi. Yang dibuktikan di sini
adalah transportnya — request sampai ke Gemini dan jawabannya kembali.

Tiga model lain tetap `404` dan itu di luar kendali kita:
`gemini-2.5-flash`, `gemini-2.5-pro`, dan `gemini-2.0-flash` semuanya
"no longer available" menurut Google.
— `backend/open-sse/handlers/sttCore.js` · `[test]`


### Kartu provider tanpa kredensial: "tersimpan" padahal PATCH gagal

`NoAuthProxyCard` (dipakai kartu Edge TTS, Local Device, Google TTS, Coqui)
mengirim `PATCH /api/settings` lalu membuang responsnya, lalu menyalakan
indikator "tersimpan". `fetch` hanya menolak pada kegagalan jaringan, jadi
session kedaluwarsa atau 500 masuk sebagai promise yang berhasil — pilihan
proxy pool tampak berubah, server menyimpan yang lama, dan baru terlihat
ketika halaman dibuka lagi.

Respons kini diperiksa, pilihan dikembalikan ke nilai sebelumnya bila gagal,
dan pesannya ditampilkan. Ini pola yang sama seperti toggle combos, bulk
quota, `saveModels` MITM, dan `handleHealthCheck` proxy pools.
— `frontend/src/shared/components/NoAuthProxyCard.jsx` · `[test]`

### Kartu provider tanpa kredensial: "ready to use" adalah klaim yang tidak diuji

Teks di kartu itu berbunyi *"This provider is ready to use."* Edge TTS
menjawab `502 Bing TTS failed: 401 {"ShowCaptcha":false}` dari server ini —
layanan itu menolak alamat pusat data. Kalimatnya sekarang berbunyi apa yang
benar: tidak ada kredensial yang perlu diatur, dan apakah upstream mau
melayani bergantung pada host ini.

Badge "Ready" di daftar provider sengaja tidak diubah — itu berarti "tidak
butuh kredensial", yang memang benar. Yang berlebihan adalah kalimatnya.
— `frontend/src/shared/components/NoAuthProxyCard.jsx` · `[test]`

### Diketahui: tiga model image Gemini tidak tersedia di akun ini

Menu Image menampilkan tiga model `gemini/*` bertipe `image`, dan
`/v1/models/info` melaporkan `kind=image → /v1/images/generations` untuk
ketiganya. Melewati endpoint itu semuanya gagal.

```
POST /api/v1/images/generations  model=gemini/<3 model>
  → 404  This model models/gemini-2.5-flash is no longer available
```

Tiga dari tiga. Rangkaian pemeriksaannya:

```
gemini/gemini-3.1-flash-lite-preview   → 200   akun dan kunci berfungsi
gemini/gemini-3-flash-preview          → 404  -this model is no longer available
gemini/gemini-2.5-flash-image          → 404
gemini/gemini-3-pro-image-preview      → 404
gemini/gemini-3.1-flash-image-preview  → 404
```

`buildUrl()` dipanggil langsung dan menghasilkan URL yang berbentuk benar
(`…/v1beta/models/gemini-2.5-flash-image:generateContent`), jadi konstruksi URL
bukan penyebabnya. Koneksi gemini di production juga menyimpan `lastError`
yang sama, artinya akunnya memang tidak lagi melayani model-model ini.

Jadi katalog kita menyebut model yang sudah tidak ada di sisi Google untuk
akun ini. Model Gemini yang masih hidup pada akun ini (`gemini-3.1-flash-lite-preview`)
adalah model bahasa, bukan gambar.

**Belum diperbaiki, dan tidak bisa diperbaiki dari sini.** Katalog model
Google yang berlaku untuk sebuah kunci API tidak diketahui tanpa
menghubungi API itu langsung, dan mengarang daftar model akan
membuat katalog lebih salah lagi, bukan lebih benar. Yang perlu dilakukan
pemilik: jalankan `GET https://generativelanguage.googleapis.com/v1beta/models`
dengan kunci Gemini-nya, lalu cocokkan dengan daftar di katalog.
— diverifikasi di `syns4033router-production.up.railway.app` · `[test]`


### Custom Embedding: baseUrl tanpa validasi, `javascript:` diterima

Menambah node embedding custom hanya memeriksa `name` dan `prefix`, lalu
menyimpan `baseUrl` apa adanya. Semua tipe node hanya pernah mengambil URL
http(s), tapi tidak ada yang memeriksa — semuanya dijawab `201` dan tersimpan
sebagai endpoint yang dianggap jalan:

```
POST /api/provider-nodes  {"type":"custom-embedding","baseUrl":"bukan-url"}
  sebelum → 201 Created
  sesudah → 400  Embedding base URL must be a valid URL, e.g. http://host:port …
```

`javascript:alert(1)` juga diterima. Ketiga cabang tipe node
(`custom-embedding`, `openai-compatible`, `anthropic-compatible`) dan jalur edit
`PUT /api/provider-nodes/[id]` kini memvalidasi skema dan host lewat
`backend/src/lib/endpointUrlValidation.js`.

Cabang `anthropic-compatible` dan jalur `PUT` awalnya lolos dari perbaikan
pertama, dan keduanya terbukti masih menerima `javascript:alert(1)` dengan
`201` setelahnya — jadi diuji ulang, bukan diasumsikan ikut.
— `backend/src/routes/provider-nodes/route.ts`
— `backend/src/routes/provider-nodes/[id]/route.ts` · `[test]`

### Skills bisa diimpor jadi System Prompt

Setiap skill punya tombol **Import** yang mengambil teks `SKILL.md` dari GitHub
dan menyimpannya sebagai entry di `/dashboard/system-prompt`, lengkap dengan
target model yang lu tentukan. Kalau target itu sudah punya entry, Import
bertanya lebih dulu alih-alih menimpa diam-diam.

Jadi skills tetap kanal distribusi — operator cukup menempel satu link — tapi
penegakannya ada di router, bukan bergantung pada agent mau complies atau
tidak. Ini yang sudah terbukti bekerja: `withPrompt "I'm Kova."` vs
`baseline "My name is ChatGPT."`.

Tombol Import disembunyikan untuk `using-superpowers` dan `multi-brain`.
Keduanya instruksi untuk agent yang punya akses shell dan memori antar-agent;
dikirim sebagai system prompt ke model chat, keduanya menyuruh model memakai
alat yang tidak ia punya.

— `frontend/src/pages/skills/page.jsx`
— `frontend/src/shared/constants/skills.js` · `[test]`

### Tombol Copy menampilkan "Copied!" meski clipboard ditolak

`useCopyToClipboard` memanggil `write()` tanpa `await`, lalu langsung
`setCopied(id)`. Jadi centang hijau muncul **sebelum** penulisan selesai —
dan muncul juga ketika penulisan itu ditolak.

```
copy()  →  write()        // tanpa await, penolakan tidak tertangkap
         setCopied(id)    // "Copied!" muncul apa pun hasilnya
```

Izin clipboard ditolak, konteks tidak aman, atau kebijakan browser →
tombol tetap mengonfirmasi, lalu paste berikutnya diam-diam membawa isi
clipboard yang lama.

Hook ini dipakai di **16 file** — semua tombol Copy di aplikasi: Skills,
blok curl Playground, hasil media, cli-tools, proxy pools.

`setCopied` kini hanya dipanggil setelah `write()` benar-benar selesai.
— `frontend/src/shared/hooks/useCopyToClipboard.js` · `[test]`

### Playground: baseline "TANPA PROMPT" sebenarnya memakai prompt

Playground mengirim dua kaki: satu dengan prompt, satu dengan
`systemPrompt: null`. Tapi kedua kaki melewati handler chat yang sama, dan
handler itu mengambil prompt tersimpan dari database **tanpa syarat** —
`getSystemPromptForModel(key)` lalu `injectJailbreak`. Kaki baseline
disuntik ulang entry yang seharusnya ia bandingkan.

```
POST /api/system-prompts/try  {"model":"oc/space-bunny-free","compare":true}
  {"compared":true, "withPrompt":null, "baseline":{"ok":true,"output":"I'm Kova."}}
```

Jadi label "BASELINE (TANPA PROMPT)" berbohong dan perbandingan itu secara
struktur tidak bisa memisahkan efek prompt — dua-duanya akan selalu sama.

`chatCore` sekarang menghormati header internal `x-skip-system-prompt`, dan
kaki baseline mengirimnya. Versi pertama memakai nama variabel yang salah di
`chatCore` dan membuat route ini menjawab `request is not defined`; nama
yang benar adalah `clientRawRequest`, dan keduanya bentuk header — `.get()`
dan akses properti — kini ditangani.
— `backend/open-sse/handlers/chatCore.js`
— `backend/src/routes/system-prompts/try/route.ts` · `[test]`

### System Prompt: "✓ Dihapus" tanpa memeriksa server

`handleDelete` mengirim `DELETE` lalu langsung `showToast("✓ Dihapus")` dan
menutup dialog. `fetch` hanya menolak pada kegagalan jaringan, jadi session
kedaluwarsa atau 500 masuk sebagai promise yang berhasil — toast mengonfirmasi
penghapusan, barisnya hilang dari layar, dan entri masih ada di server sampai
halaman dimuat ulang.

`handleSave` sudah memeriksa status, tapi `await res.json()`-nya tidak
dilindungi: body HTML dari gateway akan melempar sebelum pesan bisa tampil.
Keduanya kini menoleransi body yang bukan JSON dan menyebut kode status.
— `frontend/src/pages/system-prompt/page.jsx` · `[test]`

### Automation: dua aksi hapus selalu melaporkan berhasil

`handleDeleteOtp` dan `handleEmptyFolder` mengirim permintaan lalu memperbarui
tampilan seolah berhasil. `fetch` hanya menolak pada kegagalan jaringan, jadi
session kedaluwarsa atau 500 masuk sebagai promise yang berhasil — baris email,
atau seluruh isi folder, hilang dari daftar lalu muncul lagi saat halaman
dimuat ulang.

`handleEmptyFolder` lebih tajam: ia mengosongkan semua email di sebuah folder
tanpa umpan balik apa pun.

Tiga handler lain di halaman yang sama punya bentuk serupa dan ikut diperbaiki:

```
handleSingleDelete  hapus akun CodeBuddy  → UI membersihkan log seolah berhasil
Clear logs         catch (e) { /* silent */ }
Save Proxies       catch {}             → daftar proxy dianggap tersimpan
```

"Clear logs" menghapus log dari layar **sebelum** permintaan dikirim, jadi
kegagalan harus disebut. "Save Proxies" menutup
modal lebih dulu lalu menyimpan diam-diam.

Kelimanya kini memeriksa status dan menyebutkan kegagalannya.
— `frontend/src/pages/automation/page.jsx` · `[test]`

### Proxy Pools: proxyUrl tanpa validasi sama sekali

`normalizeProxyPoolInput` hanya memeriksa string-nya kosong atau tidak.
Apapun yang lain langsung disimpan sebagai pool proxy yang supposedly
bekerja:

```
POST /api/proxy-pools  {"name":"audit","proxyUrl":"bukan-url"}
  sebelum → 201 Created
  sesudah → 400  Proxy URL must be a valid URL, e.g. http://host:port …
```

`javascript:alert(1)`, `ftp://x.y`, dan `example.com:8080` juga diterima.
Sekarang URL harus punya scheme yang sesuai dan host yang ada.
— `backend/src/lib/proxyPoolValidation.js` (baru) · `[test]`

### Proxy Pools: PUT tidak memvalidasi, dan `type: "deno"` hilang diam-diam

`PUT /api/proxy-pools/:id` punya `normalizeProxyPoolUpdate` sendiri, yang
memeriksa `proxyUrl` hanya apakah kosong. Jadi dua handler yang menulis
kolom yang sama tidak sepakat: POST menolak, PUT menerima.

```
PUT {"proxyUrl":"ngawur"}   → 200   (sekarang 400)
```

Handler itu juga punya daftar tipe sendiri, `["http","vercel","cloudflare"]`,
tanpa `"deno"` yang dipakai jalur create. `PUT {"type":"deno"}` tidak
ditolak — ia diturunkan diam-diam jadi `"http"`, jadi pool Deno yang
dideploy kehilangan tipenya saat diedit.

Kedua handler kini memakai `validateProxyUrl` dan `VALID_PROXY_TYPES` yang
sama.
— `backend/src/routes/proxy-pools/route.ts`
— `backend/src/routes/proxy-pools/[id]/route.ts` · `[test]`

### Media Providers: `/dashboard/media-providers` melempar operator ke halaman login

Path polos tidak punya route sama sekali. Yang terdaftar hanya
`media-providers/web`, `:kind`, `:kind/:id`, dan `combo/:id`, sehingga path
polos jatuh ke route `*` yang mengarahkan ke `/`:

```
/dashboard/media-providers    → /login
/dashboard/media-providers/   → /login
```

Operator yang sudah login kehilangan sesi dan dikick balik ke form hanya
karena mengikuti satu link. Route polos sekarang mengarahkan ke
`media-providers/web`, sama seperti entri gabungan di sidebar.
— `frontend/src/App.tsx` · `[test]`

### Media Providers: kind tak dikenal merender halaman mati

Halaman `[kind]` mengarahkan `webSearch` dan `webFetch` ke `/web`, tapi
tidak ada yang menutup id yang memang tidak pernah ada — salah ketik,
bookmark lama, atau tautan dari build sebelumnya. Halaman tetap dirender
dengan judul dari input dan isi kosong:

```
/dashboard/media-providers/BOGUS-KIND
  → "Manage your BOGUS-KIND providers"   tanpa daftar, tanpa kembali
```

Di sana `kindConfig` bernilai undefined dan daftar provider kosong — bukan
pesan yang jujur. Semua kind yang tidak dikenal kini diarahkan ke `/web`,
sekaligus menutup kasus yang memang sudah ditangani di dalam file itu.
— `frontend/src/pages/media-providers/[kind]/page.jsx` · `[test]`

### Docs: contoh model yang tidak ada

Teks parameter `model` memberi contoh `leo-sora-2`, dan satu link menuju
`/v1/models/info?id=leonardo/leo-sora-2`. Keduanya 404:

```
GET /v1/models/info?id=leonardo/leo-sora-2      → Model not found
GET /v1/models/info?id=leonardo/leo-sora        → "Sora 2", kind video
GET /v1/models/info?id=leonardo/leo-sora-2-pro  → "Sora 2 Pro"
```

Id yang benar adalah `leo-sora`; `leo-sora-2` hanya muncul di katalog sebagai
awalan `leo-sora-2-pro`. Kedua contoh sekarang memakai `leo-sora`.
— `frontend/public/image-video-docs.html` · `[test]`

Katalog model yang ditanam di halaman itu adalah agregat lintas-provider
(`@cf/…` lewat Cloudflare Workers AI, `… (via HuggingFace)`, `… (via OpenRouter)`),
jadi tidak selalu bisa dibandingkan dengan katalog lokal. Itu diperiksa dulu
sebelum menyimpulkan{id} tersebut salah.

### Docs: contoh respons `/v1/models/info` salah, endpoint video tidak pernah ditulis

Halaman Docs menampilkan contoh respons untuk `GET /v1/models/info?id=weavy/weavy-kling`
dengan `"endpoint": "/v1/images/generations"`. API sebenarnya menjawab lain:

```
GET /v1/models/info?id=weavy/weavy-kling
  docs    → "kind":"video", "endpoint":"/v1/images/generations"
  sebenarnya→ "kind":"video", "endpoint":"/v1/video/generations"
```

`KIND_ENDPOINT` di backend memetakan `video` ke `/v1/video/generations`, dan
path itu tidak disebut di docs satu kali pun meski halaman BERJUDUL "Image &
Video API Reference" dan menyebut video 265 kali. `POST /v1/video/generations`
adalah endpoint publik yang berfungsi dan tidak terdokumentasi.

Selain itu, card `/v1/images/generations` mengklaim "This endpoint handles all
image and video generation requests" — keduanya memang menerima model video,
tetapi `/v1/models/info` menunjuk ke endpoint video, jadi itu yang sebaiknya
dipakai.

Endpoint video kini punya card sendiri dengan parameter yang sama, contoh
respons model-info dikoreksi, dan klaim pada card image diperjelas.
— `frontend/public/image-video-docs.html` · `[test]`

### CLI Tools: simpanan model diam-diam hilang

`saveModels` di `CopilotToolCard` dan `OpenCodeToolCard` berjalan setiap
model ditambah atau dihapus, bukan hanya saat tombol Apply ditekan.
Keduanya membuang respons, jadi daftar model tetap menampilkan hasil
editwalaupun server menyimpan yang lama. Kalau kartu ditinggalkan tanpa
menekan Apply, perubahannya hilang tanpa satu pesan pun.

Keduanya kini memeriksa status dan menampilkan errornya.
`handleApply` di kedua file sudah benar sejak awal — jadi kartu yang sama
sekali punya handler yang benar dan handler yang diam-diam gagal.
— `frontend/src/pages/cli-tools/components/{Copilot,OpenCode}ToolCard.jsx` · `[test]`

### MITM: kegagalan simpan model mapping tidak pernah kelihatan

`saveMappings` di `MitmToolCard` memanggil `PUT .../alias` dan membuang
responsnya. Backend menolak menyimpan mapping sebelum DNS tool aktif
(403), jadi input tetap menampilkan nilai yang diketik seolah sudah
tersimpan — lalu hilang begitu halaman dimuat ulang.

Dua lapis yang harusnya bekerja sama tidak sama-sama bekerja:

- backend menolak dengan benar (403, bukan 200 seperti sebelumnya)
- frontend tidak pernah membaca status itu

Sekarang respons diperiksa, nilai yang gagal disimpan dikembalikan seperti
sedia, dan errornya ditunjukkan di kartu. Error-nya tidak memakai
`modalError` yang sudah ada: state itu hanya dirender di dalam modal
password sudo, sedangkan penyimpanan mapping terjadi saat modal itu
tertutup, jadi errornya tidak akan pernah terlihat. State terpisah
`mappingError` dipakai dan dirender di luar modal.
— `frontend/src/pages/cli-tools/components/MitmToolCard.jsx` · `[test]`

### 43 penolakan yang diam-diam terkirim sebagai 200

Audit `/dashboard/mitm` menemukan pola ini di alias MITM:

```js
return res.json(
  { error: `DNS must be enabled for ${tool} ...` },
  { status: 403 }        // res.json() hanya menerima satu argumen
);
```

`res.json()` hanya menerima satu argumen. Argumen kedua dibuang tanpa
peringatan, jadi 403 yang dimaksud tidak pernah terjadi dan yang terkirim
adalah `200` dengan body error. Akibatnya `res.ok` bernilai true, apa pun
yang memanggil tetap berarti request-nya berhasil, dan monitoring
menghitungnya sebagai request sukses.

```
PUT /api/cli-tools/antigravity-mitm/alias
  sebelum → 200  {"error":"DNS must be enabled for cursor ..."}
  sesudah → 403
```

43 pemanggilan di 24 file, termasuk yang bukan di MITM:
`usage/request-details` (`pageSize=99999` tidak pernah ditolak),
`version/update`, `locale`, `models/availability`, `pricing`, `proxy-pools/*`,
`oauth/*`, `cli-tools/*`, `settings/database`.

Sebagian variannya memakai status dinamis, misalnya
`{ status: getResponse.status }` di `oauth/iflow/cookie` dan
`proxy-pools/deno-deploy` — semuanya ikut jadi 200.

— `scripts/guard-json-status.mjs` (baru)aits— `backend/src/routes/**` (24 file)

### Quota: "No Providers Connected" padahal ada 3 koneksi

Halaman Quota menampilkan pesan kosong itu bila
`totals.eligibleConnections === 0`. Ketiga koneksi yang ada melaporkan
`quotaSupported: false`, jadi eligibleConnections nol — dan seluruh daftar
disembunyikan, walaupun server melaporkan `totalConnections: 3`.

```
GET /api/providers/client  →  totalConnections 3
                              providerFilteredConnections 3
                              eligibleConnections 0        ← gate
halaman                      →  "No Providers Connected"
```

Ini membatalkan hasil perbaikan sebelumnya yang sudah menambahkan semua koneksi
ke daftar: kolom `quotaSupported: false` membuat mereka tetap ada, lalu gate ini menyembunyikan
kembali. Gate sekarang memakai daftar yang terlihat, dan tiap koneksi yang tidak
punya API quota tetap tampil dengan penjelasannya sendiri dari
`/api/usage/{connectionId}`.
— `frontend/src/pages/usage/components/ProviderLimits/index.jsx` · `[test]`

### Quota: cache localStorage ditulis tapi tidak pernah dibaca

`quotaCacheData` ditulis setiap kali quota diambil, dengan `cachedAt` — tapi
`cachedAt` tidak pernah diperiksa, tidak ada TTL, dan cache tidak pernah dipakai
mengisi state: `quotaData` selalu mulai dari `{}`. Yang terjadi cuma kunci
localStorage bertambah terus di setiap polling dan tidak pernah dikosongkan
kecuali koneksi dihapus. Dead weight yangDiam-diam memakan kuota storage.
Dihapus seluruhnya
— `frontend/src/pages/usage/components/ProviderLimits/index.jsx` · `[test]`

### Quota: bulk toggle tidak memeriksa hasil

`bulkSetActive` memakai `Promise.all` atas `fetch` yang tidak checking
`res.ok`. `fetch` hanya menolak pada kegagalan jaringan, jadi session
kedaluwarsa (401) atau 500 masuk sebagai promise yang berhasil resolve dan
lenyap. Tiga handler lain di file yang sama sudah memeriksanya
— `frontend/src/pages/usage/components/ProviderLimits/index.jsx` · `[test]`

### Quota: auto-refresh bisa jadi dua poller

Cabang yang menyala kembali ketika tab kembali visible membuat
`setInterval` baru tanpa membersihkan yang lama. Jalur itu bisa berjalan
tanpa cabang "hidden" sempat menyala, dan menimpa `intervalRef` meninggalkan
timer lama hidup — dua poller memanggil API quota tiap provider bersamaan.
Kini dibersihkan dulu sebelum dibuat
— `frontend/src/pages/usage/components/ProviderLimits/index.jsx` · `[test]`

### Playground global: model bukan lagi syarat

Entry global (`modelTarget: "*"`) terikat ke model apa pun — itu
fungsinya. Tapi form mewajibkan `form.model` terisi, jadi memilih entry global
lalu menekan Run berakhir dengan toast "Pilih model dulu" dan **nol request
terkirim**. Toast-nya hijau dan hilang dalam 2,5 detik, jadi dari sisi user
terbaca sebagai tombol mati.

```
  useEffect memuat entry pertama (non-* atau [0]) → prompt + model terisi
  pilih entry global → kolom Model boleh kosong
  Run → model = form.model.trim() || defaultModel()
```

Kolom Model tetap bebas — ganti untuk mengarahkan prompt global ke model lain.
Label di bawah tombol menyebutkan model yang benar-benar dipakai, supaya prompt
global yang dites di satu model nggak terbaca sebagai "sudah dites di semua".

Backend tidak diubah: `try/route.ts:82` tetap `if (!model) return 400`, dan
frontend selalu mengirim model, jadi guard itu tidak terjangkau dari UI.

### Regresi white screen — TDZ di effect dependency

`defaultModel` masuk ke dependency array `useEffect`, yang dievaluasi di
tempat pemanggilan `useEffect`. Karena `const defaultModel = useCallback(...)`
dideklarasikan di bawahnya, pembacaan di situ masuk temporal dead zone:
component crash saat mount, halaman kosong total.

```
ReferenceError: Cannot access 'm' before initialization
```

`m` adalah nama yang dipakai minifier Vite, makanya pesan itu menunjuk variabel
yang tidak ada di source. `npm run build` dan `npm run typecheck` hijau selama
selama itu — hanya memuat halaman di browser yang.myatakannya.

Diperbaiki dengan menaikkan helper ke atas effect — `PlaygroundTab.jsx`
— `[test]`

## Menu Skills — berfungsi, dan sengaja tanpa backend route

Pernah tercatat sebagai "0 route, klik tidak dilayani". Itu penilaian yang
salah: halaman memang tidak memanggil `/api/` sama sekali, jadi ketiadaan
route bukan cacat.

```
frontend/src/pages/skills/page.jsx          166 baris
frontend/src/shared/constants/skills.js      92 baris, 10 entri
panggilan /api/ di halaman                   0
skills/ di repo                              20 file (10 × SKILL.md)
```

Katalog dibaca dari konstanta frontend, lalu `skills.js:87` membangun
`${SKILLS_RAW_BASE}/${id}/SKILL.md` — sebuah raw URL GitHub. Diuji langsung
terhadap `selendang666/syns4033router@master`:

```
10/10 raw 200   (SKILL.md 2.5 KB – 7.3 KB, isi nyata)
10/10 blob 200
chunk ter-deploy page.7Jo_IOwu.js (7.1 KB) memuat katalog + helper URL
```

Belum diperiksa: render visual di browser (Chromium tidak terpasang di mesin
audit), jadi yang terbukti adalah bundle-nya sampai ke production dan URL-nya
resolve — bukan tampilan tata letaknya.

Katalog ini bukan syarat jailbreak, tapi berguna untuk target router: isi
`SKILL.md` bisa dipakai sebagai isi prompt di panel System Prompt, yang
memang sudah menerima teks bebas per-model atau lewat wildcard `*`. Keduanya
baca sumber yang berbeda — katalog dari GitHub, prompt dari database — tapi
mengalir ke slot system yang sama:

```
POST /api/system-prompts  body { displayName?, modelTarget, prompt, isActive?, injectLive? }
modelTarget "*"          entri global untuk semua provider/model
                          — backend/src/routes/system-prompts/route.ts:28-32
                          — backend/src/lib/db/repos/systemPromptsRepo.js:36
chatCore.js:73            body = injectJailbreak(body, jbPrompt)
```

Jadi tidak ada route yang perlu ditambah dan tidak ada menu yang perlu
disembunyikan. Menambah route justru akan membangun lapisan yang tidak
dibutuhkan — katalognya sudah utuh di client.

## Known issues

- ⚠️ **Cakupan model belum lengkap.** Prompt yang masuk lewat jalur di luar
      13 shape yang sudah ditangani.
- ⚠️ **Prompt sudah terbukti mengubah jawaban model, tapi hanya lewat satu
      provider.** Teramati di `oc/space-bunny-free`: prompt "reply dengan
      exactly: VVEXACTc11e5" menghasilkan jawaban persis `VVEXACTc11e5`, dan
      prompt wildcard menghasilkan `VVGLOB94573`. Yang belum terbukti: apakah
      behave sama di provider yang butuh credential berbayar (Claude, OpenAI,
      Gemini) — itu butuh key asli yang belum ada di instalasi ini.
- ⚠️ **`hermes verify` belum punya CI.** GitHub Actions masih nonaktif
      (0 workflow, `enabled: false`), jadi gate hanya jalan lokal — siapa pun
      yang fork harus menjalankan `hermes verify` sendiri.
- ⚠️ **Riwayat commit di GitHub lebih kasar dari yang dikerjakan.** Sync
      berjalan lewat clone bersih karena satu objek git lokal korup, dan
      `git add -A` per-commit membuat beberapa commit memuat lebih dari yang
      tertulis di commit message-nya. Isi file tidak terpengaruh dan sudah
      terverifikasi; yang kurang presisi hanya `git log`.
- ⚠️ **Produksi belum punya provider credential**, jadi request end-to-end ke
      model asli belum pernah terjadi dari production. Yang terbukti di
      production: routing, auth, dan bentuk shape sampai ke lapisan sebelum fetch
      upstream.
- ⚠️ **`[DONE]` dobel pada SSE** — terjadi dengan maupun tanpa watermark,
      jadi ini bug framing gateway yang terpisah, bukan efek watermark.

## Out of scope — dicatat terpisah

Perubahan di `auth/oidc/*`, `routes/v1/responses/*`, `v1beta/*` dan
`ollamaTransform.js` **tidak terkait jailbreak**. Semuanya adalah hasil sweep
route yang salah ditemukan — `request` yang tidak terdefinisi dan respons error yang
tertelan transform. Dicatat di sini supaya tidak tercampur dengan entri system
prompt.

---
