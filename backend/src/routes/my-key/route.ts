import { getUserById, getApiKeyRowForUser } from "../../lib/db/repos/usersRepo.js";
import { deleteApiKey } from "../../lib/db/repos/apiKeysRepo.js";
import { publicMessage } from "../../lib/publicMessage.js";

const MASK = (key) => (key ? `${key.slice(0, 11)}…${key.slice(-4)}` : null);

export async function GET(req, res) {
  const userId = req.session?.userId;
  if (!userId) return res.status(404).json({ error: "Not found" });
  const user = await getUserById(userId);
  if (!user) return res.status(404).json({ error: "Not found" });
  const row = await getApiKeyRowForUser(userId);
  return res.json({
    username: user.username, role: user.role, createdAt: user.createdAt,
    key: null, keyMasked: MASK(row?.key),
    keyActive: row ? row.isActive === 1 || row.isActive === true : false,
    hasKey: Boolean(row),
  });
}

export async function DELETE(req, res) {
  const userId = req.session?.userId;
  if (!userId) return res.status(404).json({ error: "Not found" });
  const row = await getApiKeyRowForUser(userId);
  if (!row) return res.status(404).json({ error: "Not found" });
  await deleteApiKey(row.id);
  return res.json({ success: true, keyRevoked: true });
}
