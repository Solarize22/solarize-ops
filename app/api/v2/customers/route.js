import { NextResponse } from "next/server";
import { canSeeFinancials, getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";
import { isCrmInstalled } from "@/lib/job-crm";
import { buildCustomerKey, chooseEarlierDate, chooseLaterDate, customerIdForKey } from "@/lib/customer-crm";

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

    const installerName = ctx.appUser?.role === "installer" ? ctx.appUser.name || "" : null;
    const showFinancials = canSeeFinancials(ctx.appUser);
    const crmInstalled = await isCrmInstalled(ctx.sql);

    const rows = await ctx.sql`
      select
        j.id,
        j.job_number,
        j.customer_name,
        j.customer_phone,
        j.customer_email,
        j.street_1,
        j.city,
        j.state,
        j.postal_code,
        j.current_status,
        j.current_status_changed_at,
        j.last_contact_at,
        j.next_follow_up_at,
        rep.full_name as rep_name,
        follow_up_owner.full_name as follow_up_owner_name,
        coalesce(sum(case when i.status <> 'void' then i.balance_cents else 0 end), 0)::int as outstanding_cents,
        ${crmInstalled}::boolean as crm_installed,
        case
          when ${crmInstalled}::boolean then (
            select count(*)::int
            from job_follow_up_tasks t
            where t.job_id = j.id
              and t.status <> 'done'
          )
          else 0
        end as open_task_count,
        case
          when ${crmInstalled}::boolean then (
            select count(*)::int
            from job_follow_up_tasks t
            where t.job_id = j.id
              and t.status <> 'done'
              and t.due_at is not null
              and t.due_at < current_date
          )
          else 0
        end as overdue_task_count
      from jobs j
      left join app_users rep on rep.id = j.rep_user_id
      left join app_users follow_up_owner on follow_up_owner.id = j.follow_up_owner_id
      left join invoices i on i.job_id = j.id
      where j.company_id = ${company.id}
        and (
          ${installerName}::text is null
          or exists(
            select 1
            from job_crew_assignments ax
            join app_users ux on ux.id = ax.user_id
            where ax.job_id = j.id
              and lower(ux.full_name) = lower(${installerName})
          )
        )
      group by j.id, rep.full_name, follow_up_owner.full_name
      order by j.created_at desc
    `;

    const today = new Date().toISOString().slice(0, 10);
    const customers = new Map();

    rows.forEach((row) => {
      const key = buildCustomerKey(row);
      if (!customers.has(key)) {
        customers.set(key, {
          id: customerIdForKey(key),
          name: row.customer_name,
          email: row.customer_email,
          phone: row.customer_phone,
          city: row.city,
          state: row.state,
          postalCode: row.postal_code,
          primaryStreet: row.street_1,
          activeJobCount: 0,
          closedJobCount: 0,
          totalJobCount: 0,
          atRiskJobCount: 0,
          openTaskCount: 0,
          overdueTaskCount: 0,
          lastContactAt: null,
          nextFollowUpAt: null,
          totalOutstandingCents: 0,
          repNames: new Set(),
          followUpOwners: new Set(),
          jobs: [],
        });
      }

      const customer = customers.get(key);
      const isActive = !["paid_in_full", "cancelled"].includes(row.current_status);
      const hasRisk = ["inspection_failed", "on_hold"].includes(row.current_status)
        || Number(row.overdue_task_count || 0) > 0
        || (!!row.next_follow_up_at && String(row.next_follow_up_at) < today);

      customer.totalJobCount += 1;
      customer.activeJobCount += isActive ? 1 : 0;
      customer.closedJobCount += isActive ? 0 : 1;
      customer.atRiskJobCount += hasRisk ? 1 : 0;
      customer.openTaskCount += Number(row.open_task_count || 0);
      customer.overdueTaskCount += Number(row.overdue_task_count || 0);
      customer.totalOutstandingCents += showFinancials ? Number(row.outstanding_cents || 0) : 0;
      customer.lastContactAt = chooseLaterDate(customer.lastContactAt, row.last_contact_at);
      customer.nextFollowUpAt = chooseEarlierDate(customer.nextFollowUpAt, row.next_follow_up_at);

      if (row.rep_name) customer.repNames.add(row.rep_name);
      if (row.follow_up_owner_name) customer.followUpOwners.add(row.follow_up_owner_name);

      customer.jobs.push({
        id: row.id,
        jobNumber: row.job_number,
        currentStatus: row.current_status,
        currentStatusChangedAt: row.current_status_changed_at,
        city: row.city,
        state: row.state,
        outstandingCents: showFinancials ? Number(row.outstanding_cents || 0) : null,
      });
    });

    const data = [...customers.values()].map((customer) => ({
      ...customer,
      repNames: [...customer.repNames],
      followUpOwners: [...customer.followUpOwners],
      needsFollowUp:
        customer.overdueTaskCount > 0
        || (!!customer.nextFollowUpAt && String(customer.nextFollowUpAt) <= today)
        || (!customer.lastContactAt && customer.activeJobCount > 0),
      jobs: customer.jobs.sort((left, right) => String(right.currentStatusChangedAt || "").localeCompare(String(left.currentStatusChangedAt || ""))),
    }))
      .sort((left, right) => {
        if (Number(right.needsFollowUp) !== Number(left.needsFollowUp)) {
          return Number(right.needsFollowUp) - Number(left.needsFollowUp);
        }
        if (right.atRiskJobCount !== left.atRiskJobCount) {
          return right.atRiskJobCount - left.atRiskJobCount;
        }
        if (right.overdueTaskCount !== left.overdueTaskCount) {
          return right.overdueTaskCount - left.overdueTaskCount;
        }
        return left.name.localeCompare(right.name);
      });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load customers" }, { status: 500 });
  }
}
