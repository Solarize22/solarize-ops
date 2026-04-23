import { NextResponse } from "next/server";
import { canSeeFinancials, getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";
import { isCrmInstalled, mapContactLogRow, mapTaskRow } from "@/lib/job-crm";
import { buildCustomerKey, chooseEarlierDate, chooseLaterDate, customerIdForKey } from "@/lib/customer-crm";

export async function GET(req, { params }) {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const company = await getNormalizedCompany(ctx.sql);
    if (!company) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const installerName = ctx.appUser?.role === "installer" ? ctx.appUser.name || "" : null;
    const showFinancials = canSeeFinancials(ctx.appUser);
    const crmInstalled = await isCrmInstalled(ctx.sql);

    const rows = await ctx.sql`
      select
        j.*,
        rep.full_name as rep_name,
        follow_up_owner.full_name as follow_up_owner_name,
        coalesce(sum(case when i.status <> 'void' then i.balance_cents else 0 end), 0)::int as outstanding_cents,
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

    const matchingJobs = rows.filter((row) => customerIdForKey(buildCustomerKey(row)) === params.id);
    if (!matchingJobs.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const jobIds = matchingJobs.map((row) => row.id);
    const [contactRows, taskRows, historyRows] = await Promise.all([
      crmInstalled
        ? ctx.sql`
            select
              c.*,
              u.full_name as created_by_name,
              j.job_number
            from job_contact_log c
            join jobs j on j.id = c.job_id
            left join app_users u on u.id = c.created_by
            where c.job_id = any(${jobIds}::uuid[])
            order by c.contacted_at desc, c.created_at desc
            limit 40
          `
        : Promise.resolve([]),
      crmInstalled
        ? ctx.sql`
            select
              t.*,
              owner.full_name as owner_name,
              creator.full_name as created_by_name,
              j.job_number
            from job_follow_up_tasks t
            join jobs j on j.id = t.job_id
            left join app_users owner on owner.id = t.owner_user_id
            left join app_users creator on creator.id = t.created_by
            where t.job_id = any(${jobIds}::uuid[])
            order by
              case when t.status = 'done' then 1 else 0 end asc,
              t.due_at asc nulls last,
              t.created_at desc
          `
        : Promise.resolve([]),
      ctx.sql`
        select
          h.*,
          u.full_name as changed_by_name,
          j.job_number
        from job_status_history h
        join jobs j on j.id = h.job_id
        left join app_users u on u.id = h.changed_by
        where h.job_id = any(${jobIds}::uuid[])
        order by h.changed_at desc
        limit 30
      `,
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const summary = {
      id: params.id,
      name: matchingJobs[0].customer_name,
      email: matchingJobs[0].customer_email,
      phone: matchingJobs[0].customer_phone,
      address: {
        street1: matchingJobs[0].street_1,
        street2: matchingJobs[0].street_2,
        city: matchingJobs[0].city,
        state: matchingJobs[0].state,
        postalCode: matchingJobs[0].postal_code,
        county: matchingJobs[0].county,
      },
      totalJobCount: matchingJobs.length,
      activeJobCount: 0,
      closedJobCount: 0,
      atRiskJobCount: 0,
      totalOutstandingCents: 0,
      lastContactAt: null,
      nextFollowUpAt: null,
      repNames: new Set(),
      followUpOwners: new Set(),
      openTaskCount: 0,
      overdueTaskCount: 0,
    };

    const jobs = matchingJobs.map((row) => {
      const isActive = !["paid_in_full", "cancelled"].includes(row.current_status);
      const isAtRisk = ["inspection_failed", "on_hold"].includes(row.current_status)
        || Number(row.overdue_task_count || 0) > 0
        || (!!row.next_follow_up_at && String(row.next_follow_up_at) < today);

      summary.activeJobCount += isActive ? 1 : 0;
      summary.closedJobCount += isActive ? 0 : 1;
      summary.atRiskJobCount += isAtRisk ? 1 : 0;
      summary.totalOutstandingCents += showFinancials ? Number(row.outstanding_cents || 0) : 0;
      summary.lastContactAt = chooseLaterDate(summary.lastContactAt, row.last_contact_at);
      summary.nextFollowUpAt = chooseEarlierDate(summary.nextFollowUpAt, row.next_follow_up_at);
      summary.openTaskCount += Number(row.open_task_count || 0);
      summary.overdueTaskCount += Number(row.overdue_task_count || 0);

      if (row.rep_name) summary.repNames.add(row.rep_name);
      if (row.follow_up_owner_name) summary.followUpOwners.add(row.follow_up_owner_name);

      return {
        id: row.id,
        jobNumber: row.job_number,
        currentStatus: row.current_status,
        currentStatusChangedAt: row.current_status_changed_at,
        installScheduledAt: row.install_scheduled_at,
        installCompletedAt: row.install_completed_at,
        ptoGrantedAt: row.pto_granted_at,
        repName: row.rep_name,
        followUpOwnerName: row.follow_up_owner_name,
        lastContactAt: row.last_contact_at,
        nextFollowUpAt: row.next_follow_up_at,
        openTaskCount: Number(row.open_task_count || 0),
        overdueTaskCount: Number(row.overdue_task_count || 0),
        outstandingCents: showFinancials ? Number(row.outstanding_cents || 0) : null,
        isActive,
        isAtRisk,
      };
    }).sort((left, right) => String(right.currentStatusChangedAt || "").localeCompare(String(left.currentStatusChangedAt || "")));

    return NextResponse.json({
      crmInstalled,
      customer: {
        ...summary,
        repNames: [...summary.repNames],
        followUpOwners: [...summary.followUpOwners],
        needsFollowUp:
          summary.overdueTaskCount > 0
          || (!!summary.nextFollowUpAt && String(summary.nextFollowUpAt) <= today)
          || (!summary.lastContactAt && summary.activeJobCount > 0),
      },
      jobs,
      contactLog: contactRows.map((row) => ({
        ...mapContactLogRow(row),
        jobNumber: row.job_number,
      })),
      tasks: taskRows.map((row) => ({
        ...mapTaskRow(row),
        jobNumber: row.job_number,
      })),
      history: historyRows
        .filter((item) => showFinancials || (!item.related_invoice_id && !item.related_payment_id && item.event_type !== "invoice_created" && item.event_type !== "payment_received"))
        .map((item) => ({
          id: item.id,
          jobNumber: item.job_number,
          fromStatus: item.from_status,
          toStatus: item.to_status,
          eventType: item.event_type,
          changedAt: item.changed_at,
          changedByName: item.changed_by_name,
          note: item.note,
        })),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load customer detail" }, { status: 500 });
  }
}
