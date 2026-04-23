import { NextResponse } from "next/server";
import { getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";

function permitStatusForJob(job) {
  if (job.pto_granted_at) return "Approved";
  if (job.current_status === "pto_submitted") return "Submitted";
  if (job.current_status === "inspection_scheduled" || job.current_status === "inspection_passed") return "Approved";
  if (job.current_status === "install_completed") return "In Review";
  if (job.current_status === "on_hold") return "Utility Redesign Needed";
  return "Not Submitted";
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

    const rows = await ctx.sql`
      select
        j.id,
        j.job_number,
        j.customer_name,
        j.city,
        j.state,
        j.county,
        j.current_status,
        j.install_completed_at,
        j.pto_submitted_at,
        j.pto_granted_at,
        j.notes
      from jobs j
      where j.company_id = ${company.id}
        and (
          ${installerUserId}::uuid is null
          or exists(
            select 1
            from job_crew_assignments ax
            where ax.job_id = j.id
              and ax.user_id = ${installerUserId}::uuid
          )
        )
      order by j.created_at desc
    `;

    return NextResponse.json(rows.map((row) => ({
      id: `PRM-${row.job_number}`,
      jobId: row.id,
      jobNumber: row.job_number,
      customer: row.customer_name,
      town: [row.city, row.state].filter(Boolean).join(", "),
      ahj: row.city ? `${row.city} Building Dept` : "—",
      status: permitStatusForJob(row),
      submittedDate: row.pto_submitted_at || row.install_completed_at,
      approvedDate: row.pto_granted_at,
      submissionMethod: row.pto_submitted_at ? "Internal workflow" : "—",
      nextAction:
        row.pto_granted_at ? "Closed" :
        row.current_status === "on_hold" ? "Resolve utility / permit issue" :
        row.current_status === "install_completed" ? "Prepare inspection / closeout" :
        row.current_status === "inspection_scheduled" ? "Await inspection" :
        row.current_status === "inspection_passed" ? "Submit PTO packet" :
        "Advance project to permit-ready stage",
      notes: row.notes || "",
    })));
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load permits" }, { status: 500 });
  }
}
