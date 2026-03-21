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
        p.*,
        coalesce(
          json_agg(
            json_build_object(
              'invoiceId', i.id,
              'invoiceNumber', i.invoice_number,
              'allocatedCents', pa.allocated_cents
            )
          ) filter (where pa.id is not null),
          '[]'::json
        ) as allocations
      from payments p
      left join payment_allocations pa on pa.payment_id = p.id
      left join invoices i on i.id = pa.invoice_id
      where p.job_id = ${access.id}
      group by p.id
      order by p.received_at nulls last, p.created_at asc
    `;

    return NextResponse.json(rows.map((row) => ({
      id: row.id,
      paymentReference: row.payment_reference,
      paymentMethod: row.payment_method,
      status: row.status,
      receivedAt: row.received_at,
      amountCents: row.amount_cents,
      sourceName: row.source_name,
      notes: row.notes,
      allocations: row.allocations || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load payments" }, { status: 500 });
  }
}
