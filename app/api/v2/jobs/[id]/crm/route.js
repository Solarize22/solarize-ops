import { NextResponse } from "next/server";
import { canManageJobOperations, ensureAccessToJob, findCompanyUserById, getRequestContext } from "@/lib/normalized-api";
import { emptyCrmPayload, isCrmInstalled, mapContactLogRow, mapTaskRow } from "@/lib/job-crm";

const CRM_ASSIGNABLE_ROLES = ["owner", "admin", "ops"];

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeDate(value) {
  const text = normalizeText(value);
  return text || null;
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

    if (!(await isCrmInstalled(ctx.sql))) {
      return NextResponse.json(emptyCrmPayload());
    }

    const [jobRows, contactRows, taskRows] = await Promise.all([
      ctx.sql`
        select
          j.last_contact_at,
          j.next_follow_up_at,
          j.follow_up_owner_id,
          owner.full_name as follow_up_owner_name
        from jobs j
        left join app_users owner on owner.id = j.follow_up_owner_id
        where j.id = ${access.id}
        limit 1
      `,
      ctx.sql`
        select
          c.*,
          u.full_name as created_by_name
        from job_contact_log c
        left join app_users u on u.id = c.created_by
        where c.job_id = ${access.id}
        order by c.contacted_at desc, c.created_at desc
        limit 20
      `,
      ctx.sql`
        select
          t.*,
          owner.full_name as owner_name,
          creator.full_name as created_by_name
        from job_follow_up_tasks t
        left join app_users owner on owner.id = t.owner_user_id
        left join app_users creator on creator.id = t.created_by
        where t.job_id = ${access.id}
        order by
          case when t.status = 'done' then 1 else 0 end asc,
          t.due_at asc nulls last,
          t.created_at desc
      `,
    ]);

    const job = jobRows[0];
    const tasks = taskRows.map(mapTaskRow);
    const now = new Date().toISOString().slice(0, 10);

    return NextResponse.json({
      installed: true,
      summary: {
        lastContactAt: job?.last_contact_at || null,
        nextFollowUpAt: job?.next_follow_up_at || null,
        followUpOwnerId: job?.follow_up_owner_id || null,
        followUpOwnerName: job?.follow_up_owner_name || null,
        openTaskCount: tasks.filter((task) => task.status !== "done").length,
        overdueTaskCount: tasks.filter((task) => task.status !== "done" && task.dueAt && task.dueAt < now).length,
      },
      contactLog: contactRows.map(mapContactLogRow),
      tasks,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load CRM workspace" }, { status: 500 });
  }
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

    const body = await req.json();
    const lastContactAt = normalizeText(body?.lastContactAt);
    const nextFollowUpAt = normalizeDate(body?.nextFollowUpAt);
    const followUpOwnerId = normalizeText(body?.followUpOwnerId);
    const followUpOwner = followUpOwnerId
      ? await findCompanyUserById(ctx.sql, access.company_id, followUpOwnerId, { roles: CRM_ASSIGNABLE_ROLES })
      : null;

    if (followUpOwnerId && !followUpOwner) {
      return NextResponse.json({ error: "Selected follow-up owner must be an active ops/admin/owner on this company." }, { status: 400 });
    }

    const rows = await ctx.sql`
      update jobs
      set
        last_contact_at = ${lastContactAt || null}::timestamptz,
        next_follow_up_at = ${nextFollowUpAt || null}::date,
        follow_up_owner_id = ${followUpOwner?.id || null}::uuid,
        updated_at = now()
      where id = ${access.id}
      returning last_contact_at, next_follow_up_at, follow_up_owner_id
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
        ${"Updated CRM follow-up details"}
      )
    `;

    return NextResponse.json(rows[0]);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to update CRM workspace" }, { status: 500 });
  }
}
