import bcrypt from "bcryptjs";
import { getUsers, createUser, getUserRowByUsername } from "../../../lib/db/repos/usersRepo.js";
import { getConsistentMachineId } from "../../../shared/utils/machineId.js";
import { publicMessage } from "../../../lib/publicMessage.js";

// Accounts are made here, never by signup: a public form would create accounts
// nobody owns and nobody can reclaim.
export async function GET(_req, res) {
  try {
    return res.json({ users: await getUsers() });
  } catch (e) {
    return res.status(500).json({ error: publicMessage(e.message, "Failed to list users") });
  }
}

export async function POST(req, res) {
  const { username, password, role } = req.body || {};
  const name = String(username || "").trim();
  if (!/^[a-z0-9._-]{3,32}$/i.test(name)) {
    return res.status(400).json({ error: "Username must be 3-32 chars: letters, digits, . _ -" });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (role && !["admin", "user"].includes(role)) {
    return res.status(400).json({ error: "Role must be admin or user" });
  }
  try {
    if (await getUserRowByUsername(name)) {
      return res.status(409).json({ error: "Username already exists" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const machineId = await getConsistentMachineId();
    const created = await createUser({ username: name, passwordHash, role: role || "user", machineId });
    return res.status(201).json(created);
  } catch (e) {
    return res.status(500).json({ error: publicMessage(e.message, "Failed to create user") });
  }
}
