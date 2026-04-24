import { NextResponse } from "next/server";
import { canManageJobOperations, ensureAccessToJob, getRequestContext } from "@/lib/normalized-api";
import { canTransitionStatus, getAllowedStatusTransitions, getMilestoneUpdates, JOB_STATUS_OPTIONS } from "@/lib/job-workflow";
import { syncWorkflowFollowUpTask } from "@/lib/job-automation";

const VALID_STATUSES = new Set(JOB_STATUS_OPTIONS);

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
  const currentStatus = String(access.current_status || "").trim();

  if (!VALID_STATUSES.has(nextStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  if (nextStatus === currentStatus) {
    return NextResponse.json({ error: "Job is already in that status" }, { status: 400 });
  }

  if (!canTransitionStatus(currentStatus, nextStatus)) {
    const allowedStatuses = getAllowedStatusTransitions(currentStatus);
    return NextResponse.json({
      error: allowedStatuses.length > 0
        ? `Cannot move from ${currentStatus} to ${nextStatus}. Allowed next statuses: ${allowedStatuses.join(", ")}.`
        : `Cannot move a job from ${currentStatus}.`,
      allowedStatuses,
    }, { status: 400 });
  }

  const milestone = getMilestoneUpdates(nextStatus, effectiveDate);

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
        changed_by,
        note
      )
      values (
        ${access.id},
        ${currentStatus}::job_status,
        ${nextStatus}::job_status,
        'status_changed'::status_event_type,
        now(),
        ${ctx.appUser?.id || null},
        ${note}
      )
    `;

    await syncWorkflowFollowUpTask(ctx.sql, access.id, nextStatus, {
      changedBy: ctx.appUser?.id || null,
      effectiveDate,
      ...milestone,
    });
    await ctx.sql`commit`;

    return NextResponse.json(rows[0]);
  } catch (error) {
    try { await ctx.sql`rollback`; } catch {}
    return NextResponse.json({ error: error.message || "Failed to transition status" }, { status: 500 });
  }
}
