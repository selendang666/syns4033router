/**
 * Menolak tukar-kode OAuth lebih awal, dengan menyebut env yang harus diisi.
 *
 * Tanpa ini clientSecret kosong tetap dikirim dan jawaban "invalid_client"
 * sampai ke user sebagai "Authentication failed" — tanpa ada yang memberi
 * tahu env mana yang belum dipasang. Di repo yang sengaja nol-kredensial,
 * itu yang terjadi pada setiap pengguna baru.
 */
const ENV_HINT = {
  GEMINI_CONFIG: "GEMINI_CLIENT_SECRET",
  IFLOW_CONFIG: "IFLOW_CLIENT_SECRET",
  ANTIGRAVITY_CONFIG: "ANTIGRAVITY_CLIENT_SECRET",
};

export function assertClientSecret(secret, config) {
  if (typeof secret === "string" && secret.trim()) return;
  const env = ENV_HINT[config] ?? `${config.replace(/_CONFIG$/, "")}_CLIENT_SECRET`;
  throw new Error(
    `${config.replace(/_CONFIG$/, "").toLowerCase()} OAuth client secret belum diisi. ` +
      `Set ${env} di Railway Variables, lalu deploy ulang. ` +
      `Repo ini sengaja tidak menyertakan kredensial apa pun.`
  );
}