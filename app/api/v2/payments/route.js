import { NextResponse } from "next/server";
import { canRecordPayments, getRequestContext } from "@/lib/normalized-api";

export async function POST(req) {
  const ctx = await getRequestContext();
  if (!ctx.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canRecordPayments(ctx.appUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const invoiceId = String(body?.invoiceId || "").trim();
  const amountDollars = Number(body?.amount || 0);
  const amountCents = Math.round(amountDollars * 100);
  const paymentMethod = String(body?.paymentMethod || "").trim().toLowerCase();
  const paymentReference = String(body?.paymentReference || "").trim() || null;
  const receivedAt = body?.receivedAt || null;
  const notes = String(body?.notes || "").trim() || null;

  if (!invoiceId) {
    return NextResponse.json({ error: "Invoice is required" }, { status: 400 });
  }
  if (!["ach", "wire", "check", "credit_card", "financer", "cash", "other"].includes(paymentMethod)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
  }

  try {
    await ctx.sql`begin`;
    const invoices = await ctx.sql`
      select i.*, j.job_number
      from invoices i
      join jobs j on j.id = i.job_id
      where i.id = ${invoiceId}
      limit 1
    `;
    const invoice = invoices[0];
    if (!invoice) {
      await ctx.sql`rollback`;
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (amountCents > invoice.balance_cents) {
      await ctx.sql`rollback`;
      return NextResponse.json({ error: "Payment exceeds outstanding balance" }, { status: 400 });
    }

    const payments = await ctx.sql`
      insert into payments (
        company_id,
        job_id,
        payment_reference,
        payment_method,
        status,
        received_at,
        amount_cents,
        source_name,
        notes,
        created_at,
        updated_at
      )
      values (
        ${invoice.company_id},
        ${invoice.job_id},
        ${paymentReference},
        ${paymentMethod}::payment_method,
        'settled'::payment_status,
        ${receivedAt}::date,
        ${amountCents},
        ${invoice.financer || "manual"},
        ${notes},
        now(),
        now()
      )
      returning *
    `;

    await ctx.sql`
      insert into payment_allocations (
        payment_id,
        invoice_id,
        allocated_cents,
        created_at
      )
      values (
        ${payments[0].id},
        ${invoice.id},
        ${amountCents},
        now()
      )
    `;

    const newBalance = invoice.balance_cents - amountCents;
    const invoiceStatus =
      newBalance === 0 ? "paid" :
      newBalance < invoice.total_cents ? "partially_paid" :
      invoice.status;

    await ctx.sql`
      update invoices
      set
        balance_cents = ${newBalance},
        status = ${invoiceStatus}::invoice_status,
        updated_at = now()
      where id = ${invoice.id}
    `;

    const jobStatus =
      invoice.invoice_type === "m1"
        ? (newBalance === 0 ? "m1_paid" : "m1_partially_paid")
        : invoice.invoice_type === "m2"
          ? (newBalance === 0 ? "paid_in_full" : "m2_partially_paid")
          : null;

    if (jobStatus) {
      await ctx.sql`
        update jobs
        set
          current_status = ${jobStatus}::job_status,
          current_status_changed_at = now(),
          updated_at = now()
        where id = ${invoice.job_id}
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
        related_payment_id,
        note
      )
      values (
        ${invoice.job_id},
        null,
        ${jobStatus || "created"}::job_status,
        'payment_received'::status_event_type,
        now(),
        ${ctx.appUser?.id || null},
        ${invoice.id},
        ${payments[0].id},
        ${`Recorded payment for ${invoice.invoice_number}`}
      )
    `;

    await ctx.sql`commit`;
    return NextResponse.json(payments[0], { status: 201 });
  } catch (error) {
    try { await ctx.sql`rollback`; } catch {}
    return NextResponse.json({ error: error.message || "Failed to record payment" }, { status: 500 });
  }
}
