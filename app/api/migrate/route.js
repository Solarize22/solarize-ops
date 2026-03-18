/**
 * POST /api/migrate
 * Creates the users table and seeds initial team members.
 * Only callable by an owner (or on first run when no users exist yet).
 *
 * Body (optional): { users: [{ name, email, role, status }] }
 * If no body, uses the DEFAULT_SEED below.
 */

import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import {
  getOrCreateUser,
  getAllUsers,
  seedInitialUsers,
  ensureUsersTable,
} from "@/lib/users";

const DEFAULT_SEED = [
  { name: "Tommy",  email: "", role: "owner",      status: "active" },
  { name: "Matt",   email: "", role: "installer",  status: "active" },
  { name: "Jake",   email: "", role: "installer",  status: "active" },
  { name: "Kyle",   email: "", role: "salesperson", status: "active" },
];

export async function POST(req) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress || "";
  const name  = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || "User";

  // Allow if: no users exist yet (initial setup) OR caller is owner
  const existing = await getAllUsers();
  if (existing.length > 0) {
    const caller = await getOrCreateUser(userId, { email, name });
    if (caller.role !== "owner") {
      return NextResponse.json({ error: "Forbidden — owner only" }, { status: 403 });
    }
  }

  // Ensure users table exists (no-op if already there)
  if (process.env.POSTGRES_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.POSTGRES_URL);
    await ensureUsersTable(sql);
  }

  // Parse seed from body or use defaults
  let seedData = DEFAULT_SEED;
  try {
    const body = await req.json();
    if (Array.isArray(body?.users)) seedData = body.users;
  } catch {}

  const users = await seedInitialUsers(seedData);

  // Also ensure the calling user is recorded
  await getOrCreateUser(userId, { email, name });

  const finalUsers = await getAllUsers();
  return NextResponse.json({ ok: true, users: finalUsers });
}
