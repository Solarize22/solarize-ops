import { NextResponse } from "next/server";
import { canManageJobOperations, ensureAccessToJob, getRequestContext } from "@/lib/normalized-api";
import { isCrmInstalled, mapTaskRow } from "@/lib/job-crm";

const VALID_PRIORITIES = new Set(["low", "medium", "high"]);

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
    const title = normalizeText(body?.title);
    const details = normalizeText(body?.details);
    const priority = normalizeText(body?.priority)?.toLowerCase() || "medium";
    const dueAt = normalizeText(body?.dueAt);
    const ownerUserId = normalizeText(body?.ownerUserId);

    if (!title) {
      return NextResponse.json({ error: "Task title is required" }, { status: 400 });
    }
    if (!VALID_PRIORITIES.has(priority)) {
      return NextResponse.json({ error: "Invalid task priority" }, { status: 400 });
    }

    const rows = await ctx.sql`
      insert into job_follow_up_tasks (
        job_id,
        title,
        details,
        status,
        priority,
        due_at,
        owner_user_id,
        created_by,
        created_at,
        updated_at
      )
      values (
        ${access.id},
        ${title},
        ${details || null},
        'open'::follow_up_task_status,
        ${priority}::follow_up_task_priority,
        ${dueAt || null}::date,
        ${ownerUserId || null}::uuid,
        ${ctx.appUser?.id || null},
        now(),
        now()
      )
      returning *
    `;

    if (dueAt) {
      await ctx.sql`
        update jobs
        set
          next_follow_up_at = case
            when next_follow_up_at is null then ${dueAt}::date
            when ${dueAt}::date < next_follow_up_at then ${dueAt}::date
            else next_follow_up_at
          end,
          updated_at = now()
        where id = ${access.id}
      `;
    }

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
        ${`CRM follow-up task created: ${title}`}
      )
    `;

    const created = await ctx.sql`
      select
        t.*,
        owner.full_name as owner_name,
        creator.full_name as created_by_name
      from job_follow_up_tasks t
      left join app_users owner on owner.id = t.owner_user_id
      left join app_users creator on creator.id = t.created_by
      where t.id = ${rows[0].id}
      limit 1
    `;

    return NextResponse.json(mapTaskRow(created[0]), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to create follow-up task" }, { status: 500 });
  }
}
