import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getOrCreateUser, getAllUsers, createUser } from "@/lib/users";

async function requireOwner() {
  const { userId } = await auth();
  if (!userId) return null;
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress || "";
  const name  = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || "User";
  const user = await getOrCreateUser(userId, { email, name });
  if (user.role !== "owner") return null;
  return user;
}

// GET /api/employees — list all employees (owner only)
export async function GET() {
  const caller = await requireOwner();
  if (!caller) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const users = await getAllUsers();
  return NextResponse.json(users);
}

// POST /api/employees — create employee (owner only)
export async function POST(req) {
  const caller = await requireOwner();
  if (!caller) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, role, status } = body;

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const VALID_ROLES = ["owner", "admin", "installer", "salesperson"];
  if (role && !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const user = await createUser({
    name:   name.trim(),
    email:  (email || "").trim(),
    role:   role   || "installer",
    status: status || "active",
  });

  return NextResponse.json(user, { status: 201 });
}
