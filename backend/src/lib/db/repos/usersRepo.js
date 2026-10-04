import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { generateApiKeyWithMachine } from "../../../shared/utils/apiKey.js";

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role || "user",
    keyId: row.keyId || null,
    isActive: row.isActive === 1 || row.isActive === true,
    createdAt: row.createdAt,
  };
}

export async function getUsers() {
  const db = await getAdapter();
  const rows = await db.all(`SELECT * FROM users ORDER BY createdAt ASC`);
  return rows.map(rowToUser);
}

/** Returns the raw row so callers can compare passwordHash; never send it out. */
export async function getUserRowByUsername(username) {
  const db = await getAdapter();
  return db.get(`SELECT * FROM users WHERE username = ?`, [username]);
}

export async function getUserById(id) {
  const db = await getAdapter();
  return rowToUser(await db.get(`SELECT * FROM users WHERE id = ?`, [id]));
}

export async function getApiKeyRowForUser(userId) {
  const db = await getAdapter();
  return db.get(`SELECT * FROM apiKeys WHERE userId = ?`, [userId]);
}

/**
 * Create a user and, in the same transaction, the single API key they own.
 * One user gets one key: that key is what the router bills and the only thing
 * the user can revoke, so a second credential would leave ownership ambiguous.
 */
export async function createUser({ username, passwordHash, role = "user", machineId }) {
  const db = await getAdapter();
  const user = {
    id: uuidv4(),
    username,
    passwordHash,
    role,
    keyId: uuidv4(),
    isActive: 1,
    createdAt: new Date().toISOString(),
  };
  const { key } = generateApiKeyWithMachine(machineId);
  let created = null;

  await db.transaction(async () => {
    await db.run(
      `INSERT INTO users (id, username, passwordHash, role, keyId, isActive, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.username, user.passwordHash, user.role, user.keyId, 1, user.createdAt]
    );
    await db.run(
      `INSERT INTO apiKeys (id, key, name, machineId, userId, isActive, createdAt)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [user.keyId, key, user.username, machineId, user.id, user.createdAt]
    );
    created = { ...rowToUser(user), key };
  });

  return created;
}

export async function deleteUser(id) {
  const db = await getAdapter();
  const keyId = (await db.get(`SELECT keyId FROM users WHERE id = ?`, [id]))?.keyId;
  await db.transaction(async () => {
    if (keyId) await db.run(`DELETE FROM apiKeys WHERE id = ?`, [keyId]);
    await db.run(`DELETE FROM users WHERE id = ?`, [id]);
  });
  return Boolean(keyId);
}
