import { NextResponse } from "next/server";
import { canManageJobOperations, getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";
import { findCustomerRowsById, pickPrimaryCustomerJob } from "@/lib/customer-crm";
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
    const title = normalizeText(body?.title);
    const details = normalizeText(body?.details);
    const priority = normalizeText(body?.priority)?.toLowerCase() || "medium";
    const dueAt = normalizeText(body?.dueAt);
    const ownerUserId = normalizeText(body?.ownerUserId);
    const targetJobId = normalizeText(body?.jobId);

    if (!title) {
      return NextResponse.json({ error: "Task title is required" }, { status: 400 });
    }
    if (!VALID_PRIORITIES.has(priority)) {
      return NextResponse.json({ error: "Invalid task priority" }, { status: 400 });
    }

    const targetJob = (targetJobId
      ? matchingJobs.find((row) => row.id === targetJobId || row.job_number === targetJobId)
      : null) || pickPrimaryCustomerJob(matchingJobs);

    if (!targetJob) {
      return NextResponse.json({ error: "No eligible job found for this customer" }, { status: 404 });
    }

    const inserted = await ctx.sql`
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
        ${targetJob.id},
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
        where id = ${targetJob.id}
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
        ${targetJob.id},
        null,
        ${targetJob.current_status}::job_status,
        'note'::status_event_type,
        now(),
        ${ctx.appUser?.id || null},
        ${`Customer relationship task created: ${title}`}
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
      where t.id = ${inserted[0].id}
      limit 1
    `;

    return NextResponse.json({
      ...mapTaskRow(created[0]),
      jobNumber: targetJob.job_number,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to create customer task" }, { status: 500 });
  }
}
