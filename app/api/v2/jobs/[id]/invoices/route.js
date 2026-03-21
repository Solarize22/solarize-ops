import { NextResponse } from "next/server";
import { canSeeFinancials, ensureAccessToJob, getRequestContext } from "@/lib/normalized-api";

export async function GET(req, { params }) {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canSeeFinancials(ctx.appUser)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const access = await ensureAccessToJob(ctx.sql, params.id, ctx.appUser);
    if (access === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const rows = await ctx.sql`
      select
        i.*,
        coalesce(
          json_agg(
            json_build_object(
              'id', li.id,
              'lineType', li.line_type,
              'description', li.description,
              'amountCents', li.amount_cents,
              'sortOrder', li.sort_order
            )
            order by li.sort_order asc, li.created_at asc
          ) filter (where li.id is not null),
          '[]'::json
        ) as line_items
      from invoices i
      left join invoice_line_items li on li.invoice_id = i.id
      where i.job_id = ${params.id}
      group by i.id
      order by i.created_at asc
    `;

    return NextResponse.json(rows.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      invoiceType: row.invoice_type,
      status: row.status,
      issuedAt: row.issued_at,
      sentAt: row.sent_at,
      dueAt: row.due_at,
      subtotalCents: row.subtotal_cents,
      totalCents: row.total_cents,
      balanceCents: row.balance_cents,
      financer: row.financer,
      memo: row.memo,
      lineItems: row.line_items || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load invoices" }, { status: 500 });
  }
}
