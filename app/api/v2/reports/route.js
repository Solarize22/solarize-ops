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
      return NextResponse.json({
        overview: {
          jobCount: 0,
          totalInvoicedCents: 0,
          totalOutstandingCents: 0,
          totalCollectedCents: 0,
          overdueInvoiceCount: 0,
          overdueOutstandingCents: 0,
        },
        jobsByStatus: [],
        invoicesByStatus: [],
        invoicesByType: [],
        topReps: [],
      });
    }

    const overviewRows = await ctx.sql`
      select
        (select count(*)::int from jobs where company_id = ${company.id}) as job_count,
        coalesce((select sum(total_cents)::int from invoices where company_id = ${company.id} and status <> 'void'), 0) as total_invoiced_cents,
        coalesce((select sum(balance_cents)::int from invoices where company_id = ${company.id} and status <> 'void'), 0) as total_outstanding_cents,
        coalesce((select sum(total_cents - balance_cents)::int from invoices where company_id = ${company.id} and status <> 'void'), 0) as total_collected_cents,
        coalesce((
          select count(*)::int
          from invoices
          where company_id = ${company.id}
            and status <> 'paid'
            and status <> 'void'
            and due_at is not null
            and due_at < current_date
        ), 0) as overdue_invoice_count,
        coalesce((
          select sum(balance_cents)::int
          from invoices
          where company_id = ${company.id}
            and status <> 'paid'
            and status <> 'void'
            and due_at is not null
            and due_at < current_date
        ), 0) as overdue_outstanding_cents
    `;

    const jobsByStatus = await ctx.sql`
      select current_status as status, count(*)::int as count
      from jobs
      where company_id = ${company.id}
      group by current_status
      order by count(*) desc, current_status asc
    `;

    const invoicesByStatus = await ctx.sql`
      select
        status,
        count(*)::int as count,
        coalesce(sum(total_cents)::int, 0) as total_cents,
        coalesce(sum(balance_cents)::int, 0) as balance_cents
      from invoices
      where company_id = ${company.id}
      group by status
      order by count(*) desc, status asc
    `;

    const invoicesByType = await ctx.sql`
      select
        invoice_type as type,
        count(*)::int as count,
        coalesce(sum(total_cents)::int, 0) as total_cents,
        coalesce(sum(balance_cents)::int, 0) as balance_cents
      from invoices
      where company_id = ${company.id}
      group by invoice_type
      order by count(*) desc, invoice_type asc
    `;

    const topReps = await ctx.sql`
      select
        coalesce(u.full_name, 'Unassigned') as rep_name,
        count(*)::int as job_count,
        coalesce(sum(i.total_cents)::int, 0) as total_invoiced_cents
      from jobs j
      left join app_users u on u.id = j.rep_user_id
      left join invoices i on i.job_id = j.id and i.status <> 'void'
      where j.company_id = ${company.id}
      group by coalesce(u.full_name, 'Unassigned')
      order by total_invoiced_cents desc, job_count desc, rep_name asc
    `;

    return NextResponse.json({
      overview: overviewRows[0],
      jobsByStatus,
      invoicesByStatus,
      invoicesByType,
      topReps,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load reports" }, { status: 500 });
  }
}
