import { NextResponse } from "next/server";
import { getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";
import { isFieldTrackingInstalled } from "@/lib/field-tracking";

function buildInstallEvent(job) {
  if (!job.install_scheduled_at) return null;
  return {
    id: `install-${job.id}`,
    jobId: job.id,
    jobNumber: job.job_number,
    customerName: job.customer_name,
    type: "Install",
    date: job.install_scheduled_at,
    site: [job.street_1, job.city, job.state].filter(Boolean).join(", "),
    crewNames: job.crew_names || [],
    startTime: "7:00 AM",
    duration: "Full day",
    status: job.current_status === "install_completed" ? "Completed" : "Confirmed",
    notes: job.notes || "",
  };
}

function buildInspectionEvent(inspection) {
  if (!inspection.scheduled_at) return null;
  return {
    id: `inspection-${inspection.id}`,
    jobId: inspection.job_id,
    jobNumber: inspection.job_number,
    customerName: inspection.customer_name,
    type: "Inspection",
    date: inspection.scheduled_at,
    site: [inspection.street_1, inspection.city, inspection.state].filter(Boolean).join(", "),
    crewNames: inspection.crew_names || [],
    startTime: "TBD",
    duration: "1-2 hrs",
    status:
      inspection.result === "passed" ? "Passed" :
      inspection.result === "failed" ? "Failed" :
      "Confirmed",
    notes: inspection.notes || "",
  };
}

function buildFieldVisitEvent(visit) {
  return {
    id: `visit-${visit.id}`,
    jobId: visit.job_id,
    jobNumber: visit.job_number,
    customerName: visit.customer_name,
    type:
      visit.visit_type === "install_day"
        ? `Install Day ${visit.install_day_number || ""}`.trim()
        : visit.visit_type === "service_call"
          ? "Service"
          : "Site Visit",
    date: visit.visit_date,
    site: [visit.street_1, visit.city, visit.state].filter(Boolean).join(", "),
    crewNames: visit.assigned_user_name ? [visit.assigned_user_name] : [],
    startTime: "TBD",
    duration: visit.visit_type === "install_day" ? "Full day" : "As needed",
    status:
      visit.status === "completed" ? "Completed"
      : visit.status === "cancelled" ? "Cancelled"
      : visit.status === "in_progress" ? "In Progress"
      : "Confirmed",
    notes: [visit.title, visit.details, visit.outcome].filter(Boolean).join(" | "),
  };
}

export async function GET() {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const company = await getNormalizedCompany(ctx.sql, ctx.appUser);
    if (!company) {
      return NextResponse.json([]);
    }

    const installerUserId = ctx.appUser?.role === "installer" ? ctx.appUser.id || null : null;
    const fieldTrackingInstalled = await isFieldTrackingInstalled(ctx.sql);

    const jobs = await ctx.sql`
      select
        j.id,
        j.job_number,
        j.customer_name,
        j.street_1,
        j.city,
        j.state,
        j.install_scheduled_at,
        j.current_status,
        j.notes,
        coalesce(
          json_agg(distinct crew.full_name) filter (where crew.full_name is not null),
          '[]'::json
        ) as crew_names
      from jobs j
      left join job_crew_assignments a on a.job_id = j.id
      left join app_users crew on crew.id = a.user_id
      where j.company_id = ${company.id}
        and j.install_scheduled_at is not null
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
      order by j.install_scheduled_at asc
    `;

    const inspections = await ctx.sql`
      select
        i.id,
        i.job_id,
        i.scheduled_at,
        i.result,
        i.notes,
        j.job_number,
        j.customer_name,
        j.street_1,
        j.city,
        j.state,
        coalesce(
          json_agg(distinct crew.full_name) filter (where crew.full_name is not null),
          '[]'::json
        ) as crew_names
      from inspections i
      join jobs j on j.id = i.job_id
      left join job_crew_assignments a on a.job_id = j.id
      left join app_users crew on crew.id = a.user_id
      where j.company_id = ${company.id}
        and i.scheduled_at is not null
        and (
          ${installerUserId}::uuid is null
          or exists(
            select 1
            from job_crew_assignments ax
            where ax.job_id = j.id
              and ax.user_id = ${installerUserId}::uuid
          )
        )
      group by i.id, j.job_number, j.customer_name, j.street_1, j.city, j.state
      order by i.scheduled_at asc
    `;

    const fieldVisits = fieldTrackingInstalled
      ? await ctx.sql`
          select
            fv.id,
            fv.job_id,
            fv.visit_type,
            fv.visit_date,
            fv.status,
            fv.install_day_number,
            fv.title,
            fv.details,
            fv.outcome,
            assigned.full_name as assigned_user_name,
            j.job_number,
            j.customer_name,
            j.street_1,
            j.city,
            j.state
          from job_field_visits fv
          join jobs j on j.id = fv.job_id
          left join app_users assigned on assigned.id = fv.assigned_user_id
          where j.company_id = ${company.id}
            and fv.visit_date is not null
            and fv.status <> 'cancelled'
            and (
              ${installerUserId}::uuid is null
              or exists(
                select 1
                from job_crew_assignments ax
                where ax.job_id = j.id
                  and ax.user_id = ${installerUserId}::uuid
              )
            )
          order by fv.visit_date asc, fv.created_at asc
        `
      : [];

    const events = [
      ...jobs.map(buildInstallEvent).filter(Boolean),
      ...inspections.map(buildInspectionEvent).filter(Boolean),
      ...fieldVisits.map(buildFieldVisitEvent).filter(Boolean),
    ].sort((a, b) => String(a.date).localeCompare(String(b.date)));

    return NextResponse.json(events);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load schedule" }, { status: 500 });
  }
}
