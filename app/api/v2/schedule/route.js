import { NextResponse } from "next/server";
import { getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";

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
          ${installerName}::text is null
          or exists(
            select 1
            from job_crew_assignments ax
            join app_users ux on ux.id = ax.user_id
            where ax.job_id = j.id
              and lower(ux.full_name) = lower(${installerName})
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
          ${installerName}::text is null
          or exists(
            select 1
            from job_crew_assignments ax
            join app_users ux on ux.id = ax.user_id
            where ax.job_id = j.id
              and lower(ux.full_name) = lower(${installerName})
          )
        )
      group by i.id, j.job_number, j.customer_name, j.street_1, j.city, j.state
      order by i.scheduled_at asc
    `;

    const events = [
      ...jobs.map(buildInstallEvent).filter(Boolean),
      ...inspections.map(buildInspectionEvent).filter(Boolean),
    ].sort((a, b) => String(a.date).localeCompare(String(b.date)));

    return NextResponse.json(events);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load schedule" }, { status: 500 });
  }
}
