import { NextResponse } from "next/server";
import { canManageJobOperations, getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";
import { findCustomerRowsById, pickPrimaryCustomerJob } from "@/lib/customer-crm";
import { isCrmInstalled, mapContactLogRow } from "@/lib/job-crm";

const VALID_CHANNELS = new Set(["call", "text", "email", "voicemail", "note"]);
const VALID_DIRECTIONS = new Set(["outbound", "inbound", "internal"]);

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

export async function POST(req, { params }) {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageJobOperations(ctx.appUser)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!(await isCrmInstalled(ctx.sql))) {
      return NextResponse.json({ error: "CRM tables are not installed. Apply db/migrations/003_job_crm_workspace.sql first." }, { status: 409 });
    }

    const company = await getNormalizedCompany(ctx.sql);
    if (!company) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const installerName = ctx.appUser?.role === "installer" ? ctx.appUser.name || "" : null;
    const rows = await ctx.sql`
      select
        j.id,
        j.job_number,
        j.customer_name,
        j.customer_phone,
        j.customer_email,
        j.current_status,
        j.current_status_changed_at,
        j.updated_at,
        j.created_at
      from jobs j
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
      order by j.created_at desc
    `;

    const matchingJobs = findCustomerRowsById(rows, params.id);
    if (!matchingJobs.length) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const body = await req.json();
    const channel = normalizeText(body?.channel)?.toLowerCase() || "call";
    const direction = normalizeText(body?.direction)?.toLowerCase() || "outbound";
    const summary = normalizeText(body?.summary);
    const details = normalizeText(body?.details);
    const contactedAt = normalizeText(body?.contactedAt) || new Date().toISOString();
    const targetJobId = normalizeText(body?.jobId);

    if (!summary) {
      return NextResponse.json({ error: "Summary is required" }, { status: 400 });
    }
    if (!VALID_CHANNELS.has(channel)) {
      return NextResponse.json({ error: "Invalid contact channel" }, { status: 400 });
    }
    if (!VALID_DIRECTIONS.has(direction)) {
      return NextResponse.json({ error: "Invalid contact direction" }, { status: 400 });
    }

    const targetJob = (targetJobId
      ? matchingJobs.find((row) => row.id === targetJobId || row.job_number === targetJobId)
      : null) || pickPrimaryCustomerJob(matchingJobs);

    if (!targetJob) {
      return NextResponse.json({ error: "No eligible job found for this customer" }, { status: 404 });
    }

    const rowsInserted = await ctx.sql`
      insert into job_contact_log (
        job_id,
        contact_channel,
        contact_direction,
        summary,
        details,
        contacted_at,
        created_by,
        created_at,
        updated_at
      )
      values (
        ${targetJob.id},
        ${channel}::crm_contact_channel,
        ${direction}::crm_contact_direction,
        ${summary},
        ${details || null},
        ${contactedAt}::timestamptz,
        ${ctx.appUser?.id || null},
        now(),
        now()
      )
      returning *
    `;

    await ctx.sql`
      update jobs
      set
        last_contact_at = greatest(coalesce(last_contact_at, ${contactedAt}::timestamptz), ${contactedAt}::timestamptz),
        updated_at = now()
      where id = ${targetJob.id}
    `;

    await ctx.sql`
      insert into job_status_history (
        job_id,
        from_status,
        to_status,
        event_type,
        changed_at,
        changed_by,
        note
      )
      values (
        ${targetJob.id},
        null,
        ${targetJob.current_status}::job_status,
        'note'::status_event_type,
        ${contactedAt}::timestamptz,
        ${ctx.appUser?.id || null},
        ${`Customer relationship contact logged: ${summary}`}
      )
    `;

    const created = await ctx.sql`
      select
        c.*,
        u.full_name as created_by_name
      from job_contact_log c
      left join app_users u on u.id = c.created_by
      where c.id = ${rowsInserted[0].id}
      limit 1
    `;

    return NextResponse.json({
      ...mapContactLogRow(created[0]),
      jobNumber: targetJob.job_number,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to create customer contact log" }, { status: 500 });
  }
}
