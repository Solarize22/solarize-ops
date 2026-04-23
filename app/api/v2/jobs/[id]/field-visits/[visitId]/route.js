import { NextResponse } from "next/server";
import { canManageJobOperations, ensureAccessToJob, getRequestContext } from "@/lib/normalized-api";
import { isFieldTrackingInstalled, mapFieldVisitRow } from "@/lib/field-tracking";

const VALID_STATUSES = new Set(["scheduled", "in_progress", "completed", "cancelled"]);

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

export async function PATCH(req, { params }) {
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

    const visitRows = await ctx.sql`
      select *
      from job_field_visits
      where id = ${params.visitId}
        and job_id = ${access.id}
      limit 1
    `;

    const visit = visitRows[0];
    if (!visit) {
      return NextResponse.json({ error: "Field visit not found" }, { status: 404 });
    }

    const body = await req.json();
    const title = normalizeText(body?.title) ?? visit.title;
    const details = body?.details === undefined ? visit.details : normalizeText(body?.details);
    const outcome = body?.outcome === undefined ? visit.outcome : normalizeText(body?.outcome);
    const assignedUserId = body?.assignedUserId === undefined ? visit.assigned_user_id : normalizeText(body?.assignedUserId);
    const visitDate = body?.visitDate === undefined ? visit.visit_date : normalizeText(body?.visitDate);
    const status = normalizeText(body?.status)?.toLowerCase() || visit.status;

    if (!title) {
      return NextResponse.json({ error: "Visit title is required" }, { status: 400 });
    }
    if (!visitDate) {
      return NextResponse.json({ error: "Visit date is required" }, { status: 400 });
    }
    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid visit status" }, { status: 400 });
    }

    const completedAt = status === "completed"
      ? (normalizeText(body?.completedAt) || visit.completed_at || new Date().toISOString())
      : null;

    const rows = await ctx.sql`
      update job_field_visits
      set
        title = ${title},
        details = ${details || null},
        outcome = ${outcome || null},
        assigned_user_id = ${assignedUserId || null}::uuid,
        visit_date = ${visitDate}::date,
        status = ${status}::field_visit_status,
        completed_at = ${completedAt || null}::timestamptz,
        updated_at = now()
      where id = ${params.visitId}
        and job_id = ${access.id}
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
        ${`Field visit updated: ${title}`}
      )
    `;

    const updated = await ctx.sql`
      select
        v.*,
        assigned.full_name as assigned_user_name,
        creator.full_name as created_by_name
      from job_field_visits v
      left join app_users assigned on assigned.id = v.assigned_user_id
      left join app_users creator on creator.id = v.created_by
      where v.id = ${params.visitId}
      limit 1
    `;

    return NextResponse.json(mapFieldVisitRow(updated[0]));
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to update field visit" }, { status: 500 });
  }
}
