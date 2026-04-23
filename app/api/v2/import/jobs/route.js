import { NextResponse } from "next/server";
import { canManageJobOperations, getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";
import { syncCustomerForJob } from "@/lib/customer-crm";

function dollarsToCents(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

async function findUserIdByName(sql, companyId, fullName) {
  if (!hasValue(fullName)) return null;
  const rows = await sql`
    select id
    from app_users
    where company_id = ${companyId}
      and lower(full_name) = lower(${String(fullName).trim()})
    limit 1
  `;
  return rows[0]?.id || null;
}

async function syncCrewAssignments(sql, jobId, companyId, crewNames = []) {
  await sql`delete from job_crew_assignments where job_id = ${jobId}`;
  for (const crewName of crewNames) {
    const userId = await findUserIdByName(sql, companyId, crewName);
    if (userId) {
      await sql`
        insert into job_crew_assignments (job_id, user_id, assignment_role, created_at)
        values (${jobId}, ${userId}, 'crew', now())
        on conflict (job_id, user_id, assignment_role) do nothing
      `;
    }
  }
}

async function logImportEvent(sql, { jobId, actorId, note, toStatus = null, eventType = "note", relatedInvoiceId = null, relatedPaymentId = null }) {
  await sql`
    insert into job_status_history (
      job_id,
      from_status,
      to_status,
      event_type,
      changed_at,
      changed_by,
      related_invoice_id,
      related_payment_id,
      note
    )
    values (
      ${jobId},
      null,
      ${toStatus || "created"}::job_status,
      ${eventType}::status_event_type,
      now(),
      ${actorId || null},
      ${relatedInvoiceId},
      ${relatedPaymentId},
      ${note}
    )
  `;
}

async function syncInspectionFromImport(sql, { jobId, completedAt, actorId }) {
  if (!hasValue(completedAt)) return;

  const existingRows = await sql`
    select id
    from inspections
    where job_id = ${jobId}
      and inspection_type = 'final'::inspection_type
    order by created_at asc
    limit 1
  `;

  let inspectionId = existingRows[0]?.id || null;
  if (inspectionId) {
    await sql`
      update inspections
      set
        completed_at = ${completedAt}::timestamptz,
        result = 'passed'::inspection_result,
        updated_at = now()
      where id = ${inspectionId}
    `;
  } else {
    const inserted = await sql`
      insert into inspections (
        job_id,
        inspection_type,
        completed_at,
        result,
        notes,
        created_at,
        updated_at
      )
      values (
        ${jobId},
        'final'::inspection_type,
        ${completedAt}::timestamptz,
        'passed'::inspection_result,
        'Imported inspection result',
        now(),
        now()
      )
      returning id
    `;
    inspectionId = inserted[0].id;
  }

  await logImportEvent(sql, {
    jobId,
    actorId,
    toStatus: "inspection_passed",
    eventType: "inspection_passed",
    note: "Imported inspection result",
  });
}

async function upsertInvoiceFromImport(sql, {
  companyId,
  jobId,
  financer,
  invoiceType,
  invoiceNumber,
  amount,
  paid,
  applyNumber,
  applyAmount,
  applyPaid,
  actorId,
}) {
  const shouldTouchInvoice = applyNumber || applyAmount || applyPaid;
  if (!shouldTouchInvoice) return null;

  const totalCents = dollarsToCents(amount);
  const existingRows = await sql`
    select *
    from invoices
    where job_id = ${jobId}
      and invoice_type = ${invoiceType}::invoice_type
    limit 1
  `;
  const existing = existingRows[0] || null;

  if (!existing && !applyNumber && !applyAmount && applyPaid) {
    throw new Error(`${invoiceType.toUpperCase()} paid flag cannot be imported without an invoice amount or number`);
  }

  const nextInvoiceNumber =
    (applyNumber && hasValue(invoiceNumber) ? String(invoiceNumber).trim() : existing?.invoice_number) ||
    `IMP-${invoiceType.toUpperCase()}-${jobId}`;

  const nextTotalCents =
    applyAmount ? totalCents : (existing?.total_cents ?? 0);

  if (!existing && nextTotalCents <= 0) {
    return null;
  }

  const nextFinancer = hasValue(financer) ? financer : (existing?.financer || null);
  const nextBalanceCents = applyPaid
    ? (paid ? 0 : nextTotalCents)
    : (existing?.balance_cents ?? nextTotalCents);
  const nextStatus = applyPaid
    ? (paid ? "paid" : "issued")
    : (existing?.status || "issued");

  let invoiceId = existing?.id || null;
  if (existing) {
    await sql`
      update invoices
      set
        invoice_number = ${nextInvoiceNumber},
        subtotal_cents = ${nextTotalCents},
        total_cents = ${nextTotalCents},
        balance_cents = ${nextBalanceCents},
        status = ${nextStatus}::invoice_status,
        financer = ${nextFinancer},
        updated_at = now()
      where id = ${existing.id}
    `;
    await sql`delete from invoice_line_items where invoice_id = ${existing.id}`;
    invoiceId = existing.id;
  } else {
    const inserted = await sql`
      insert into invoices (
        company_id,
        job_id,
        invoice_number,
        invoice_type,
        status,
        subtotal_cents,
        total_cents,
        balance_cents,
        financer,
        created_at,
        updated_at
      )
      values (
        ${companyId},
        ${jobId},
        ${nextInvoiceNumber},
        ${invoiceType}::invoice_type,
        ${nextStatus}::invoice_status,
        ${nextTotalCents},
        ${nextTotalCents},
        ${nextBalanceCents},
        ${nextFinancer},
        now(),
        now()
      )
      returning id
    `;
    invoiceId = inserted[0].id;
  }

  await sql`
    insert into invoice_line_items (
      invoice_id,
      line_type,
      description,
      amount_cents,
      sort_order,
      created_at
    )
    values (
      ${invoiceId},
      ${invoiceType}::invoice_type,
      ${invoiceType === "adder" ? "Adder" : invoiceType.toUpperCase()},
      ${nextTotalCents},
      1,
      now()
    )
  `;

  if (applyPaid && paid && nextTotalCents > 0) {
    const paymentRows = await sql`
      select p.id
      from payments p
      join payment_allocations pa on pa.payment_id = p.id
      where p.job_id = ${jobId}
        and pa.invoice_id = ${invoiceId}
      limit 1
    `;

    if (!paymentRows.length) {
      const payment = await sql`
        insert into payments (
          company_id,
          job_id,
          payment_reference,
          payment_method,
          status,
          amount_cents,
          source_name,
          notes,
          created_at,
          updated_at
        )
        values (
          ${companyId},
          ${jobId},
          ${`IMPORT-${invoiceType.toUpperCase()}-${nextInvoiceNumber}`},
          'other'::payment_method,
          'settled'::payment_status,
          ${nextTotalCents},
          ${nextFinancer || "import"},
          'Imported paid flag',
          now(),
          now()
        )
        returning id
      `;

      await sql`
        insert into payment_allocations (payment_id, invoice_id, allocated_cents, created_at)
        values (${payment[0].id}, ${invoiceId}, ${nextTotalCents}, now())
      `;

      await logImportEvent(sql, {
        jobId,
        actorId,
        relatedInvoiceId: invoiceId,
        relatedPaymentId: payment[0].id,
        eventType: "payment_received",
        note: `Imported ${invoiceType.toUpperCase()} payment`,
      });
    }
  }

  await logImportEvent(sql, {
    jobId,
    actorId,
    relatedInvoiceId: invoiceId,
    eventType: "invoice_created",
    note: existing ? `Imported updates to ${invoiceType.toUpperCase()} invoice` : `Imported ${invoiceType.toUpperCase()} invoice`,
  });

  return invoiceId;
}

async function createJob(sql, companyId, draft, actorId) {
  await sql`begin`;
  try {
    const repId = await findUserIdByName(sql, companyId, draft.job.rep);
    const inserted = await sql`
      insert into jobs (
        company_id,
        job_number,
        customer_name,
        customer_phone,
        customer_email,
        street_1,
        city,
        state,
        postal_code,
        county,
        contract_type,
        financer,
        contractor,
        partner,
        utility_company,
        rep_user_id,
        system_size_kw,
        panel_count,
        watt_per_panel,
        inverter,
        module,
        battery,
        roof_type,
        contract_signed_at,
        site_survey_at,
        install_scheduled_at,
        install_completed_at,
        pto_granted_at,
        current_status,
        current_status_changed_at,
        notes,
        created_at,
        updated_at
      )
      values (
        ${companyId},
        ${draft.jobNumber},
        ${draft.customerName || "Unknown Customer"},
        ${draft.phone || null},
        ${draft.email || null},
        ${draft.address.street1 || "Unknown Address"},
        ${draft.address.city || "Unknown City"},
        ${draft.address.state || "NA"},
        ${draft.address.postalCode || null},
        ${draft.address.county || null},
        ${draft.job.contractType || null},
        ${draft.job.financer || null},
        ${draft.job.contractor || null},
        ${draft.job.partner || null},
        ${draft.job.utilityCompany || null},
        ${repId},
        ${draft.system.systemSizeKw || null}::numeric,
        ${draft.system.panelCount || null}::integer,
        ${draft.system.wattPerPanel || null}::integer,
        ${draft.system.inverter || null},
        ${draft.system.module || null},
        ${!!draft.system.battery},
        ${draft.system.roofType || null},
        ${draft.milestones.contractSignedAt || null}::date,
        ${draft.milestones.siteSurveyAt || null}::date,
        ${draft.milestones.installScheduledAt || null}::date,
        ${["install_completed", "inspection_scheduled", "inspection_passed", "pto_granted", "m1_invoiced", "m1_paid", "m2_invoiced", "paid_in_full"].includes(draft.derivedStatus)
          ? (draft.milestones.installScheduledAt || null)
          : null}::date,
        ${draft.milestones.ptoGrantedAt || null}::date,
        ${draft.derivedStatus}::job_status,
        now(),
        ${draft.job.notes || null},
        now(),
        now()
      )
      returning id, customer_name, customer_phone, customer_email, street_1, street_2, city, state, postal_code, county
    `;

    const jobId = inserted[0].id;
    await syncCustomerForJob(sql, companyId, jobId, inserted[0]);
    await syncCrewAssignments(sql, jobId, companyId, draft.crew || []);
    await syncInspectionFromImport(sql, {
      jobId,
      completedAt: draft.milestones.inspectionCompletedAt,
      actorId,
    });

    await upsertInvoiceFromImport(sql, {
      companyId,
      jobId,
      financer: draft.job.financer,
      invoiceType: "m1",
      invoiceNumber: draft.financials.m1.invoiceNumber,
      amount: draft.financials.m1.amount,
      paid: draft.financials.m1.paid,
      applyNumber: draft.financials.m1.invoiceNumberProvided,
      applyAmount: draft.financials.m1.amountProvided,
      applyPaid: draft.financials.m1.paidProvided,
      actorId,
    });

    await upsertInvoiceFromImport(sql, {
      companyId,
      jobId,
      financer: draft.job.financer,
      invoiceType: "m2",
      invoiceNumber: draft.financials.m2.invoiceNumber,
      amount: draft.financials.m2.amount,
      paid: draft.financials.m2.paid,
      applyNumber: draft.financials.m2.invoiceNumberProvided,
      applyAmount: draft.financials.m2.amountProvided,
      applyPaid: draft.financials.m2.paidProvided,
      actorId,
    });

    await upsertInvoiceFromImport(sql, {
      companyId,
      jobId,
      financer: draft.job.financer,
      invoiceType: "adder",
      invoiceNumber: null,
      amount: draft.financials.adder.amount,
      paid: false,
      applyNumber: false,
      applyAmount: draft.financials.adder.amountProvided,
      applyPaid: false,
      actorId,
    });

    await logImportEvent(sql, {
      jobId,
      actorId,
      toStatus: draft.derivedStatus,
      eventType: "job_created",
      note: "Imported job from CSV",
    });

    await sql`commit`;
  } catch (error) {
    try { await sql`rollback`; } catch {}
    throw error;
  }
}

async function updateJob(sql, companyId, draft, actorId) {
  await sql`begin`;
  try {
    const rows = await sql`
      select id
      from jobs
      where company_id = ${companyId}
        and job_number = ${draft.jobNumber}
      limit 1
    `;
    if (!rows.length) {
      await sql`rollback`;
      return false;
    }

    const jobId = rows[0].id;
    const repId = draft.provided.rep ? await findUserIdByName(sql, companyId, draft.job.rep) : null;
    const shouldApplyDerivedStatus =
      draft.provided.status ||
      draft.provided.installScheduledAt ||
      draft.provided.inspectionCompletedAt ||
      draft.provided.ptoGrantedAt ||
      draft.financials.m1.provided ||
      draft.financials.m2.provided;

    const updatedRows = await sql`
      update jobs
      set
        customer_name = coalesce(${draft.provided.customerName ? (draft.customerName || null) : null}, customer_name),
        customer_phone = coalesce(${draft.provided.phone ? (draft.phone || null) : null}, customer_phone),
        customer_email = coalesce(${draft.provided.email ? (draft.email || null) : null}, customer_email),
        street_1 = coalesce(${draft.provided.street ? (draft.address.street1 || null) : null}, street_1),
        city = coalesce(${draft.provided.city ? (draft.address.city || null) : null}, city),
        state = coalesce(${draft.provided.state ? (draft.address.state || null) : null}, state),
        postal_code = coalesce(${draft.provided.postalCode ? (draft.address.postalCode || null) : null}, postal_code),
        county = coalesce(${draft.provided.county ? (draft.address.county || null) : null}, county),
        contract_type = coalesce(${draft.provided.contractType ? (draft.job.contractType || null) : null}, contract_type),
        financer = coalesce(${draft.provided.financer ? (draft.job.financer || null) : null}, financer),
        contractor = coalesce(${draft.provided.contractor ? (draft.job.contractor || null) : null}, contractor),
        partner = coalesce(${draft.provided.partner ? (draft.job.partner || null) : null}, partner),
        utility_company = coalesce(${draft.provided.utilityCompany ? (draft.job.utilityCompany || null) : null}, utility_company),
        rep_user_id = coalesce(${draft.provided.rep ? repId : null}, rep_user_id),
        system_size_kw = coalesce(${draft.provided.systemSizeKw ? (draft.system.systemSizeKw || null) : null}::numeric, system_size_kw),
        panel_count = coalesce(${draft.provided.panelCount ? (draft.system.panelCount || null) : null}::integer, panel_count),
        watt_per_panel = coalesce(${draft.provided.wattPerPanel ? (draft.system.wattPerPanel || null) : null}::integer, watt_per_panel),
        inverter = coalesce(${draft.provided.inverter ? (draft.system.inverter || null) : null}, inverter),
        module = coalesce(${draft.provided.module ? (draft.system.module || null) : null}, module),
        battery = coalesce(${draft.provided.battery ? draft.system.battery : null}::boolean, battery),
        roof_type = coalesce(${draft.provided.roofType ? (draft.system.roofType || null) : null}, roof_type),
        contract_signed_at = coalesce(${draft.provided.contractSignedAt ? (draft.milestones.contractSignedAt || null) : null}::date, contract_signed_at),
        site_survey_at = coalesce(${draft.provided.siteSurveyAt ? (draft.milestones.siteSurveyAt || null) : null}::date, site_survey_at),
        install_scheduled_at = coalesce(${draft.provided.installScheduledAt ? (draft.milestones.installScheduledAt || null) : null}::date, install_scheduled_at),
        pto_granted_at = coalesce(${draft.provided.ptoGrantedAt ? (draft.milestones.ptoGrantedAt || null) : null}::date, pto_granted_at),
        current_status = coalesce(${shouldApplyDerivedStatus ? draft.derivedStatus : null}::job_status, current_status),
        notes = coalesce(${draft.provided.notes ? (draft.job.notes || null) : null}, notes),
        updated_at = now()
      where id = ${jobId}
      returning id, customer_name, customer_phone, customer_email, street_1, street_2, city, state, postal_code, county
    `;

    await syncCustomerForJob(sql, companyId, jobId, updatedRows[0]);

    if (
      draft.provided.installScheduledAt ||
      draft.provided.status ||
      draft.provided.ptoGrantedAt ||
      draft.provided.siteSurveyAt ||
      draft.provided.contractSignedAt ||
      draft.provided.inspectionCompletedAt
    ) {
      await logImportEvent(sql, {
        jobId,
        actorId,
        toStatus: shouldApplyDerivedStatus ? draft.derivedStatus : null,
        eventType: "note",
        note: "Imported updates from CSV",
      });
    }

    if (draft.provided.crew) {
      await syncCrewAssignments(sql, jobId, companyId, draft.crew || []);
    }
    if (draft.provided.inspectionCompletedAt) {
      await syncInspectionFromImport(sql, {
        jobId,
        completedAt: draft.milestones.inspectionCompletedAt,
        actorId,
      });
    }

    await upsertInvoiceFromImport(sql, {
      companyId,
      jobId,
      financer: draft.job.financer,
      invoiceType: "m1",
      invoiceNumber: draft.financials.m1.invoiceNumber,
      amount: draft.financials.m1.amount,
      paid: draft.financials.m1.paid,
      applyNumber: draft.financials.m1.invoiceNumberProvided,
      applyAmount: draft.financials.m1.amountProvided,
      applyPaid: draft.financials.m1.paidProvided,
      actorId,
    });

    await upsertInvoiceFromImport(sql, {
      companyId,
      jobId,
      financer: draft.job.financer,
      invoiceType: "m2",
      invoiceNumber: draft.financials.m2.invoiceNumber,
      amount: draft.financials.m2.amount,
      paid: draft.financials.m2.paid,
      applyNumber: draft.financials.m2.invoiceNumberProvided,
      applyAmount: draft.financials.m2.amountProvided,
      applyPaid: draft.financials.m2.paidProvided,
      actorId,
    });

    await upsertInvoiceFromImport(sql, {
      companyId,
      jobId,
      financer: draft.job.financer,
      invoiceType: "adder",
      invoiceNumber: null,
      amount: draft.financials.adder.amount,
      paid: false,
      applyNumber: false,
      applyAmount: draft.financials.adder.amountProvided,
      applyPaid: false,
      actorId,
    });

    await sql`commit`;
    return true;
  } catch (error) {
    try { await sql`rollback`; } catch {}
    throw error;
  }
}

export async function POST(req) {
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
  const jobs = Array.isArray(body?.jobs) ? body.jobs : [];
  if (!jobs.length) return NextResponse.json({ added: 0, total: 0, failed: [] });

  let added = 0;
  const failed = [];

  for (const draft of jobs) {
    try {
      const exists = await ctx.sql`
        select 1
        from jobs
        where company_id = ${company.id}
          and job_number = ${draft.jobNumber}
        limit 1
      `;
      if (exists.length) {
        failed.push({ id: draft.jobNumber, customer: draft.customerName, reason: "Job number already exists" });
        continue;
      }
      await createJob(ctx.sql, company.id, draft, ctx.appUser?.id);
      added++;
    } catch (error) {
      failed.push({ id: draft.jobNumber, customer: draft.customerName, reason: error.message || "Import failed" });
    }
  }

  return NextResponse.json({ added, total: jobs.length, failed });
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

  const jobs = await req.json();
  if (!Array.isArray(jobs) || !jobs.length) {
    return NextResponse.json({ updated: 0, total: 0, failed: [], notFound: [] });
  }

  let updated = 0;
  const failed = [];
  const notFound = [];

  for (const draft of jobs) {
    try {
      const ok = await updateJob(ctx.sql, company.id, draft, ctx.appUser?.id);
      if (!ok) notFound.push(draft.jobNumber);
      else updated++;
    } catch (error) {
      failed.push({ id: draft.jobNumber, customer: draft.customerName, reason: error.message || "Update failed" });
    }
  }

  return NextResponse.json({ updated, total: jobs.length, failed, notFound });
}
