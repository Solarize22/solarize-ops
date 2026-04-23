import { NextResponse } from "next/server";
import { canSeeFinancials, getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";
import { customerIdentityForRow } from "@/lib/customer-crm";
import { isCrmInstalled } from "@/lib/job-crm";

function emptyReportPayload() {
  return {
    overview: {
      job_count: 0,
      total_invoiced_cents: 0,
      total_outstanding_cents: 0,
      total_collected_cents: 0,
      overdue_invoice_count: 0,
      overdue_outstanding_cents: 0,
    },
    jobsByStatus: [],
    invoicesByStatus: [],
    invoicesByType: [],
    topReps: [],
    actionSummary: {
      overdueInvoiceCount: 0,
      overdueOutstandingCents: 0,
      staleJobCount: 0,
      followUpGapCount: 0,
      readyToAdvanceCount: 0,
    },
    overdueInvoices: [],
    staleJobs: [],
    followUpGaps: [],
    readyToAdvance: [],
    ownerPressure: [],
  };
}

function mapCustomerIdentity(row) {
  const identity = customerIdentityForRow(row);
  return {
    customerId: identity.customerId,
    customerPath: identity.customerPath,
  };
}

function mapInvoiceWorkItem(row) {
  const customer = mapCustomerIdentity(row);
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    invoiceType: String(row.invoice_type || "").toUpperCase(),
    customerName: row.customer_name,
    customerId: customer.customerId,
    customerPath: customer.customerPath,
    jobId: row.job_id,
    jobNumber: row.job_number,
    jobPath: `/jobs/${row.job_number}`,
    dueAt: row.due_at,
    daysOverdue: Number(row.days_overdue || 0),
    balanceCents: Number(row.balance_cents || 0),
    repName: row.rep_name || "Unassigned",
    followUpOwnerName: row.follow_up_owner_name || null,
  };
}

function mapJobWorkItem(row, extras = {}) {
  const customer = mapCustomerIdentity(row);
  return {
    id: row.id,
    jobNumber: row.job_number,
    jobPath: `/jobs/${row.job_number}`,
    customerName: row.customer_name,
    customerId: customer.customerId,
    customerPath: customer.customerPath,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    currentStatus: row.current_status,
    currentStatusChangedAt: row.current_status_changed_at,
    statusAgeDays: Number(row.status_age_days || 0),
    staleAfterDays: Number(row.stale_after_days || 0),
    outstandingCents: Number(row.outstanding_cents || 0),
    lastContactAt: row.last_contact_at || null,
    nextFollowUpAt: row.next_follow_up_at || null,
    repName: row.rep_name || "Unassigned",
    followUpOwnerName: row.follow_up_owner_name || null,
    ownerName: row.follow_up_owner_name || row.rep_name || "Unassigned",
    ...extras,
  };
}

