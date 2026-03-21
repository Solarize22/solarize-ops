import { NextResponse } from "next/server";
import { canManageJobOperations, getRequestContext } from "@/lib/normalized-api";

export async function GET() {
  const ctx = await getRequestContext();
  if (!ctx.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageJobOperations(ctx.appUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json([]);
}
