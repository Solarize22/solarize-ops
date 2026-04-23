import { NextResponse } from "next/server";
import { canManageJobOperations, ensureAccessToJob, findCompanyUserById, getRequestContext } from "@/lib/normalized-api";
import { isCrmInstalled, mapTaskRow } from "@/lib/job-crm";

const VALID_STATUSES = new Set(["open", "in_progress", "done"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high"]);
const CRM_ASSIGNABLE_ROLES = ["owner", "admin", "ops"];

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
    if (!(await isCrmInstalled(ctx.sql))) {
      return NextResponse.json({ error: "CRM tables are not installed. Apply db/migrations/003_job_crm_workspace.sql first." }, { status: 409 });
    }

    const taskRows = await ctx.sql`
      select *
      from job_follow_up_tasks
      where id = ${params.taskId}
        and job_id = ${access.id}
      limit 1
    `;

    const task = taskRows[0];
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const body = await req.json();
    const title = normalizeText(body?.title) ?? task.title;
    const details = body?.details === undefined ? task.details : normalizeText(body?.details);
    const priority = normalizeText(body?.priority)?.toLowerCase() || task.priority;
    const status = normalizeText(body?.status)?.toLowerCase() || task.status;
    const dueAt = body?.dueAt === undefined ? task.due_at : normalizeText(body?.dueAt);
    const ownerUserId = body?.ownerUserId === undefined ? task.owner_user_id : normalizeText(body?.ownerUserId);
    const ownerProvided = body?.ownerUserId !== undefined;

    if (!title) {
      return NextResponse.json({ error: "Task title is required" }, { status: 400 });
    }
    if (!VALID_PRIORITIES.has(priority)) {
      return NextResponse.json({ error: "Invalid task priority" }, { status: 400 });
    }
    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid task status" }, { status: 400 });
    }
    const owner = ownerProvided && ownerUserId
      ? await findCompanyUserById(ctx.sql, access.company_id, ownerUserId, { roles: CRM_ASSIGNABLE_ROLES })
      : null;
    if (ownerProvided && ownerUserId && !owner) {
      return NextResponse.json({ error: "Selected task owner must be an active ops/admin/owner on this company." }, { status: 400 });
    }

    const rows = await ctx.sql`
      update job_follow_up_tasks
      set
        title = ${title},
        details = ${details || null},
        priority = ${priority}::follow_up_task_priority,
        status = ${status}::follow_up_task_status,
        due_at = ${dueAt || null}::date,
        owner_user_id = ${ownerProvided ? owner?.id || null : task.owner_user_id}::uuid,
        completed_at = case
          when ${status}::follow_up_task_status = 'done' then coalesce(completed_at, now())
          else null
        end,
        updated_at = now()
      where id = ${params.taskId}
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
        ${`CRM follow-up task updated: ${title}`}
      )
    `;

    const updated = await ctx.sql`
      select
        t.*,
        owner.full_name as owner_name,
        creator.full_name as created_by_name
      from job_follow_up_tasks t
      left join app_users owner on owner.id = t.owner_user_id
      left join app_users creator on creator.id = t.created_by
      where t.id = ${params.taskId}
      limit 1
    `;

    return NextResponse.json(mapTaskRow(updated[0]));
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to update follow-up task" }, { status: 500 });
  }
}
