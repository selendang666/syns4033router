import { deleteUser, getUserById } from "../../../../lib/db/repos/usersRepo.js";
import { publicMessage } from "../../../../lib/publicMessage.js";

export async function GET(_req, res) {
  const user = await getUserById(_req.params.id);
  if (!user) return res.status(404).json({ error: "Not found" });
  return res.json(user);
}

// Removing a user removes the key they owned in the same transaction, so a
// deleted account cannot keep calling the API with a credential still in hand.
export async function DELETE(req, res) {
  try {
    const deleted = await deleteUser(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: publicMessage(e.message, "Failed to delete user") });
  }
}
