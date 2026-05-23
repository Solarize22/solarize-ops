import { NextResponse } from "next/server";
import { canCreateInvoices, canSeeFinancials, ensureAccessToJob, getRequestContext } from "@/lib/normalized-api";
import { syncWorkflowFollowUpTask } from "@/lib/job-automation";

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
      where i.job_id = ${access.id}
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

export async function POST(req, { params }) {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canCreateInvoices(ctx.appUser)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const access = await ensureAccessToJob(ctx.sql, params.id, ctx.appUser);
    if (access === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const invoiceType = String(body?.invoiceType || "").toLowerCase();
    const invoiceNumber = String(body?.invoiceNumber || "").trim();
    const description = String(body?.description || "").trim() || `Invoice ${invoiceType.toUpperCase()}`;
    const dueAt = body?.dueAt || null;
    const issuedAt = body?.issuedAt || null;
    const amountDollars = Number(body?.amount || 0);
    const amountCents = Math.round(amountDollars * 100);

    if (!["m1", "m2", "adder", "special"].includes(invoiceType)) {
      return NextResponse.json({ error: "Invalid invoice type" }, { status: 400 });
    }
    if (!invoiceNumber) {
      return NextResponse.json({ error: "Invoice number is required" }, { status: 400 });
    }
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
    }

    await ctx.sql`begin`;
    const inserted = await ctx.sql`
      insert into invoices (
        company_id,
        job_id,
        invoice_number,
        invoice_type,
        status,
        issued_at,
        sent_at,
        due_at,
        subtotal_cents,
        total_cents,
        balance_cents,
        financer,
        memo,
        created_at,
        updated_at
      )
      select
        j.company_id,
        j.id,
        ${invoiceNumber},
        ${invoiceType}::invoice_type,
        'issued'::invoice_status,
        ${issuedAt}::date,
        ${issuedAt}::date,
        ${dueAt}::date,
        ${amountCents},
        ${amountCents},
        ${amountCents},
        j.financer,
        ${body?.memo || null},
        now(),
        now()
      from jobs j
      where j.id = ${access.id}
      returning *
    `;

    await ctx.sql`
      insert into invoice_line_items (
        invoice_id,
        line_type,
        description,
        amount_cents,
        sort_order,
        created_at
      )
      values (
        ${inserted[0].id},
        ${invoiceType}::invoice_type,
        ${description},
        ${amountCents},
        1,
        now()
      )
    `;

    const targetStatus =
      invoiceType === "m1" ? "m1_invoiced" :
      invoiceType === "m2" ? "m2_invoiced" :
      null;

    if (targetStatus) {
      await ctx.sql`
        update jobs
        set
          current_status = ${targetStatus}::job_status,
          current_status_changed_at = now(),
          updated_at = now()
        where id = ${access.id}
      `;
    }

    await ctx.sql`
      insert into job_status_history (
        job_id,
        from_status,
        to_status,
        event_type,
        changed_at,
        changed_by,
        related_invoice_id,
        note
      )
      values (
        ${access.id},
        null,
        ${targetStatus || "created"}::job_status,
        'invoice_created'::status_event_type,
        now(),
        ${ctx.appUser?.id || null},
        ${inserted[0].id},
        ${`Created ${invoiceType.toUpperCase()} invoice ${invoiceNumber}`}
      )
    `;

    if (targetStatus) {
      await syncWorkflowFollowUpTask(ctx.sql, access.id, targetStatus, {
        changedBy: ctx.appUser?.id || null,
        effectiveDate: issuedAt || dueAt,
        invoiceDueAt: dueAt,
      });
    }

    await ctx.sql`commit`;
    return NextResponse.json(inserted[0], { status: 201 });
  } catch (error) {
    try { await ctx.sql`rollback`; } catch {}
    return NextResponse.json({ error: error.message || "Failed to create invoice" }, { status: 500 });
  }
}
