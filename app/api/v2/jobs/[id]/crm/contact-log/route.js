import { NextResponse } from "next/server";
import { canManageJobOperations, ensureAccessToJob, getRequestContext } from "@/lib/normalized-api";
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

    const access = await ensureAccessToJob(ctx.sql, params.id, ctx.appUser);
    if (access === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await isCrmInstalled(ctx.sql))) {
      return NextResponse.json({ error: "CRM tables are not installed. Apply db/migrations/003_job_crm_workspace.sql first." }, { status: 409 });
    }

    const body = await req.json();
    const channel = normalizeText(body?.channel)?.toLowerCase() || "call";
    const direction = normalizeText(body?.direction)?.toLowerCase() || "outbound";
    const summary = normalizeText(body?.summary);
    const details = normalizeText(body?.details);
    const contactedAt = normalizeText(body?.contactedAt) || new Date().toISOString();

    if (!summary) {
      return NextResponse.json({ error: "Summary is required" }, { status: 400 });
    }
    if (!VALID_CHANNELS.has(channel)) {
      return NextResponse.json({ error: "Invalid contact channel" }, { status: 400 });
    }
    if (!VALID_DIRECTIONS.has(direction)) {
      return NextResponse.json({ error: "Invalid contact direction" }, { status: 400 });
    }

    const rows = await ctx.sql`
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
        ${access.id},
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
      where id = ${access.id}
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
        ${access.id},
        null,
        ${access.current_status}::job_status,
        'note'::status_event_type,
        ${contactedAt}::timestamptz,
        ${ctx.appUser?.id || null},
        ${`CRM contact logged: ${summary}`}
      )
    `;

    const created = await ctx.sql`
      select
        c.*,
        u.full_name as created_by_name
      from job_contact_log c
      left join app_users u on u.id = c.created_by
      where c.id = ${rows[0].id}
      limit 1
    `;

    return NextResponse.json(mapContactLogRow(created[0]), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to create contact log" }, { status: 500 });
  }
}
