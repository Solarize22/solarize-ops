import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/normalized-api";

export async function GET() {
  const ctx = await getRequestContext();
  if (!ctx.authenticated || !ctx.appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = ctx.appUser;

  return NextResponse.json({
    id:      user.id,
    clerkId: user.clerkId,
    name:    user.name,
    email:   user.email,
    role:    user.role,
    status:  user.status,
  });
}
