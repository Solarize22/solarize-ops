import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getOrCreateUser, getUserById, updateUser, deleteUser } from "@/lib/users";

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

// GET /api/employees/:id
export async function GET(req, { params }) {
  const caller = await requireOwner();
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await getUserById(params.id);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(user);
}

// PUT /api/employees/:id — update name, email, role, status
export async function PUT(req, { params }) {
  const caller = await requireOwner();
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const VALID_ROLES = ["owner", "admin", "installer", "salesperson"];

  if (body.role && !VALID_ROLES.includes(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const updated = await updateUser(params.id, body);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

// DELETE /api/employees/:id
export async function DELETE(req, { params }) {
  const caller = await requireOwner();
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const target = await getUserById(params.id);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Prevent deleting yourself
  if (target.clerkId === caller.clerkId) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  await deleteUser(params.id);
  return NextResponse.json({ deleted: true });
}
