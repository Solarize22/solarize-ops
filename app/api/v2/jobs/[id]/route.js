import { NextResponse } from "next/server";
import { canSeeFinancials, ensureAccessToJob, getRequestContext } from "@/lib/normalized-api";

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
      where j.id = ${params.id}
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
