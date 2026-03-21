import { NextResponse } from "next/server";
import { canManageJobOperations, getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";

const NON_INVOICE_TOKENS = new Set([
  "paid",
  "unpaid",
  "complete",
  "completed",
  "yes",
  "no",
  "true",
  "false",
  "none",
  "n/a",
  "na",
  "-"
]);

function mapStatus(status) {
  switch ((status || "").trim()) {
    case "Scheduled": return "scheduled";
    case "Install Complete": return "install_completed";
    case "Inspection Scheduled": return "inspection_scheduled";
    case "Inspection Passed": return "inspection_passed";
    case "Fully Paid / Closed": return "paid_in_full";
    case "Rescheduled / Issue": return "on_hold";
    default: return "created";
  }
}

function dollarsToCents(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function normalizeInvoiceNumber(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (NON_INVOICE_TOKENS.has(normalized.toLowerCase())) return null;
  return normalized;
}

async function findRepId(sql, companyId, repName) {
  if (!repName) return null;
  const rows = await sql`
    select id
    from app_users
    where company_id = ${companyId}
      and lower(full_name) = lower(${repName})
    limit 1
  `;
  return rows[0]?.id || null;
}

async function syncCrewAssignments(sql, jobId, companyId, crewNames = []) {
  await sql`delete from job_crew_assignments where job_id = ${jobId}`;
  for (const crewName of crewNames) {
    const rows = await sql`
      select id
      from app_users
      where company_id = ${companyId}
        and lower(full_name) = lower(${crewName})
      limit 1
    `;
    if (rows[0]?.id) {
      await sql`
        insert into job_crew_assignments (job_id, user_id, assignment_role, created_at)
        values (${jobId}, ${rows[0].id}, 'crew', now())
      `;
    }
  }
}

async function upsertInvoice(sql, { companyId, jobId, financer, invoiceType, invoiceNumber, amount, paid }) {
  const normalizedInvoiceNumber = normalizeInvoiceNumber(invoiceNumber);
  if (!normalizedInvoiceNumber && !(Number(amount) > 0)) return;

  const totalCents = dollarsToCents(amount);
  const number = normalizedInvoiceNumber || `IMP-${invoiceType.toUpperCase()}-${jobId}`;
  const existing = await sql`
    select id
    from invoices
    where job_id = ${jobId}
      and invoice_type = ${invoiceType}::invoice_type
    limit 1
  `;

  let invoiceId;
  if (existing.length) {
    invoiceId = existing[0].id;
    await sql`
      update invoices
      set
        invoice_number = ${number},
        total_cents = ${totalCents},
        subtotal_cents = ${totalCents},
        balance_cents = ${paid ? 0 : totalCents},
        status = ${paid ? "paid" : "issued"}::invoice_status,
        financer = ${financer || null},
        updated_at = now()
      where id = ${invoiceId}
    `;
    await sql`delete from invoice_line_items where invoice_id = ${invoiceId}`;
  } else {
    const inserted = await sql`
      insert into invoices (
        company_id, job_id, invoice_number, invoice_type, status,
        subtotal_cents, total_cents, balance_cents, financer, created_at, updated_at
      )
      values (
        ${companyId}, ${jobId}, ${number}, ${invoiceType}::invoice_type, ${paid ? "paid" : "issued"}::invoice_status,
        ${totalCents}, ${totalCents}, ${paid ? 0 : totalCents}, ${financer || null}, now(), now()
      )
      returning id
    `;
    invoiceId = inserted[0].id;
  }

  await sql`
    insert into invoice_line_items (invoice_id, line_type, description, amount_cents, sort_order, created_at)
    values (${invoiceId}, ${invoiceType}::invoice_type, ${invoiceType.toUpperCase()}, ${totalCents}, 1, now())
  `;

  if (paid && totalCents > 0) {
    const existingPayment = await sql`
      select p.id
      from payments p
      join payment_allocations pa on pa.payment_id = p.id
      where p.job_id = ${jobId}
        and pa.invoice_id = ${invoiceId}
      limit 1
    `;
    if (!existingPayment.length) {
      const payment = await sql`
        insert into payments (
          company_id, job_id, payment_reference, payment_method, status, amount_cents, source_name, notes, created_at, updated_at
        )
        values (
          ${companyId}, ${jobId}, ${`IMPORT-${invoiceType.toUpperCase()}-${number}`}, 'other'::payment_method, 'settled'::payment_status,
          ${totalCents}, ${financer || "import"}, 'Imported paid flag', now(), now()
        )
        returning id
      `;
      await sql`
        insert into payment_allocations (payment_id, invoice_id, allocated_cents, created_at)
        values (${payment[0].id}, ${invoiceId}, ${totalCents}, now())
      `;
    }
  }
}

async function createJob(sql, companyId, job) {
  await sql`begin`;
  try {
    const repId = await findRepId(sql, companyId, job.rep);
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
        ${job.id},
        ${job.customer || "Unknown Customer"},
        ${job.phone || null},
        ${job.email || null},
        ${job.street || "Unknown Address"},
        ${job.city || "Unknown City"},
        ${job.state || "NA"},
        ${job.zip || null},
        ${job.deal || null},
        ${job.financer || null},
        ${job.contractor || null},
        ${job.partner || null},
        ${job.utilityCompany || null},
        ${repId},
        ${job.systemSize || null}::numeric,
        ${job.panelCount || null}::integer,
        ${job.watt || null}::integer,
        ${job.inverter || null},
        ${job.module || null},
        ${!!job.battery},
        ${job.roofType || null},
        ${job.contractSigned || null}::date,
        ${job.siteSurveyDate || null}::date,
        ${job.installDate || null}::date,
        ${["Install Complete", "Inspection Scheduled", "Inspection Passed", "Fully Paid / Closed"].includes(job.status) ? (job.installDate || null) : null}::date,
        ${job.ptoDate || null}::date,
        ${mapStatus(job.status)}::job_status,
        now(),
        ${job.notes || null},
        now(),
        now()
      )
      returning id
    `;

    await syncCrewAssignments(sql, inserted[0].id, companyId, job.crew || []);
    await upsertInvoice(sql, {
      companyId,
      jobId: inserted[0].id,
      financer: job.financer,
      invoiceType: "m1",
      invoiceNumber: job.m1InvoiceNumber,
      amount: job.m1Amount,
      paid: !!job.m1Status,
    });
    await upsertInvoice(sql, {
      companyId,
      jobId: inserted[0].id,
      financer: job.financer,
      invoiceType: "m2",
      invoiceNumber: job.m2InvoiceNumber,
      amount: job.m2Amount,
      paid: !!job.m2Status,
    });
    await sql`commit`;
  } catch (error) {
    await sql`rollback`;
    throw error;
  }
}

async function updateJob(sql, companyId, job) {
  const rows = await sql`
    select id
    from jobs
    where company_id = ${companyId}
      and job_number = ${job.id}
    limit 1
  `;
  if (!rows.length) return false;

  const jobId = rows[0].id;
  const repId = await findRepId(sql, companyId, job.rep);
  await sql`
    update jobs
    set
      customer_name = coalesce(${job.customer || null}, customer_name),
      customer_phone = coalesce(${job.phone || null}, customer_phone),
      customer_email = coalesce(${job.email || null}, customer_email),
      street_1 = coalesce(${job.street || null}, street_1),
      city = coalesce(${job.city || null}, city),
      state = coalesce(${job.state || null}, state),
      postal_code = coalesce(${job.zip || null}, postal_code),
      contract_type = coalesce(${job.deal || null}, contract_type),
      financer = coalesce(${job.financer || null}, financer),
      contractor = coalesce(${job.contractor || null}, contractor),
      partner = coalesce(${job.partner || null}, partner),
      utility_company = coalesce(${job.utilityCompany || null}, utility_company),
      rep_user_id = coalesce(${repId}, rep_user_id),
      system_size_kw = coalesce(${job.systemSize || null}::numeric, system_size_kw),
      panel_count = coalesce(${job.panelCount || null}::integer, panel_count),
      watt_per_panel = coalesce(${job.watt || null}::integer, watt_per_panel),
      inverter = coalesce(${job.inverter || null}, inverter),
      module = coalesce(${job.module || null}, module),
      battery = coalesce(${job.battery ?? null}::boolean, battery),
      roof_type = coalesce(${job.roofType || null}, roof_type),
      contract_signed_at = coalesce(${job.contractSigned || null}::date, contract_signed_at),
      site_survey_at = coalesce(${job.siteSurveyDate || null}::date, site_survey_at),
      install_scheduled_at = coalesce(${job.installDate || null}::date, install_scheduled_at),
      install_completed_at = coalesce(${["Install Complete", "Inspection Scheduled", "Inspection Passed", "Fully Paid / Closed"].includes(job.status) ? (job.installDate || null) : null}::date, install_completed_at),
      pto_granted_at = coalesce(${job.ptoDate || null}::date, pto_granted_at),
      current_status = coalesce(${job.status ? mapStatus(job.status) : null}::job_status, current_status),
      notes = coalesce(${job.notes || null}, notes),
      updated_at = now()
    where id = ${jobId}
  `;

  if (Array.isArray(job.crew)) {
    await syncCrewAssignments(sql, jobId, companyId, job.crew);
  }
  await upsertInvoice(sql, {
    companyId,
    jobId,
    financer: job.financer,
    invoiceType: "m1",
    invoiceNumber: job.m1InvoiceNumber,
    amount: job.m1Amount,
    paid: !!job.m1Status,
  });
  await upsertInvoice(sql, {
    companyId,
    jobId,
    financer: job.financer,
    invoiceType: "m2",
    invoiceNumber: job.m2InvoiceNumber,
    amount: job.m2Amount,
    paid: !!job.m2Status,
  });
  return true;
}

export async function POST(req) {
  const ctx = await getRequestContext();
  if (!ctx.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageJobOperations(ctx.appUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const company = await getNormalizedCompany(ctx.sql);
  if (!company) {
    return NextResponse.json({ error: "No company found" }, { status: 400 });
  }

  const body = await req.json();
  const jobs = Array.isArray(body?.jobs) ? body.jobs : [];
  if (!jobs.length) return NextResponse.json({ added: 0, total: 0 });

  let added = 0;
  const failed = [];
  for (const job of jobs) {
    try {
      const exists = await ctx.sql`
        select 1
        from jobs
        where company_id = ${company.id}
          and job_number = ${job.id}
        limit 1
      `;
      if (exists.length) {
        failed.push({ id: job.id, reason: "Job number already exists" });
        continue;
      }
      await createJob(ctx.sql, company.id, job);
      added++;
    } catch (error) {
      failed.push({ id: job.id, reason: error.message || "Import failed" });
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

  const company = await getNormalizedCompany(ctx.sql);
  if (!company) {
    return NextResponse.json({ error: "No company found" }, { status: 400 });
  }

  const jobs = await req.json();
  if (!Array.isArray(jobs) || !jobs.length) {
    return NextResponse.json({ updated: 0, total: 0, notFound: [] });
  }

  let updated = 0;
  const notFound = [];
  for (const job of jobs) {
    try {
      const ok = await updateJob(ctx.sql, company.id, job);
      if (!ok) notFound.push(job.id);
      else updated++;
    } catch {
      notFound.push(job.id);
    }
  }

  return NextResponse.json({ updated, total: jobs.length, notFound });
}
