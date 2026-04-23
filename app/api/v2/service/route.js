import { NextResponse } from "next/server";
import { getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";
import { isFieldTrackingInstalled } from "@/lib/field-tracking";

function buildServiceItem(job) {
  const status =
    job.current_status === "on_hold" ? "Open" :
    job.current_status === "inspection_failed" ? "In Progress" :
    null;

  if (!status) return null;

  return {
    id: `SVC-${job.job_number}`,
    jobId: job.id,
    jobNumber: job.job_number,
    customer: job.customer_name,
    site: [job.street_1, job.city, job.state].filter(Boolean).join(", "),
    issue: job.current_status === "inspection_failed" ? "Inspection failed / correction needed" : "Project on hold / issue needs resolution",
    urgency: job.current_status === "inspection_failed" ? "High" : "Medium",
    status,
    createdDate: job.updated_at,
    assignedTo: (job.crew_names || [])[0] || "Unassigned",
    notes: job.notes || "",
  };
}

function buildVisitServiceItem(visit) {
  return {
    id: `VIS-${String(visit.id).slice(0, 8).toUpperCase()}`,
    jobId: visit.job_id,
    jobNumber: visit.job_number,
    customer: visit.customer_name,
    site: [visit.street_1, visit.city, visit.state].filter(Boolean).join(", "),
    issue: visit.title,
    urgency: visit.visit_type === "service_call" ? "High" : "Medium",
    status:
      visit.status === "scheduled" ? "Scheduled"
      : visit.status === "in_progress" ? "In Progress"
      : visit.status === "completed" ? "Resolved"
      : "Cancelled",
    createdDate: visit.visit_date,
    assignedTo: visit.assigned_user_name || "Unassigned",
    type: visit.visit_type === "service_call" ? "Service Call" : "Site Visit",
    notes: [visit.details, visit.outcome].filter(Boolean).join(" | "),
  };
}

export async function GET() {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const company = await getNormalizedCompany(ctx.sql, ctx.appUser);
    if (!company) return NextResponse.json([]);

    const installerUserId = ctx.appUser?.role === "installer" ? ctx.appUser.id || null : null;

    if (await isFieldTrackingInstalled(ctx.sql)) {
      const visitRows = await ctx.sql`
        select
          v.*,
          j.job_number,
          j.customer_name,
          j.street_1,
          j.city,
          j.state,
          assigned.full_name as assigned_user_name
        from job_field_visits v
        join jobs j on j.id = v.job_id
        left join app_users assigned on assigned.id = v.assigned_user_id
        where j.company_id = ${company.id}
          and v.visit_type in ('site_visit', 'service_call')
          and (
            ${installerUserId}::uuid is null
            or exists(
              select 1
              from job_crew_assignments ax
              where ax.job_id = j.id
                and ax.user_id = ${installerUserId}::uuid
            )
          )
        order by
          case when v.status = 'completed' then 1 else 0 end asc,
          v.visit_date desc,
          v.created_at desc
      `;

      return NextResponse.json(visitRows.map(buildVisitServiceItem));
    }

    const rows = await ctx.sql`
      select
        j.id,
        j.job_number,
        j.customer_name,
        j.street_1,
        j.city,
        j.state,
        j.current_status,
        j.updated_at,
        j.notes,
        coalesce(
          json_agg(distinct crew.full_name) filter (where crew.full_name is not null),
          '[]'::json
        ) as crew_names
      from jobs j
      left join job_crew_assignments a on a.job_id = j.id
      left join app_users crew on crew.id = a.user_id
      where j.company_id = ${company.id}
        and j.current_status in ('on_hold', 'inspection_failed')
        and (
          ${installerUserId}::uuid is null
          or exists(
            select 1
            from job_crew_assignments ax
            where ax.job_id = j.id
              and ax.user_id = ${installerUserId}::uuid
          )
        )
      group by j.id
      order by j.updated_at desc
    `;

    return NextResponse.json(rows.map(buildServiceItem).filter(Boolean));
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load service items" }, { status: 500 });
  }
}
