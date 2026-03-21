import { NextResponse } from "next/server";
import { ensureAccessToJob, getRequestContext } from "@/lib/normalized-api";

export async function GET(req, { params }) {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await ensureAccessToJob(ctx.sql, params.id, ctx.appUser);
    if (access === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const rows = await ctx.sql`
      select *
      from inspections
      where job_id = ${access.id}
      order by scheduled_at asc nulls last, created_at asc
    `;

    return NextResponse.json(rows.map((row) => ({
      id: row.id,
      inspectionType: row.inspection_type,
      scheduledAt: row.scheduled_at,
      completedAt: row.completed_at,
      result: row.result,
      inspectorName: row.inspector_name,
      authorityName: row.authority_name,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load inspections" }, { status: 500 });
  }
}
