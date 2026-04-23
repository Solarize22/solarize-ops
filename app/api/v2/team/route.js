import { NextResponse } from "next/server";
import { getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";

export async function GET() {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const company = await getNormalizedCompany(ctx.sql);
    if (!company) {
      return NextResponse.json([]);
    }

    const rows = await ctx.sql`
      select id, full_name, email, role, is_active
      from app_users
      where company_id = ${company.id}
      order by is_active desc, full_name asc
    `;

    return NextResponse.json(rows.map((row) => ({
      id: row.id,
      name: row.full_name,
      email: row.email,
      role: row.role,
      isActive: row.is_active,
    })));
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load team" }, { status: 500 });
  }
}
