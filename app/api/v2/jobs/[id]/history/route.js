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
      select
        h.*,
        u.full_name as changed_by_name
      from job_status_history h
      left join app_users u on u.id = h.changed_by
      where h.job_id = ${params.id}
      order by h.changed_at desc
    `;

    return NextResponse.json(rows.map((row) => ({
      id: row.id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      eventType: row.event_type,
      changedAt: row.changed_at,
      changedBy: row.changed_by,
      changedByName: row.changed_by_name,
      relatedInvoiceId: row.related_invoice_id,
      relatedPaymentId: row.related_payment_id,
      relatedInspectionId: row.related_inspection_id,
      note: row.note,
    })));
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load status history" }, { status: 500 });
  }
}
