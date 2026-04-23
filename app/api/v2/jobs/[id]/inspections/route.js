import { NextResponse } from "next/server";
import { canManageJobOperations, ensureAccessToJob, getRequestContext } from "@/lib/normalized-api";
import { canTransitionStatus } from "@/lib/job-workflow";

const VALID_TYPES = new Set(["electrical", "building", "final", "other"]);
const VALID_RESULTS = new Set(["scheduled", "passed", "failed", "cancelled"]);

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

    const rows = await ctx.sql`
      select *
      from inspections
      where job_id = ${access.id}
      order by scheduled_at asc nulls last, created_at asc
    `;

    return NextResponse.json(rows.map((row) => ({
      id: row.id,
      inspectionType: row.inspection_type,
      scheduledAt: row.scheduled_at,
      completedAt: row.completed_at,
      result: row.result,
      inspectorName: row.inspector_name,
      authorityName: row.authority_name,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load inspections" }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  let ctx;
  try {
    ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageJobOperations(ctx.appUser)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const access = await ensureAccessToJob(ctx.sql, params.id, ctx.appUser);
    if (access === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const inspectionType = normalizeText(body?.inspectionType)?.toLowerCase() || "final";
    const result = normalizeText(body?.result)?.toLowerCase() || "scheduled";
    const scheduledAt = normalizeText(body?.scheduledAt);
    const completedAt = result === "passed" || result === "failed"
      ? (normalizeText(body?.completedAt) || new Date().toISOString())
      : null;
    const inspectorName = normalizeText(body?.inspectorName);
    const authorityName = normalizeText(body?.authorityName);
    const notes = normalizeText(body?.notes);

    if (!VALID_TYPES.has(inspectionType)) {
      return NextResponse.json({ error: "Invalid inspection type" }, { status: 400 });
    }
    if (!VALID_RESULTS.has(result)) {
      return NextResponse.json({ error: "Invalid inspection result" }, { status: 400 });
    }
    if (result === "scheduled" && !scheduledAt) {
      return NextResponse.json({ error: "Scheduled inspections need a scheduled date and time" }, { status: 400 });
    }

    await ctx.sql`begin`;

    const rows = await ctx.sql`
      insert into inspections (
        job_id,
        inspection_type,
        scheduled_at,
        completed_at,
        result,
        inspector_name,
        authority_name,
        notes,
        created_at,
        updated_at
      )
      values (
        ${access.id},
        ${inspectionType}::inspection_type,
        ${scheduledAt || null}::timestamptz,
        ${completedAt || null}::timestamptz,
        ${result}::inspection_result,
        ${inspectorName || null},
        ${authorityName || null},
        ${notes || null},
        now(),
        now()
      )
      returning *
    `;

    const nextStatus = result === "scheduled"
      ? "inspection_scheduled"
      : result === "passed"
        ? "inspection_passed"
        : result === "failed"
          ? "inspection_failed"
          : null;

    if (nextStatus && nextStatus !== access.current_status && canTransitionStatus(access.current_status, nextStatus)) {
      await ctx.sql`
        update jobs
        set
          current_status = ${nextStatus}::job_status,
          current_status_changed_at = now(),
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
          related_inspection_id,
          note
        )
        values (
          ${access.id},
          ${access.current_status}::job_status,
          ${nextStatus}::job_status,
          'status_changed'::status_event_type,
          now(),
          ${ctx.appUser?.id || null},
          ${rows[0].id},
          ${notes || `Inspection recorded: ${result}`}
        )
      `;
    } else {
      await ctx.sql`
        insert into job_status_history (
          job_id,
          from_status,
          to_status,
          event_type,
          changed_at,
          changed_by,
          related_inspection_id,
          note
        )
        values (
          ${access.id},
          null,
          ${access.current_status}::job_status,
          'note'::status_event_type,
          now(),
          ${ctx.appUser?.id || null},
          ${rows[0].id},
          ${notes || `Inspection recorded: ${result}`}
        )
      `;
    }

    await ctx.sql`commit`;

    return NextResponse.json({
      id: rows[0].id,
      inspectionType: rows[0].inspection_type,
      scheduledAt: rows[0].scheduled_at,
      completedAt: rows[0].completed_at,
      result: rows[0].result,
      inspectorName: rows[0].inspector_name,
      authorityName: rows[0].authority_name,
      notes: rows[0].notes,
      createdAt: rows[0].created_at,
      updatedAt: rows[0].updated_at,
    }, { status: 201 });
  } catch (error) {
    try { await ctx.sql`rollback`; } catch {}
    return NextResponse.json({ error: error.message || "Failed to create inspection" }, { status: 500 });
  }
}
