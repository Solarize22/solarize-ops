import { NextResponse } from "next/server";
import { canSeeFinancials, getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";

export async function GET() {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const company = await getNormalizedCompany(ctx.sql);
    if (!company) {
      return NextResponse.json([]);
    }

    const installerName = ctx.appUser?.role === "installer" ? ctx.appUser.name || "" : null;
    const showFinancials = canSeeFinancials(ctx.appUser);

    const rows = await ctx.sql`
      select
        j.id,
        j.job_number,
        j.customer_name,
        j.customer_phone,
        j.customer_email,
        j.street_1,
        j.city,
        j.state,
        j.postal_code,
        j.contract_type,
        j.financer,
        j.contractor,
        j.partner,
        j.utility_company,
        j.system_size_kw,
        j.panel_count,
        j.watt_per_panel,
        j.inverter,
        j.module,
        j.battery,
        j.roof_type,
        j.install_scheduled_at,
        j.install_completed_at,
        j.pto_submitted_at,
        j.pto_granted_at,
        j.current_status,
        j.current_status_changed_at,
        j.notes,
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
      group by j.id, rep.full_name
      order by j.created_at desc
    `;

    const data = rows.map((row) => ({
      id: row.id,
      jobNumber: row.job_number,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      customerEmail: row.customer_email,
      address: {
        street1: row.street_1,
        city: row.city,
        state: row.state,
        postalCode: row.postal_code,
      },
      contractType: row.contract_type,
      financer: row.financer,
      contractor: row.contractor,
      partner: row.partner,
      utilityCompany: row.utility_company,
      systemSizeKw: row.system_size_kw,
      panelCount: row.panel_count,
      wattPerPanel: row.watt_per_panel,
      inverter: row.inverter,
      module: row.module,
      battery: row.battery,
      roofType: row.roof_type,
      installScheduledAt: row.install_scheduled_at,
      installCompletedAt: row.install_completed_at,
      ptoSubmittedAt: row.pto_submitted_at,
      ptoGrantedAt: row.pto_granted_at,
      currentStatus: row.current_status,
      currentStatusChangedAt: row.current_status_changed_at,
      repName: row.rep_name,
      crewNames: row.crew_names || [],
      notes: row.notes,
      financialSummary: showFinancials ? {
        totalInvoicedCents: row.total_invoiced_cents,
        outstandingCents: row.outstanding_cents,
      } : null,
    }));

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load jobs" }, { status: 500 });
  }
}