export async function GET() {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canSeeFinancials(ctx.appUser)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const company = await getNormalizedCompany(ctx.sql, ctx.appUser);
    if (!company) {
      return NextResponse.json(emptyReportPayload());
    }

    const crmInstalled = await isCrmInstalled(ctx.sql);

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

    const overdueInvoices = await ctx.sql`
      select
        i.id,
        i.job_id,
        i.invoice_number,
        i.invoice_type,
        i.balance_cents,
        i.due_at,
        greatest((current_date - i.due_at), 0)::int as days_overdue,
        j.job_number,
        j.customer_id,
        j.customer_name,
        j.customer_email,
        j.customer_phone,
        rep.full_name as rep_name,
        owner.full_name as follow_up_owner_name
      from invoices i
      join jobs j on j.id = i.job_id
      left join app_users rep on rep.id = j.rep_user_id
      left join app_users owner on owner.id = j.follow_up_owner_id
      where i.company_id = ${company.id}
        and i.status <> 'paid'
        and i.status <> 'void'
        and i.due_at is not null
        and i.due_at < current_date
      order by days_overdue desc, i.balance_cents desc, i.due_at asc
      limit 8
    `;

    const staleJobs = await ctx.sql`
      select
        j.id,
        j.job_number,
        j.customer_id,
        j.customer_name,
        j.customer_email,
        j.customer_phone,
        j.current_status,
        j.current_status_changed_at,
        j.last_contact_at,
        j.next_follow_up_at,
        rep.full_name as rep_name,
        owner.full_name as follow_up_owner_name,
        coalesce(invoice_summary.outstanding_cents, 0)::int as outstanding_cents,
        greatest((current_date - coalesce(j.current_status_changed_at::date, current_date)), 0)::int as status_age_days,
        (
          case
            when j.current_status = 'created' then 5
            when j.current_status = 'scheduled' then 2
            when j.current_status = 'install_completed' then 3
            when j.current_status = 'inspection_scheduled' then 2
            when j.current_status = 'inspection_passed' then 3
            when j.current_status = 'inspection_failed' then 1
            when j.current_status = 'pto_submitted' then 7
            when j.current_status = 'pto_granted' then 3
            when j.current_status = 'm1_invoiced' then 5
            when j.current_status = 'm1_partially_paid' then 4
            when j.current_status = 'm1_paid' then 5
            when j.current_status = 'm2_invoiced' then 5
            when j.current_status = 'm2_partially_paid' then 4
            when j.current_status = 'on_hold' then 2
            else 7
          end
        )::int as stale_after_days
      from jobs j
      left join app_users rep on rep.id = j.rep_user_id
      left join app_users owner on owner.id = j.follow_up_owner_id
      left join lateral (
        select coalesce(sum(i.balance_cents) filter (where i.status <> 'void'), 0)::int as outstanding_cents
        from invoices i
        where i.job_id = j.id
      ) invoice_summary on true
      where j.company_id = ${company.id}
        and j.current_status not in ('paid_in_full', 'cancelled')
        and (
          current_date - coalesce(j.current_status_changed_at::date, current_date)
        ) >= (
          case
            when j.current_status = 'created' then 5
            when j.current_status = 'scheduled' then 2
            when j.current_status = 'install_completed' then 3
            when j.current_status = 'inspection_scheduled' then 2
            when j.current_status = 'inspection_passed' then 3
            when j.current_status = 'inspection_failed' then 1
            when j.current_status = 'pto_submitted' then 7
            when j.current_status = 'pto_granted' then 3
            when j.current_status = 'm1_invoiced' then 5
            when j.current_status = 'm1_partially_paid' then 4
            when j.current_status = 'm1_paid' then 5
            when j.current_status = 'm2_invoiced' then 5
            when j.current_status = 'm2_partially_paid' then 4
            when j.current_status = 'on_hold' then 2
            else 7
          end
        )
      order by
        (
          current_date - coalesce(j.current_status_changed_at::date, current_date)
        ) - (
          case
            when j.current_status = 'created' then 5
            when j.current_status = 'scheduled' then 2
            when j.current_status = 'install_completed' then 3
            when j.current_status = 'inspection_scheduled' then 2
            when j.current_status = 'inspection_passed' then 3
            when j.current_status = 'inspection_failed' then 1
            when j.current_status = 'pto_submitted' then 7
            when j.current_status = 'pto_granted' then 3
            when j.current_status = 'm1_invoiced' then 5
            when j.current_status = 'm1_partially_paid' then 4
            when j.current_status = 'm1_paid' then 5
            when j.current_status = 'm2_invoiced' then 5
            when j.current_status = 'm2_partially_paid' then 4
            when j.current_status = 'on_hold' then 2
            else 7
          end
        ) desc,
        coalesce(invoice_summary.outstanding_cents, 0) desc,
        j.current_status_changed_at asc
      limit 8
    `;

    const followUpGaps = crmInstalled ? await ctx.sql`
      select
        j.id,
        j.job_number,
        j.customer_id,
        j.customer_name,
        j.customer_email,
        j.customer_phone,
        j.current_status,
        j.current_status_changed_at,
        j.last_contact_at,
        j.next_follow_up_at,
        rep.full_name as rep_name,
        owner.full_name as follow_up_owner_name,
        coalesce(invoice_summary.outstanding_cents, 0)::int as outstanding_cents,
        coalesce(task_summary.open_task_count, 0)::int as open_task_count,
        coalesce(task_summary.overdue_task_count, 0)::int as overdue_task_count,
        greatest((current_date - coalesce(j.current_status_changed_at::date, current_date)), 0)::int as status_age_days,
        case
          when coalesce(task_summary.overdue_task_count, 0) > 0 then 'Overdue follow-up tasks'
          when j.follow_up_owner_id is null then 'No owner assigned'
          when j.next_follow_up_at is null then 'No next follow-up date'
          when j.next_follow_up_at < current_date then 'Follow-up date is overdue'
          when j.last_contact_at is null then 'No contact logged'
          when j.last_contact_at::date <= current_date - 14 then 'No contact in 14+ days'
          else 'Needs CRM cleanup'
        end as gap_reason
      from jobs j
      left join app_users rep on rep.id = j.rep_user_id
      left join app_users owner on owner.id = j.follow_up_owner_id
      left join lateral (
        select coalesce(sum(i.balance_cents) filter (where i.status <> 'void'), 0)::int as outstanding_cents
        from invoices i
        where i.job_id = j.id
      ) invoice_summary on true
      left join lateral (
        select
          count(*) filter (where t.status <> 'done')::int as open_task_count,
          count(*) filter (
            where t.status <> 'done'
              and t.due_at is not null
              and t.due_at < current_date
          )::int as overdue_task_count
        from job_follow_up_tasks t
        where t.job_id = j.id
      ) task_summary on true
      where j.company_id = ${company.id}
        and j.current_status not in ('paid_in_full', 'cancelled')
        and (
          coalesce(task_summary.overdue_task_count, 0) > 0
          or j.follow_up_owner_id is null
          or j.next_follow_up_at is null
          or j.next_follow_up_at < current_date
          or j.last_contact_at is null
          or j.last_contact_at::date <= current_date - 14
        )
      order by
        case
          when coalesce(task_summary.overdue_task_count, 0) > 0 then 5
          when j.follow_up_owner_id is null then 4
          when j.next_follow_up_at is null then 3
          when j.next_follow_up_at < current_date then 3
          when j.last_contact_at is null then 2
          when j.last_contact_at::date <= current_date - 14 then 1
          else 0
        end desc,
        coalesce(task_summary.overdue_task_count, 0) desc,
        coalesce(invoice_summary.outstanding_cents, 0) desc,
        j.current_status_changed_at asc
      limit 8
    ` : [];

    const readyToAdvance = await ctx.sql`
      select
        j.id,
        j.job_number,
        j.customer_id,
        j.customer_name,
        j.customer_email,
        j.customer_phone,
        j.current_status,
        j.current_status_changed_at,
        j.last_contact_at,
        j.next_follow_up_at,
        rep.full_name as rep_name,
        owner.full_name as follow_up_owner_name,
        coalesce(invoice_summary.outstanding_cents, 0)::int as outstanding_cents,
        greatest((
          current_date - coalesce(
            case
              when j.current_status = 'install_completed' then j.install_completed_at::date
              when j.current_status = 'inspection_passed' then coalesce(j.current_status_changed_at::date, current_date)
              when j.current_status = 'pto_granted' then j.pto_granted_at::date
              else j.current_status_changed_at::date
            end,
            j.current_status_changed_at::date,
            current_date
          )
        ), 0)::int as waiting_days,
        case
          when j.current_status = 'install_completed' then 'Queue inspection and homeowner update'
          when j.current_status = 'inspection_passed' then 'Submit PTO and set the next expectation'
          when j.current_status = 'pto_granted' then 'Send final billing and close out cleanly'
          else 'Move the job to the next stage'
        end as recommended_action
      from jobs j
      left join app_users rep on rep.id = j.rep_user_id
      left join app_users owner on owner.id = j.follow_up_owner_id
      left join lateral (
        select coalesce(sum(i.balance_cents) filter (where i.status <> 'void'), 0)::int as outstanding_cents
        from invoices i
        where i.job_id = j.id
      ) invoice_summary on true
      where j.company_id = ${company.id}
        and j.current_status in ('install_completed', 'inspection_passed', 'pto_granted')
        and (
          current_date - coalesce(
            case
              when j.current_status = 'install_completed' then j.install_completed_at::date
              when j.current_status = 'inspection_passed' then j.current_status_changed_at::date
              when j.current_status = 'pto_granted' then j.pto_granted_at::date
              else j.current_status_changed_at::date
            end,
            j.current_status_changed_at::date,
            current_date
          )
        ) >= 1
      order by waiting_days desc, coalesce(invoice_summary.outstanding_cents, 0) desc, j.current_status_changed_at asc
      limit 8
    `;

    const ownerPressure = await ctx.sql`
      select
        coalesce(owner.full_name, rep.full_name, 'Unassigned') as owner_name,
        count(*) filter (where j.current_status not in ('paid_in_full', 'cancelled'))::int as active_jobs,
        count(*) filter (
          where j.current_status not in ('paid_in_full', 'cancelled')
            and (
              current_date - coalesce(j.current_status_changed_at::date, current_date)
            ) >= (
              case
                when j.current_status = 'created' then 5
                when j.current_status = 'scheduled' then 2
                when j.current_status = 'install_completed' then 3
                when j.current_status = 'inspection_scheduled' then 2
                when j.current_status = 'inspection_passed' then 3
                when j.current_status = 'inspection_failed' then 1
                when j.current_status = 'pto_submitted' then 7
                when j.current_status = 'pto_granted' then 3
                when j.current_status = 'm1_invoiced' then 5
                when j.current_status = 'm1_partially_paid' then 4
                when j.current_status = 'm1_paid' then 5
                when j.current_status = 'm2_invoiced' then 5
                when j.current_status = 'm2_partially_paid' then 4
                when j.current_status = 'on_hold' then 2
                else 7
              end
            )
        )::int as stale_jobs,
        count(*) filter (
          where j.current_status not in ('paid_in_full', 'cancelled')
            and (
              j.follow_up_owner_id is null
              or j.next_follow_up_at is null
              or j.next_follow_up_at < current_date
              or j.last_contact_at is null
              or j.last_contact_at::date <= current_date - 14
            )
        )::int as follow_up_gaps,
        count(*) filter (
          where j.current_status in ('install_completed', 'inspection_passed', 'pto_granted')
            and (
              current_date - coalesce(
                case
                  when j.current_status = 'install_completed' then j.install_completed_at::date
                  when j.current_status = 'inspection_passed' then j.current_status_changed_at::date
                  when j.current_status = 'pto_granted' then j.pto_granted_at::date
                  else j.current_status_changed_at::date
                end,
                j.current_status_changed_at::date,
                current_date
              )
            ) >= 1
        )::int as ready_to_advance,
        coalesce(sum(invoice_summary.overdue_invoice_count), 0)::int as overdue_invoices,
        coalesce(sum(invoice_summary.overdue_balance_cents), 0)::int as overdue_balance_cents
      from jobs j
      left join app_users rep on rep.id = j.rep_user_id
      left join app_users owner on owner.id = j.follow_up_owner_id
      left join lateral (
        select
          count(*) filter (
            where i.status <> 'paid'
              and i.status <> 'void'
              and i.due_at is not null
              and i.due_at < current_date
          )::int as overdue_invoice_count,
          coalesce(sum(i.balance_cents) filter (
            where i.status <> 'paid'
              and i.status <> 'void'
              and i.due_at is not null
              and i.due_at < current_date
          ), 0)::int as overdue_balance_cents
        from invoices i
        where i.job_id = j.id
      ) invoice_summary on true
      where j.company_id = ${company.id}
      group by coalesce(owner.full_name, rep.full_name, 'Unassigned')
      having
        count(*) filter (where j.current_status not in ('paid_in_full', 'cancelled')) > 0
        or coalesce(sum(invoice_summary.overdue_invoice_count), 0) > 0
      order by
        (
          count(*) filter (
            where j.current_status not in ('paid_in_full', 'cancelled')
              and (
                current_date - coalesce(j.current_status_changed_at::date, current_date)
              ) >= (
                case
                  when j.current_status = 'created' then 5
                  when j.current_status = 'scheduled' then 2
                  when j.current_status = 'install_completed' then 3
                  when j.current_status = 'inspection_scheduled' then 2
                  when j.current_status = 'inspection_passed' then 3
                  when j.current_status = 'inspection_failed' then 1
                  when j.current_status = 'pto_submitted' then 7
                  when j.current_status = 'pto_granted' then 3
                  when j.current_status = 'm1_invoiced' then 5
                  when j.current_status = 'm1_partially_paid' then 4
                  when j.current_status = 'm1_paid' then 5
                  when j.current_status = 'm2_invoiced' then 5
                  when j.current_status = 'm2_partially_paid' then 4
                  when j.current_status = 'on_hold' then 2
                  else 7
                end
              )
          ) * 3
          + count(*) filter (
            where j.current_status not in ('paid_in_full', 'cancelled')
              and (
                j.follow_up_owner_id is null
                or j.next_follow_up_at is null
                or j.next_follow_up_at < current_date
                or j.last_contact_at is null
                or j.last_contact_at::date <= current_date - 14
              )
          ) * 2
          + count(*) filter (
            where j.current_status in ('install_completed', 'inspection_passed', 'pto_granted')
              and (
                current_date - coalesce(
                  case
                    when j.current_status = 'install_completed' then j.install_completed_at::date
                    when j.current_status = 'inspection_passed' then j.current_status_changed_at::date
                    when j.current_status = 'pto_granted' then j.pto_granted_at::date
                    else j.current_status_changed_at::date
                  end,
                  j.current_status_changed_at::date,
                  current_date
                )
              ) >= 1
          )
          + coalesce(sum(invoice_summary.overdue_invoice_count), 0) * 2
        ) desc,
        coalesce(sum(invoice_summary.overdue_balance_cents), 0) desc,
        owner_name asc
      limit 6
    `;

    const staleJobCountRows = await ctx.sql`
      select count(*)::int as count
      from jobs j
      where j.company_id = ${company.id}
        and j.current_status not in ('paid_in_full', 'cancelled')
        and (
          current_date - coalesce(j.current_status_changed_at::date, current_date)
        ) >= (
          case
            when j.current_status = 'created' then 5
            when j.current_status = 'scheduled' then 2
            when j.current_status = 'install_completed' then 3
            when j.current_status = 'inspection_scheduled' then 2
            when j.current_status = 'inspection_passed' then 3
            when j.current_status = 'inspection_failed' then 1
            when j.current_status = 'pto_submitted' then 7
            when j.current_status = 'pto_granted' then 3
            when j.current_status = 'm1_invoiced' then 5
            when j.current_status = 'm1_partially_paid' then 4
            when j.current_status = 'm1_paid' then 5
            when j.current_status = 'm2_invoiced' then 5
            when j.current_status = 'm2_partially_paid' then 4
            when j.current_status = 'on_hold' then 2
            else 7
          end
        )
    `;

    const followUpGapCountRows = crmInstalled ? await ctx.sql`
      select count(*)::int as count
      from jobs j
      left join lateral (
        select
          count(*) filter (
            where t.status <> 'done'
              and t.due_at is not null
              and t.due_at < current_date
          )::int as overdue_task_count
        from job_follow_up_tasks t
        where t.job_id = j.id
      ) task_summary on true
      where j.company_id = ${company.id}
        and j.current_status not in ('paid_in_full', 'cancelled')
        and (
          coalesce(task_summary.overdue_task_count, 0) > 0
          or j.follow_up_owner_id is null
          or j.next_follow_up_at is null
          or j.next_follow_up_at < current_date
          or j.last_contact_at is null
          or j.last_contact_at::date <= current_date - 14
        )
    ` : [{ count: 0 }];

    const readyToAdvanceCountRows = await ctx.sql`
      select count(*)::int as count
      from jobs j
      where j.company_id = ${company.id}
        and j.current_status in ('install_completed', 'inspection_passed', 'pto_granted')
        and (
          current_date - coalesce(
            case
              when j.current_status = 'install_completed' then j.install_completed_at::date
              when j.current_status = 'inspection_passed' then j.current_status_changed_at::date
              when j.current_status = 'pto_granted' then j.pto_granted_at::date
              else j.current_status_changed_at::date
            end,
            j.current_status_changed_at::date,
            current_date
          )
        ) >= 1
    `;

    const actionSummary = {
      overdueInvoiceCount: Number(overviewRows[0]?.overdue_invoice_count || 0),
      overdueOutstandingCents: Number(overviewRows[0]?.overdue_outstanding_cents || 0),
      staleJobCount: Number(staleJobCountRows[0]?.count || 0),
      followUpGapCount: Number(followUpGapCountRows[0]?.count || 0),
      readyToAdvanceCount: Number(readyToAdvanceCountRows[0]?.count || 0),
    };

    return NextResponse.json({
      overview: overviewRows[0],
      jobsByStatus,
      invoicesByStatus,
      invoicesByType,
      topReps,
      actionSummary,
      overdueInvoices: overdueInvoices.map(mapInvoiceWorkItem),
      staleJobs: staleJobs.map((row) => mapJobWorkItem(row)),
      followUpGaps: followUpGaps.map((row) => mapJobWorkItem(row, {
        gapReason: row.gap_reason,
        openTaskCount: Number(row.open_task_count || 0),
        overdueTaskCount: Number(row.overdue_task_count || 0),
      })),
      readyToAdvance: readyToAdvance.map((row) => mapJobWorkItem(row, {
        waitingDays: Number(row.waiting_days || 0),
        recommendedAction: row.recommended_action,
      })),
      ownerPressure: ownerPressure.map((row) => ({
        ownerName: row.owner_name,
        activeJobs: Number(row.active_jobs || 0),
        staleJobs: Number(row.stale_jobs || 0),
        followUpGaps: Number(row.follow_up_gaps || 0),
        readyToAdvance: Number(row.ready_to_advance || 0),
        overdueInvoices: Number(row.overdue_invoices || 0),
        overdueBalanceCents: Number(row.overdue_balance_cents || 0),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load reports" }, { status: 500 });
  }
}
