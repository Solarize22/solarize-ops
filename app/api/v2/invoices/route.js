import { NextResponse } from "next/server";
import { canSeeFinancials, getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";

export async function GET() {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canSeeFinancials(ctx.appUser)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const company = await getNormalizedCompany(ctx.sql);
    if (!company) {
      return NextResponse.json([]);
    }

    const rows = await ctx.sql`
      select
        i.id,
        i.job_id,
        i.invoice_number,
        i.invoice_type,
        i.status,
        i.issued_at,
        i.sent_at,
        i.due_at,
        i.subtotal_cents,
        i.total_cents,
        i.balance_cents,
        i.financer,
        i.memo,
        i.created_at,
        i.updated_at,
        j.job_number,
        j.customer_name
      from invoices i
      join jobs j on j.id = i.job_id
      where i.company_id = ${company.id}
      order by i.created_at desc, i.invoice_number desc
    `;

    const today = new Date().toISOString().slice(0, 10);
    const data = rows.map((row) => {
      let displayStatus = "Pending";
      if (row.status === "paid" || row.balance_cents === 0) {
        displayStatus = "Paid";
      } else if (row.due_at && row.due_at < today) {
        displayStatus = "Overdue";
      }

      return {
        id: row.id,
        jobId: row.job_id,
        jobNumber: row.job_number,
        customerName: row.customer_name,
        invoiceNumber: row.invoice_number,
        invoiceType: String(row.invoice_type || "").toUpperCase(),
        status: displayStatus,
        rawStatus: row.status,
        issuedAt: row.issued_at,
        sentAt: row.sent_at,
        dueAt: row.due_at,
        subtotalCents: row.subtotal_cents,
        totalCents: row.total_cents,
        balanceCents: row.balance_cents,
        financer: row.financer,
        memo: row.memo,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load invoices" }, { status: 500 });
  }
}
