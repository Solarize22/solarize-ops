import { isCrmInstalled } from "@/lib/job-crm";

export const WORKFLOW_AUTOMATION_MARKER = "[workflow-automation]";

const TERMINAL_STATUSES = new Set(["paid_in_full", "cancelled"]);

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function addDays(baseDate, days) {
  const base = normalizeDate(baseDate) || new Date().toISOString().slice(0, 10);
  const parsed = new Date(`${base}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function automationDetails(text) {
  return `${WORKFLOW_AUTOMATION_MARKER}\n${text}`;
}

function buildTaskTemplate(nextStatus, context = {}) {
  switch (nextStatus) {
    case "scheduled":
      return {
        title: "Confirm install readiness",
        details: automationDetails("Confirm the crew, homeowner, and site are ready for the scheduled install date."),
        priority: "high",
        dueAt: normalizeDate(context.effectiveDate || context.installScheduledAt) || addDays(null, 1),
      };
    case "install_completed":
      return {
        title: "Schedule final inspection",
        details: automationDetails("Line up the inspection appointment and confirm the homeowner knows what happens next."),
        priority: "high",
        dueAt: addDays(context.effectiveDate || context.installCompletedAt, 1),
      };
    case "inspection_scheduled":
      return {
        title: "Confirm inspection result",
        details: automationDetails("Track the scheduled inspection, log the outcome, and update the homeowner right away."),
        priority: "high",
        dueAt: normalizeDate(context.inspectionScheduledAt || context.effectiveDate) || addDays(null, 1),
      };
    case "inspection_failed":
      return {
        title: "Resolve failed inspection items",
        details: automationDetails("Coordinate corrections, reschedule the inspection, and keep the homeowner informed."),
        priority: "high",
        dueAt: addDays(context.effectiveDate || context.inspectionCompletedAt, 1),
      };
    case "inspection_passed":
      return {
        title: "Submit PTO packet",
        details: automationDetails("Move the job into utility approval quickly now that inspection passed."),
        priority: "high",
        dueAt: addDays(context.effectiveDate || context.inspectionCompletedAt, 1),
      };
    case "pto_submitted":
      return {
        title: "Follow up with utility on PTO",
        details: automationDetails("Track PTO approval with the utility and keep the homeowner updated on timing."),
        priority: "medium",
        dueAt: addDays(context.effectiveDate || context.ptoSubmittedAt, 7),
      };
    case "pto_granted":
      return {
        title: "Send final billing and closeout",
        details: automationDetails("PTO is granted. Send final billing, confirm the customer handoff, and close the loop cleanly."),
        priority: "high",
        dueAt: addDays(context.effectiveDate || context.ptoGrantedAt, 1),
      };
    case "m1_invoiced":
      return {
        title: "Collect M1 payment",
        details: automationDetails("Follow up on the newly issued M1 invoice and confirm the homeowner knows the due date."),
        priority: "high",
        dueAt: normalizeDate(context.invoiceDueAt) || addDays(context.effectiveDate, 3),
      };
    case "m1_partially_paid":
      return {
        title: "Collect remaining M1 balance",
        details: automationDetails("The first milestone invoice is only partially paid. Follow up on the remaining balance."),
        priority: "high",
        dueAt: normalizeDate(context.invoiceDueAt) || addDays(context.effectiveDate, 2),
      };
    case "m1_paid":
      return {
        title: "Prepare final billing",
        details: automationDetails("M1 is closed out. Get the final billing package ready so the job keeps moving."),
        priority: "medium",
        dueAt: addDays(context.effectiveDate, 1),
      };
    case "m2_invoiced":
      return {
        title: "Collect final payment",
        details: automationDetails("The final invoice is out. Follow through until the remaining balance is resolved."),
        priority: "high",
        dueAt: normalizeDate(context.invoiceDueAt) || addDays(context.effectiveDate, 3),
      };
    case "m2_partially_paid":
      return {
        title: "Collect remaining final balance",
        details: automationDetails("The final invoice is partially paid. Close the gap and complete the billing finish."),
        priority: "high",
        dueAt: normalizeDate(context.invoiceDueAt) || addDays(context.effectiveDate, 2),
      };
    case "on_hold":
      return {
        title: "Review blocker and recovery plan",
        details: automationDetails("This job is on hold. Confirm the blocker, assign ownership, and set the recovery plan."),
        priority: "high",
        dueAt: addDays(context.effectiveDate, 1),
      };
    default:
      return null;
  }
}

async function getJobAutomationContext(sql, jobId) {
  const rows = await sql`
    select
      id,
      job_number,
      customer_name,
      current_status,
      rep_user_id,
      follow_up_owner_id,
      install_scheduled_at,
      install_completed_at,
      pto_submitted_at,
      pto_granted_at
    from jobs
    where id = ${jobId}
    limit 1
  `;
  return rows[0] || null;
}

export async function syncWorkflowFollowUpTask(sql, jobId, nextStatus, options = {}) {
  if (!jobId || !nextStatus) return null;
  if (!(await isCrmInstalled(sql))) return null;

  const job = await getJobAutomationContext(sql, jobId);
  if (!job) return null;

  const nextTask = buildTaskTemplate(nextStatus, options);
  const ownerUserId = job.follow_up_owner_id || job.rep_user_id || null;
  const automationPattern = `%${WORKFLOW_AUTOMATION_MARKER}%`;

  let task = null;
  let action = null;

  if (TERMINAL_STATUSES.has(nextStatus) || !nextTask) {
    const clearedRows = await sql`
      update job_follow_up_tasks
      set
        status = 'done'::follow_up_task_status,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
      where job_id = ${jobId}
        and status <> 'done'
        and coalesce(details, '') like ${automationPattern}
      returning id
    `;

    if (clearedRows.length > 0) {
      await sql`
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
          ${jobId},
          null,
          ${job.current_status}::job_status,
          'note'::status_event_type,
          now(),
          ${options.changedBy || null},
          ${`Workflow next step cleared: ${String(nextStatus).replace(/_/g, " ")}`}
        )
      `;
    }

    return null;
  }

  const matchingRows = await sql`
    select *
    from job_follow_up_tasks
    where job_id = ${jobId}
      and status <> 'done'
      and title = ${nextTask.title}
      and coalesce(details, '') like ${automationPattern}
    order by due_at asc nulls last, created_at asc
    limit 1
  `;

  if (matchingRows[0]) {
    const matchingTask = matchingRows[0];
    const refreshed = await sql`
      update job_follow_up_tasks
      set
        details = ${nextTask.details},
        priority = ${nextTask.priority}::follow_up_task_priority,
        due_at = ${nextTask.dueAt || null}::date,
        owner_user_id = ${ownerUserId}::uuid,
        status = case
          when status = 'done'::follow_up_task_status then 'open'::follow_up_task_status
          else status
        end,
        completed_at = null,
        updated_at = now()
      where id = ${matchingTask.id}
      returning *
    `;
    task = refreshed[0];
    action = "refreshed";

    await sql`
      update job_follow_up_tasks
      set
        status = 'done'::follow_up_task_status,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
      where job_id = ${jobId}
        and id <> ${matchingTask.id}
        and status <> 'done'
        and coalesce(details, '') like ${automationPattern}
    `;
  } else {
    await sql`
      update job_follow_up_tasks
      set
        status = 'done'::follow_up_task_status,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
      where job_id = ${jobId}
        and status <> 'done'
        and coalesce(details, '') like ${automationPattern}
    `;

    const createdRows = await sql`
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
        ${jobId},
        ${nextTask.title},
        ${nextTask.details},
        'open'::follow_up_task_status,
        ${nextTask.priority}::follow_up_task_priority,
        ${nextTask.dueAt || null}::date,
        ${ownerUserId}::uuid,
        ${options.changedBy || null},
        now(),
        now()
      )
      returning *
    `;
    task = createdRows[0];
    action = "created";
  }

  await sql`
    update jobs
    set
      follow_up_owner_id = coalesce(follow_up_owner_id, ${ownerUserId}::uuid),
      next_follow_up_at = case
        when ${nextTask.dueAt || null}::date is null then next_follow_up_at
        when next_follow_up_at is null then ${nextTask.dueAt || null}::date
        when ${nextTask.dueAt || null}::date < next_follow_up_at then ${nextTask.dueAt || null}::date
        else next_follow_up_at
      end,
      updated_at = now()
    where id = ${jobId}
  `;

  await sql`
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
      ${jobId},
      null,
      ${job.current_status}::job_status,
      'note'::status_event_type,
      now(),
      ${options.changedBy || null},
      ${`Workflow next step set: ${nextTask.title}${action === "refreshed" ? " (refreshed)" : ""}`}
    )
  `;

  return task;
}
