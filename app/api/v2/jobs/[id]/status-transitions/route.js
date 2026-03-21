import { NextResponse } from "next/server";
import { canManageJobOperations, ensureAccessToJob, getRequestContext } from "@/lib/normalized-api";

const VALID_STATUSES = new Set([
  "created",
  "scheduled",
  "install_completed",
  "inspection_scheduled",
  "inspection_passed",
  "inspection_failed",
  "pto_submitted",
  "pto_granted",
  "m1_invoiced",
  "m1_partially_paid",
  "m1_paid",
  "m2_invoiced",
  "m2_partially_paid",
  "paid_in_full",
  "on_hold",
  "cancelled",
]);

function milestoneUpdates(nextStatus, effectiveDate) {
  const updates = {};
  if (!effectiveDate) return updates;
  if (nextStatus === "scheduled") updates.install_scheduled_at = effectiveDate;
  if (nextStatus === "install_completed") updates.install_completed_at = effectiveDate;
  if (nextStatus === "pto_submitted") updates.pto_submitted_at = effectiveDate;
  if (nextStatus === "pto_granted") updates.pto_granted_at = effectiveDate;
  return updates;
}

export async function POST(req, { params }) {
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

  const body = await req.json();
  const nextStatus = String(body?.toStatus || "").trim();
  const note = String(body?.note || "").trim() || null;
  const effectiveDate = body?.effectiveDate || null;

  if (!VALID_STATUSES.has(nextStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const milestone = milestoneUpdates(nextStatus, effectiveDate);

  try {
    await ctx.sql`begin`;
    const rows = await ctx.sql`
      update jobs
      set
        current_status = ${nextStatus}::job_status,
        current_status_changed_at = now(),
        install_scheduled_at = coalesce(${milestone.install_scheduled_at || null}::date, install_scheduled_at),
        install_completed_at = coalesce(${milestone.install_completed_at || null}::date, install_completed_at),
        pto_submitted_at = coalesce(${milestone.pto_submitted_at || null}::date, pto_submitted_at),
        pto_granted_at = coalesce(${milestone.pto_granted_at || null}::date, pto_granted_at),
        updated_at = now()
      where id = ${access.id}
      returning *
    `;

    await ctx.sql`
      insert into job_status_history (
        job_id,
        from_status,
        to_status,
        event_type,
        changed_at,
        note
      )
      values (
        ${access.id},
        null,
        ${nextStatus}::job_status,
        'status_changed'::status_event_type,
        now(),
        ${note}
      )
    `;
    await ctx.sql`commit`;

    return NextResponse.json(rows[0]);
  } catch (error) {
    try { await ctx.sql`rollback`; } catch {}
    return NextResponse.json({ error: error.message || "Failed to transition status" }, { status: 500 });
  }
}
