import { NextResponse } from "next/server";
import { getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";

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

export async function GET() {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const company = await getNormalizedCompany(ctx.sql);
    if (!company) return NextResponse.json([]);

    const installerName = ctx.appUser?.role === "installer" ? ctx.appUser.name || "" : null;

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
      order by j.updated_at desc
    `;

    return NextResponse.json(rows.map(buildServiceItem).filter(Boolean));
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load service items" }, { status: 500 });
  }
}
