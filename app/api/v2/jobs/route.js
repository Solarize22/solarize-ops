import { NextResponse } from "next/server";
import { canSeeFinancials, getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";
import { isCrmInstalled } from "@/lib/job-crm";
import { customerIdentityForRow } from "@/lib/customer-crm";
import { isFieldTrackingInstalled } from "@/lib/field-tracking";

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
    const crmInstalled = await isCrmInstalled(ctx.sql);
    const fieldTrackingInstalled = await isFieldTrackingInstalled(ctx.sql);

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
        j.last_contact_at,
        j.next_follow_up_at,
        j.notes,
        inspection_summary.latest_inspection_scheduled_at,
        inspection_summary.latest_inspection_completed_at,
        inspection_summary.latest_inspection_result,
        rep.full_name as rep_name,
        follow_up_owner.full_name as follow_up_owner_name,
        coalesce(
          json_agg(distinct crew.full_name) filter (where crew.full_name is not null),
          '[]'::json
        ) as crew_names,
        ${fieldTrackingInstalled}::boolean as field_tracking_installed,
        case
          when ${fieldTrackingInstalled}::boolean then coalesce(field_summary.install_day_count, 0)
          else 0
        end as install_day_count,
        case
          when ${fieldTrackingInstalled}::boolean then field_summary.latest_install_day_date
          else null
        end as latest_install_day_date,
        case
          when ${fieldTrackingInstalled}::boolean then coalesce(field_summary.revisit_count, 0)
          else 0
        end as revisit_count,
        case
          when ${fieldTrackingInstalled}::boolean then coalesce(field_summary.open_visit_count, 0)
          else 0
        end as open_visit_count,
        case
          when ${fieldTrackingInstalled}::boolean then coalesce(field_summary.open_service_call_count, 0)
          else 0
        end as open_service_call_count,
        case
          when ${fieldTrackingInstalled}::boolean then field_summary.next_visit_date
          else null
        end as next_visit_date,
        case
          when ${fieldTrackingInstalled}::boolean then field_summary.next_visit_type
          else null
        end as next_visit_type,
        coalesce(sum(case when i.status <> 'void' then i.total_cents else 0 end), 0)::int as total_invoiced_cents,
        coalesce(sum(case when i.status <> 'void' then i.balance_cents else 0 end), 0)::int as outstanding_cents,
        ${crmInstalled}::boolean as crm_installed,
        case
          when ${crmInstalled}::boolean then (
            select count(*)::int
            from job_follow_up_tasks t
            where t.job_id = j.id
              and t.status <> 'done'
          )
          else 0
        end as open_task_count,
        case
          when ${crmInstalled}::boolean then (
            select count(*)::int
            from job_follow_up_tasks t
            where t.job_id = j.id
              and t.status <> 'done'
              and t.due_at is not null
              and t.due_at < current_date
          )
          else 0
        end as overdue_task_count
      from jobs j
      left join lateral (
        select
          max(scheduled_at) as latest_inspection_scheduled_at,
          max(completed_at) as latest_inspection_completed_at,
          (
            select ins2.result
            from inspections ins2
            where ins2.job_id = j.id
            order by coalesce(ins2.completed_at, ins2.scheduled_at, ins2.created_at) desc, ins2.created_at desc
            limit 1
          ) as latest_inspection_result
        from inspections ins
        where ins.job_id = j.id
      ) inspection_summary on true
      left join lateral (
        select
          count(*) filter (where fv.visit_type = 'install_day')::int as install_day_count,
          max(fv.visit_date) filter (where fv.visit_type = 'install_day') as latest_install_day_date,
          count(*) filter (where fv.visit_type in ('site_visit', 'service_call'))::int as revisit_count,
          count(*) filter (
            where fv.visit_type in ('site_visit', 'service_call')
              and fv.status not in ('completed', 'cancelled')
          )::int as open_visit_count,
          count(*) filter (
            where fv.visit_type = 'service_call'
              and fv.status not in ('completed', 'cancelled')
          )::int as open_service_call_count,
          min(fv.visit_date) filter (
            where fv.status not in ('completed', 'cancelled')
          ) as next_visit_date,
          (
            array_agg(fv.visit_type order by fv.visit_date asc, fv.created_at asc) filter (
              where fv.status not in ('completed', 'cancelled')
            )
          )[1] as next_visit_type
        from job_field_visits fv
        where fv.job_id = j.id
      ) field_summary on true
      left join app_users rep on rep.id = j.rep_user_id
      left join app_users follow_up_owner on follow_up_owner.id = j.follow_up_owner_id
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
      group by
        j.id,
        rep.full_name,
        follow_up_owner.full_name,
        inspection_summary.latest_inspection_scheduled_at,
        inspection_summary.latest_inspection_completed_at,
        inspection_summary.latest_inspection_result,
        field_summary.install_day_count,
        field_summary.latest_install_day_date,
        field_summary.revisit_count,
        field_summary.open_visit_count,
        field_summary.open_service_call_count,
        field_summary.next_visit_date,
        field_summary.next_visit_type
      order by j.created_at desc
    `;

    const data = rows.map((row) => {
      const customerIdentity = customerIdentityForRow(row);

      return {
        id: row.id,
        jobNumber: row.job_number,
        customerId: customerIdentity.customerId,
        customerPath: customerIdentity.customerPath,
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
        financer: showFinancials ? row.financer : null,
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
        inspectionScheduledAt: row.latest_inspection_scheduled_at,
        inspectionCompletedAt: row.latest_inspection_completed_at,
        inspectionResult: row.latest_inspection_result,
        ptoSubmittedAt: row.pto_submitted_at,
        ptoGrantedAt: row.pto_granted_at,
        currentStatus: row.current_status,
        currentStatusChangedAt: row.current_status_changed_at,
        repName: row.rep_name,
        crewNames: row.crew_names || [],
        notes: row.notes,
        fieldTrackingSummary: row.field_tracking_installed ? {
          installDayCount: row.install_day_count,
          latestInstallDayDate: row.latest_install_day_date,
          revisitCount: row.revisit_count,
          openVisitCount: row.open_visit_count,
          openServiceCallCount: row.open_service_call_count,
          nextVisitDate: row.next_visit_date,
          nextVisitType: row.next_visit_type,
        } : null,
        crmSummary: row.crm_installed ? {
          lastContactAt: row.last_contact_at,
          nextFollowUpAt: row.next_follow_up_at,
          followUpOwnerName: row.follow_up_owner_name,
          openTaskCount: row.open_task_count,
          overdueTaskCount: row.overdue_task_count,
        } : null,
        financialSummary: showFinancials ? {
          totalInvoicedCents: row.total_invoiced_cents,
          outstandingCents: row.outstanding_cents,
        } : null,
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load jobs" }, { status: 500 });
  }
}
