import { NextResponse } from "next/server";
import { isFieldTrackingInstalled } from "@/lib/field-tracking";
import { syncWorkflowFollowUpTask } from "@/lib/job-automation";
import { canTransitionStatus } from "@/lib/job-workflow";
import { canManageJobOperations, getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function asDateTime(value) {
  const normalized = normalizeDate(value);
  return normalized ? `${normalized}T12:00:00.000Z` : null;
}

function buildEventNote(draft) {
  const parts = [
    "Imported from SiteCapture event CSV",
    draft?.event?.title || null,
    draft?.event?.eventDate ? `for ${draft.event.eventDate}` : null,
    draft?.sourceRow ? `(source row ${draft.sourceRow})` : null,
  ].filter(Boolean);

  return parts.join(" ");
}

function sortDrafts(drafts) {
  return [...drafts].sort((left, right) => {
    const leftDate = String(left?.event?.eventDate || "");
    const rightDate = String(right?.event?.eventDate || "");
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    return Number(left?.sourceRow || 0) - Number(right?.sourceRow || 0);
  });
}

async function loadJobsByNumbers(sql, companyId, jobNumbers) {
  if (!jobNumbers.length) return new Map();

  const rows = await sql`
    select
      id,
      company_id,
      job_number,
      customer_name,
      current_status,
      install_scheduled_at,
      install_completed_at,
      site_survey_at
    from jobs
    where company_id = ${companyId}
      and job_number = any(${jobNumbers}::text[])
  `;

  return new Map(rows.map((row) => [row.job_number, row]));
}

async function recordJobHistory(sql, values) {
  await sql`
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
      ${values.jobId},
      ${values.fromStatus || null}::job_status,
      ${values.toStatus}::job_status,
      ${values.eventType || "note"}::status_event_type,
      now(),
      ${values.changedBy || null}::uuid,
      ${values.relatedInspectionId || null}::uuid,
      ${values.note || null}
    )
  `;
}

async function maybeAdvanceJobStatus(sql, job, nextStatus, actorId, options = {}) {
  if (!job?.id || !nextStatus || !canTransitionStatus(job.current_status, nextStatus)) {
    return job;
  }

  const rows = await sql`
    update jobs
    set
      current_status = ${nextStatus}::job_status,
      current_status_changed_at = now(),
      updated_at = now()
    where id = ${job.id}
    returning
      id,
      company_id,
      job_number,
      customer_name,
      current_status,
      install_scheduled_at,
      install_completed_at,
      site_survey_at
  `;

  await recordJobHistory(sql, {
    jobId: job.id,
    fromStatus: job.current_status,
    toStatus: nextStatus,
    eventType: "status_changed",
    changedBy: actorId,
    relatedInspectionId: options.relatedInspectionId,
    note: options.note || buildEventNote(options.draft),
  });

  await syncWorkflowFollowUpTask(sql, job.id, nextStatus, {
    changedBy: actorId,
    effectiveDate: options.effectiveDate,
    inspectionScheduledAt: options.inspectionScheduledAt,
    inspectionCompletedAt: options.inspectionCompletedAt,
  });

  return rows[0] || job;
}

async function resolveInspectionRecord(sql, jobId, inspectionType, eventDate) {
  if (!eventDate) return null;

  const rows = await sql`
    select *
    from inspections
    where job_id = ${jobId}
      and inspection_type = ${inspectionType}::inspection_type
      and (
        scheduled_at::date = ${eventDate}::date
        or completed_at::date = ${eventDate}::date
      )
    order by created_at desc
    limit 1
  `;

  return rows[0] || null;
}

async function upsertInspectionEvent(sql, job, draft, actorId) {
  const event = draft.event;
  const eventDateTime = asDateTime(event.eventDate);
  const completedAt = event.result === "passed" || event.result === "failed"
    ? (asDateTime(event.completedAt || event.eventDate) || new Date().toISOString())
    : null;
  const scheduledAt = event.result === "passed" || event.result === "failed" || event.result === "cancelled"
    ? (eventDateTime || null)
    : (eventDateTime || null);
  const existing = await resolveInspectionRecord(sql, job.id, event.inspectionType || "final", event.eventDate);

  let inspectionId = existing?.id || null;
  if (existing) {
    await sql`
      update inspections
      set
        scheduled_at = ${scheduledAt}::timestamptz,
        completed_at = ${completedAt}::timestamptz,
        result = ${event.result || "scheduled"}::inspection_result,
        inspector_name = ${normalizeText(event.inspectorName)} ,
        authority_name = ${normalizeText(event.authorityName)} ,
        notes = ${normalizeText(event.notes)} ,
        updated_at = now()
      where id = ${existing.id}
    `;
  } else {
    const inserted = await sql`
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
        ${job.id},
        ${event.inspectionType || "final"}::inspection_type,
        ${scheduledAt}::timestamptz,
        ${completedAt}::timestamptz,
        ${event.result || "scheduled"}::inspection_result,
        ${normalizeText(event.inspectorName)},
        ${normalizeText(event.authorityName)},
        ${normalizeText(event.notes)},
        now(),
        now()
      )
      returning id
    `;
    inspectionId = inserted[0]?.id || null;
  }

  const nextStatus =
    event.result === "passed"
      ? "inspection_passed"
      : event.result === "failed"
        ? "inspection_failed"
        : event.result === "scheduled"
          ? "inspection_scheduled"
          : null;

  const nextJob = nextStatus
    ? await maybeAdvanceJobStatus(sql, job, nextStatus, actorId, {
        draft,
        relatedInspectionId: inspectionId,
        note: buildEventNote(draft),
        effectiveDate: event.eventDate,
        inspectionScheduledAt: event.result === "scheduled" ? event.eventDate : null,
        inspectionCompletedAt: event.result === "passed" || event.result === "failed" ? event.eventDate : null,
      })
    : job;

  if (!nextStatus) {
    await recordJobHistory(sql, {
      jobId: job.id,
      toStatus: job.current_status,
      changedBy: actorId,
      relatedInspectionId: inspectionId,
      note: buildEventNote(draft),
    });
  }

  return { job: nextJob, inspectionId };
}

async function resolveFieldVisitRecord(sql, jobId, eventDate, title) {
  if (!eventDate) return null;

  const rows = await sql`
    select *
    from job_field_visits
    where job_id = ${jobId}
      and visit_type = 'site_visit'::field_visit_type
      and visit_date = ${eventDate}::date
      and (${normalizeText(title)}::text is null or title = ${normalizeText(title)})
    order by created_at desc
    limit 1
  `;

  return rows[0] || null;
}

async function upsertSiteVisitEvent(sql, job, draft, actorId) {
  const event = draft.event;
  const existing = await resolveFieldVisitRecord(sql, job.id, event.eventDate, event.title);
  const completedAt = event.result === "completed"
    ? (asDateTime(event.completedAt || event.eventDate) || new Date().toISOString())
    : null;

  let visitId = existing?.id || null;
  if (existing) {
    await sql`
      update job_field_visits
      set
        status = ${event.result || "scheduled"}::field_visit_status,
        visit_date = ${event.eventDate}::date,
        completed_at = ${completedAt}::timestamptz,
        title = ${normalizeText(event.title) || "Site visit"},
        details = ${normalizeText(event.notes)},
        outcome = ${normalizeText(event.outcome)},
        updated_at = now()
      where id = ${existing.id}
    `;
  } else {
    const inserted = await sql`
      insert into job_field_visits (
        job_id,
        visit_type,
        status,
        visit_date,
        completed_at,
        title,
        details,
        outcome,
        created_by,
        created_at,
        updated_at
      )
      values (
        ${job.id},
        'site_visit'::field_visit_type,
        ${event.result || "scheduled"}::field_visit_status,
        ${event.eventDate}::date,
        ${completedAt}::timestamptz,
        ${normalizeText(event.title) || "Site visit"},
        ${normalizeText(event.notes)},
        ${normalizeText(event.outcome)},
        ${actorId || null}::uuid,
        now(),
        now()
      )
      returning id
    `;
    visitId = inserted[0]?.id || null;
  }

  const refreshedRows = await sql`
    update jobs
    set
      site_survey_at = coalesce(site_survey_at, ${event.eventDate}::date),
      updated_at = now()
    where id = ${job.id}
    returning
      id,
      company_id,
      job_number,
      customer_name,
      current_status,
      install_scheduled_at,
      install_completed_at,
      site_survey_at
  `;

  await recordJobHistory(sql, {
    jobId: job.id,
    toStatus: job.current_status,
    changedBy: actorId,
    note: buildEventNote(draft),
  });

  return { job: refreshedRows[0] || job, visitId };
}

export async function PUT(req) {
  const ctx = await getRequestContext();
  if (!ctx.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageJobOperations(ctx.appUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const company = await getNormalizedCompany(ctx.sql, ctx.appUser);
  if (!company) {
    return NextResponse.json({ error: "No company found" }, { status: 400 });
  }

  const body = await req.json();
  const drafts = Array.isArray(body) ? body : Array.isArray(body?.events) ? body.events : [];
  const eventDrafts = drafts.filter((draft) => draft?.importType === "event" && draft?.event?.kind);
  if (!eventDrafts.length) {
    return NextResponse.json({ updated: 0, total: 0, failed: [], notFound: [] });
  }

  const hasSiteVisits = eventDrafts.some((draft) => draft.event.kind === "site_visit");
  const fieldTrackingInstalled = hasSiteVisits ? await isFieldTrackingInstalled(ctx.sql) : true;

  const jobNumbers = [...new Set(eventDrafts.map((draft) => String(draft.jobNumber || "").trim()).filter(Boolean))];
  const jobsByNumber = await loadJobsByNumbers(ctx.sql, company.id, jobNumbers);

  let updated = 0;
  const failed = [];
  const notFound = [];

  for (const draft of sortDrafts(eventDrafts)) {
    const job = jobsByNumber.get(String(draft.jobNumber || "").trim());
    if (!job) {
      notFound.push(draft.jobNumber);
      continue;
    }

    if (draft.event.kind === "site_visit" && !fieldTrackingInstalled) {
      failed.push({
        id: draft.jobNumber,
        customer: draft.customerName,
        reason: "Field tracking tables are not installed, so site visits cannot be imported yet",
      });
      continue;
    }

    try {
      await ctx.sql`begin`;
      const result = draft.event.kind === "inspection"
        ? await upsertInspectionEvent(ctx.sql, job, draft, ctx.appUser?.id)
        : await upsertSiteVisitEvent(ctx.sql, job, draft, ctx.appUser?.id);
      await ctx.sql`commit`;

      jobsByNumber.set(job.job_number, result.job || job);
      updated++;
    } catch (error) {
      try { await ctx.sql`rollback`; } catch {}
      failed.push({
        id: draft.jobNumber,
        customer: draft.customerName,
        reason: error.message || "Event import failed",
      });
    }
  }

  return NextResponse.json({
    updated,
    total: eventDrafts.length,
    failed,
    notFound,
  });
}
