import { NextResponse } from "next/server";
import { canManageJobOperations, canSeeFinancials, ensureAccessToJob, getRequestContext } from "@/lib/normalized-api";

export async function GET(req, { params }) {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await ensureAccessToJob(ctx.sql, params.id, ctx.appUser);
    if (access === false) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rows = await ctx.sql`
      select
        j.*,
        rep.full_name as rep_name,
        coalesce(
          json_agg(distinct crew.full_name) filter (where crew.full_name is not null),
          '[]'::json
        ) as crew_names,
        coalesce(sum(case when i.status <> 'void' then i.total_cents else 0 end), 0)::int as total_invoiced_cents,
        coalesce(sum(case when i.status <> 'void' then i.balance_cents else 0 end), 0)::int as outstanding_cents
      from jobs j
      left join app_users rep on rep.id = j.rep_user_id
      left join job_crew_assignments a on a.job_id = j.id
      left join app_users crew on crew.id = a.user_id
      left join invoices i on i.job_id = j.id
      where j.id::text = ${access.id}::text
      group by j.id, rep.full_name
      limit 1
    `;

    const row = rows[0];
    const showFinancials = canSeeFinancials(ctx.appUser);

    return NextResponse.json({
      id: row.id,
      companyId: row.company_id,
      jobNumber: row.job_number,
      externalJobId: row.external_job_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      customerEmail: row.customer_email,
      address: {
        street1: row.street_1,
        street2: row.street_2,
        city: row.city,
        state: row.state,
        postalCode: row.postal_code,
        county: row.county,
      },
      contractType: row.contract_type,
      financer: row.financer,
      contractor: row.contractor,
      partner: row.partner,
      utilityCompany: row.utility_company,
      repUserId: row.rep_user_id,
      repName: row.rep_name,
      crewNames: row.crew_names || [],
      systemSizeKw: row.system_size_kw,
      panelCount: row.panel_count,
      wattPerPanel: row.watt_per_panel,
      inverter: row.inverter,
      module: row.module,
      battery: row.battery,
      roofType: row.roof_type,
      contractSignedAt: row.contract_signed_at,
      siteSurveyAt: row.site_survey_at,
      installScheduledAt: row.install_scheduled_at,
      installCompletedAt: row.install_completed_at,
      ptoSubmittedAt: row.pto_submitted_at,
      ptoGrantedAt: row.pto_granted_at,
      currentStatus: row.current_status,
      currentStatusChangedAt: row.current_status_changed_at,
      isActive: row.is_active,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      financialSummary: showFinancials ? {
        totalInvoicedCents: row.total_invoiced_cents,
        outstandingCents: row.outstanding_cents,
      } : null,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load job" }, { status: 500 });
  }
}

const FIELD_MAP = {
  customerName: "customer_name",
  customerPhone: "customer_phone",
  customerEmail: "customer_email",
  street1: "street_1",
  street2: "street_2",
  city: "city",
  state: "state",
  postalCode: "postal_code",
  county: "county",
  contractType: "contract_type",
  financer: "financer",
  contractor: "contractor",
  partner: "partner",
  utilityCompany: "utility_company",
  systemSizeKw: "system_size_kw",
  panelCount: "panel_count",
  wattPerPanel: "watt_per_panel",
  inverter: "inverter",
  module: "module",
  battery: "battery",
  roofType: "roof_type",
  contractSignedAt: "contract_signed_at",
  siteSurveyAt: "site_survey_at",
  installScheduledAt: "install_scheduled_at",
  installCompletedAt: "install_completed_at",
  ptoSubmittedAt: "pto_submitted_at",
  ptoGrantedAt: "pto_granted_at",
  notes: "notes",
};

function normalizePayload(body) {
  const address = body?.address || {};
  return {
    customerName: body?.customerName,
    customerPhone: body?.customerPhone,
    customerEmail: body?.customerEmail,
    street1: address.street1,
    street2: address.street2,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    county: address.county,
    contractType: body?.contractType,
    financer: body?.financer,
    contractor: body?.contractor,
    partner: body?.partner,
    utilityCompany: body?.utilityCompany,
    systemSizeKw: body?.systemSizeKw,
    panelCount: body?.panelCount,
    wattPerPanel: body?.wattPerPanel,
    inverter: body?.inverter,
    module: body?.module,
    battery: body?.battery,
    roofType: body?.roofType,
    contractSignedAt: body?.contractSignedAt,
    siteSurveyAt: body?.siteSurveyAt,
    installScheduledAt: body?.installScheduledAt,
    installCompletedAt: body?.installCompletedAt,
    ptoSubmittedAt: body?.ptoSubmittedAt,
    ptoGrantedAt: body?.ptoGrantedAt,
    notes: body?.notes,
  };
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

    const body = await req.json();
    const payload = normalizePayload(body);

    const rows = await ctx.sql`
      update jobs
      set
        customer_name = coalesce(${payload.customerName ?? null}, customer_name),
        customer_phone = ${payload.customerPhone ?? null},
        customer_email = ${payload.customerEmail ?? null},
        street_1 = coalesce(${payload.street1 ?? null}, street_1),
        street_2 = ${payload.street2 ?? null},
        city = coalesce(${payload.city ?? null}, city),
        state = coalesce(${payload.state ?? null}, state),
        postal_code = ${payload.postalCode ?? null},
        county = ${payload.county ?? null},
        contract_type = ${payload.contractType ?? null},
        financer = ${payload.financer ?? null},
        contractor = ${payload.contractor ?? null},
        partner = ${payload.partner ?? null},
        utility_company = ${payload.utilityCompany ?? null},
        system_size_kw = ${payload.systemSizeKw ?? null}::numeric,
        panel_count = ${payload.panelCount ?? null}::integer,
        watt_per_panel = ${payload.wattPerPanel ?? null}::integer,
        inverter = ${payload.inverter ?? null},
        module = ${payload.module ?? null},
        battery = coalesce(${payload.battery ?? null}::boolean, battery),
        roof_type = ${payload.roofType ?? null},
        contract_signed_at = ${payload.contractSignedAt ?? null}::date,
        site_survey_at = ${payload.siteSurveyAt ?? null}::date,
        install_scheduled_at = ${payload.installScheduledAt ?? null}::date,
        install_completed_at = ${payload.installCompletedAt ?? null}::date,
        pto_submitted_at = ${payload.ptoSubmittedAt ?? null}::date,
        pto_granted_at = ${payload.ptoGrantedAt ?? null}::date,
        notes = ${payload.notes ?? null},
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
        ${rows[0].current_status}::job_status,
        'note'::status_event_type,
        now(),
        'Updated core job fields via normalized API'
      )
    `;

    return NextResponse.json(rows[0]);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to update job" }, { status: 500 });
  }
}
