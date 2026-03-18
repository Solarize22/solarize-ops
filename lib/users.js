/**
 * Server-side user role utilities.
 * Works in both local dev (data/users.json) and production (Neon Postgres).
 */

import fs from "fs";
import path from "path";

const USE_DB = !!process.env.POSTGRES_URL;
const USERS_FILE = path.join(process.cwd(), "data", "users.json");

// ─── File helpers (local dev) ─────────────────────────────────────────────────

function readUsersFile() {
  try {
    if (!fs.existsSync(USERS_FILE)) return [];
    const raw = fs.readFileSync(USERS_FILE, "utf8").trim();
    if (!raw || raw === "[]") return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function writeUsersFile(users) {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

// ─── Neon helpers (production) ────────────────────────────────────────────────

async function getDb() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.POSTGRES_URL);
}

export async function ensureUsersTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      clerk_id   TEXT UNIQUE,
      name       TEXT NOT NULL DEFAULT '',
      email      TEXT NOT NULL DEFAULT '',
      role       TEXT NOT NULL DEFAULT 'installer',
      status     TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

// ─── Owner email check ────────────────────────────────────────────────────────

function isOwnerEmail(email) {
  if (!email) return false;
  const ownerEmails = (process.env.OWNER_EMAILS || "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return ownerEmails.includes(email.toLowerCase());
}

// ─── Normalize DB row → plain object ─────────────────────────────────────────

function normalizeDbUser(row) {
  return {
    id:        row.id,
    clerkId:   row.clerk_id,
    name:      row.name,
    email:     row.email,
    role:      row.role,
    status:    row.status,
    createdAt: row.created_at,
  };
}

// ─── Get or create current user record ───────────────────────────────────────
// clerkUserId: string from auth()
// clerkUserData: { email, name } from currentUser()

export async function getOrCreateUser(clerkUserId, clerkUserData = {}) {
  const email = (clerkUserData.email || "").toLowerCase();
  const name  = clerkUserData.name  || email.split("@")[0] || "User";

  if (USE_DB) {
    const sql = await getDb();
    await ensureUsersTable(sql);

    // 1. Try by clerk_id
    let rows = await sql`SELECT * FROM users WHERE clerk_id = ${clerkUserId}`;
    if (rows.length) return normalizeDbUser(rows[0]);

    // 2. Try by email (pre-created without clerk_id)
    if (email) {
      rows = await sql`SELECT * FROM users WHERE email = ${email} AND clerk_id IS NULL`;
      if (rows.length) {
        await sql`UPDATE users SET clerk_id = ${clerkUserId}, name = ${name} WHERE id = ${rows[0].id}`;
        return normalizeDbUser({ ...rows[0], clerk_id: clerkUserId, name });
      }
    }

    // 3. Create new user — first user ever becomes owner
    const countRows = await sql`SELECT COUNT(*) AS c FROM users`;
    const isFirst = parseInt(countRows[0].c, 10) === 0;
    const role = isFirst || isOwnerEmail(email) ? "owner" : "installer";
    const [newUser] = await sql`
      INSERT INTO users (clerk_id, name, email, role, status)
      VALUES (${clerkUserId}, ${name}, ${email}, ${role}, 'active')
      RETURNING *
    `;
    return normalizeDbUser(newUser);
  }

  // ── File-based (local dev) ──
  const users = readUsersFile();

  let user = users.find(u => u.clerkId === clerkUserId);
  if (user) return user;

  if (email) {
    user = users.find(u => u.email === email && !u.clerkId);
    if (user) {
      user.clerkId = clerkUserId;
      user.name    = user.name || name;
      writeUsersFile(users);
      return user;
    }
  }

  // First user ever becomes owner
  const isFirst = users.length === 0;
  const role = isFirst || isOwnerEmail(email) ? "owner" : "installer";
  user = {
    id:        Date.now().toString(),
    clerkId:   clerkUserId,
    name,
    email,
    role,
    status:    "active",
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsersFile(users);
  return user;
}

// ─── CRUD for admin panel ─────────────────────────────────────────────────────

export async function getAllUsers() {
  if (USE_DB) {
    const sql = await getDb();
    await ensureUsersTable(sql);
    const rows = await sql`SELECT * FROM users ORDER BY created_at ASC`;
    return rows.map(normalizeDbUser);
  }
  return readUsersFile();
}

export async function getUserById(id) {
  if (USE_DB) {
    const sql = await getDb();
    await ensureUsersTable(sql);
    const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
    return rows.length ? normalizeDbUser(rows[0]) : null;
  }
  const users = readUsersFile();
  return users.find(u => u.id === id) || null;
}

export async function createUser(data) {
  const { name, email, role = "installer", status = "active" } = data;
  const emailLower = (email || "").toLowerCase();

  if (USE_DB) {
    const sql = await getDb();
    await ensureUsersTable(sql);
    const [row] = await sql`
      INSERT INTO users (name, email, role, status)
      VALUES (${name}, ${emailLower}, ${role}, ${status})
      RETURNING *
    `;
    return normalizeDbUser(row);
  }

  const users = readUsersFile();
  const user = {
    id:        Date.now().toString(),
    clerkId:   null,
    name,
    email:     emailLower,
    role,
    status,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsersFile(users);
  return user;
}

export async function updateUser(id, updates) {
  const allowed = ["name", "email", "role", "status"];
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );

  if (USE_DB) {
    const sql = await getDb();
    await ensureUsersTable(sql);
    const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (!rows.length) return null;
    const merged = { ...rows[0], ...filtered };
    const [updated] = await sql`
      UPDATE users
      SET name = ${merged.name}, email = ${merged.email},
          role = ${merged.role}, status = ${merged.status}
      WHERE id = ${id}
      RETURNING *
    `;
    return normalizeDbUser(updated);
  }

  const users = readUsersFile();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  users[idx] = { ...users[idx], ...filtered };
  writeUsersFile(users);
  return users[idx];
}

export async function deleteUser(id) {
  if (USE_DB) {
    const sql = await getDb();
    await ensureUsersTable(sql);
    await sql`DELETE FROM users WHERE id = ${id}`;
    return true;
  }
  const users = readUsersFile();
  const next = users.filter(u => u.id !== id);
  if (next.length === users.length) return false;
  writeUsersFile(next);
  return true;
}

// ─── Seed initial users (called from /api/migrate) ───────────────────────────

export async function seedInitialUsers(seedData) {
  // seedData: [{ name, email, role, status }]
  if (USE_DB) {
    const sql = await getDb();
    await ensureUsersTable(sql);
    for (const u of seedData) {
      const email = (u.email || "").toLowerCase();
      // Skip if email already exists
      const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
      if (existing.length) continue;
      await sql`
        INSERT INTO users (name, email, role, status)
        VALUES (${u.name}, ${email}, ${u.role}, ${u.status || "active"})
      `;
    }
    return getAllUsers();
  }

  const users = readUsersFile();
  for (const u of seedData) {
    const email = (u.email || "").toLowerCase();
    if (users.find(existing => existing.email === email)) continue;
    users.push({
      id:        Date.now().toString() + Math.random().toString(36).slice(2),
      clerkId:   null,
      name:      u.name,
      email,
      role:      u.role,
      status:    u.status || "active",
      createdAt: new Date().toISOString(),
    });
  }
  writeUsersFile(users);
  return users;
}
