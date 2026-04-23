import { NextResponse } from "next/server";
import { canManageJobOperations, ensureAccessToJob, getRequestContext } from "@/lib/normalized-api";
import { isFieldTrackingInstalled, mapFieldVisitRow } from "@/lib/field-tracking";

const VALID_TYPES = new Set(["install_day", "site_visit", "service_call"]);
const VALID_STATUSES = new Set(["scheduled", "in_progress", "completed", "cancelled"]);

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

export async function GET(req, { params }) {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await ensureAccessToJob(ctx.sql, params.id, ctx.appUser);
    if (access === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await isFieldTrackingInstalled(ctx.sql))) {
      return NextResponse.json([]);
    }

    const rows = await ctx.sql`
      select
        v.*,
        assigned.full_name as assigned_user_name,
        creator.full_name as created_by_name
      from job_field_visits v
      left join app_users assigned on assigned.id = v.assigned_user_id
      left join app_users creator on creator.id = v.created_by
      where v.job_id = ${access.id}
      order by v.visit_date desc, v.created_at desc
    `;

    return NextResponse.json(rows.map(mapFieldVisitRow));
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load field visits" }, { status: 500 });
  }
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
    if (!(await isFieldTrackingInstalled(ctx.sql))) {
      return NextResponse.json({ error: "Field tracking tables are not installed. Apply db/migrations/004_field_visit_tracking.sql first." }, { status: 409 });
    }

    const body = await req.json();
    const visitType = normalizeText(body?.visitType)?.toLowerCase();
    const status = normalizeText(body?.status)?.toLowerCase() || "scheduled";
    const visitDate = normalizeText(body?.visitDate);
    const installDayNumber = body?.installDayNumber === undefined || body?.installDayNumber === null || body?.installDayNumber === ""
      ? null
      : Number(body.installDayNumber);
    const title = normalizeText(body?.title);
    const details = normalizeText(body?.details);
    const outcome = normalizeText(body?.outcome);
    const assignedUserId = normalizeText(body?.assignedUserId);
    const completedAtInput = normalizeText(body?.completedAt);

    if (!VALID_TYPES.has(visitType)) {
      return NextResponse.json({ error: "Invalid visit type" }, { status: 400 });
    }
    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid visit status" }, { status: 400 });
    }
    if (!visitDate) {
      return NextResponse.json({ error: "Visit date is required" }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: "Visit title is required" }, { status: 400 });
    }
    if (visitType === "install_day" && (!Number.isInteger(installDayNumber) || installDayNumber <= 0)) {
      return NextResponse.json({ error: "Install day number must be a positive whole number" }, { status: 400 });
    }
    if (visitType !== "install_day" && installDayNumber !== null) {
      return NextResponse.json({ error: "Only install days can have an install day number" }, { status: 400 });
    }

    const completedAt = status === "completed" ? (completedAtInput || new Date().toISOString()) : null;

    const rows = await ctx.sql`
      insert into job_field_visits (
        job_id,
        visit_type,
        status,
        visit_date,
        completed_at,
        install_day_number,
        title,
        details,
        outcome,
        assigned_user_id,
        created_by,
        created_at,
        updated_at
      )
      values (
        ${access.id},
        ${visitType}::field_visit_type,
        ${status}::field_visit_status,
        ${visitDate}::date,
        ${completedAt || null}::timestamptz,
        ${visitType === "install_day" ? installDayNumber : null}::integer,
        ${title},
        ${details || null},
        ${outcome || null},
        ${assignedUserId || null}::uuid,
        ${ctx.appUser?.id || null},
        now(),
        now()
      )
      returning *
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
        now(),
        ${ctx.appUser?.id || null},
        ${`Field visit logged: ${title}`}
      )
    `;

    const inserted = await ctx.sql`
      select
        v.*,
        assigned.full_name as assigned_user_name,
        creator.full_name as created_by_name
      from job_field_visits v
      left join app_users assigned on assigned.id = v.assigned_user_id
      left join app_users creator on creator.id = v.created_by
      where v.id = ${rows[0].id}
      limit 1
    `;

    return NextResponse.json(mapFieldVisitRow(inserted[0]), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to create field visit" }, { status: 500 });
  }
}
