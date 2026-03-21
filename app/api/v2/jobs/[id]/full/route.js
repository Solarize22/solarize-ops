import { NextResponse } from "next/server";
import { canSeeFinancials, ensureAccessToJob, getRequestContext } from "@/lib/normalized-api";

export async function GET(req, { params }) {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await ensureAccessToJob(ctx.sql, params.id, ctx.appUser);
    if (access === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const showFinancials = canSeeFinancials(ctx.appUser);

    const [jobRows, invoiceRows, inspectionRows, historyRows, paymentRows] = await Promise.all([
      ctx.sql`
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
      `,
      showFinancials
        ? ctx.sql`
        select
          i.*,
          coalesce(
            json_agg(
              json_build_object(
                'id', li.id,
                'lineType', li.line_type,
                'description', li.description,
                'amountCents', li.amount_cents,
                'sortOrder', li.sort_order
              )
              order by li.sort_order asc, li.created_at asc
            ) filter (where li.id is not null),
            '[]'::json
          ) as line_items
        from invoices i
        left join invoice_line_items li on li.invoice_id = i.id
        where i.job_id = ${access.id}
        group by i.id
        order by i.created_at asc
      `
        : Promise.resolve([]),
      ctx.sql`
        select *
        from inspections
        where job_id = ${access.id}
        order by scheduled_at asc nulls last, created_at asc
      `,
      ctx.sql`
        select
          h.*,
          u.full_name as changed_by_name
        from job_status_history h
        left join app_users u on u.id = h.changed_by
        where h.job_id = ${access.id}
        order by h.changed_at desc
      `,
      showFinancials
        ? ctx.sql`
            select
              p.*,
              coalesce(
                json_agg(
                  json_build_object(
                    'invoiceId', i.id,
                    'invoiceNumber', i.invoice_number,
                    'allocatedCents', pa.allocated_cents
                  )
                ) filter (where pa.id is not null),
                '[]'::json
              ) as allocations
            from payments p
            left join payment_allocations pa on pa.payment_id = p.id
            left join invoices i on i.id = pa.invoice_id
            where p.job_id = ${access.id}
            group by p.id
            order by p.received_at nulls last, p.created_at asc
          `
        : Promise.resolve([]),
    ]);

    const row = jobRows[0];
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      job: {
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
        financer: showFinancials ? row.financer : null,
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
        financialSummary: showFinancials
          ? {
              totalInvoicedCents: row.total_invoiced_cents,
              outstandingCents: row.outstanding_cents,
            }
          : null,
      },
      invoices: invoiceRows.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        invoiceType: invoice.invoice_type,
        status: invoice.status,
        issuedAt: invoice.issued_at,
        sentAt: invoice.sent_at,
        dueAt: invoice.due_at,
        subtotalCents: invoice.subtotal_cents,
        totalCents: invoice.total_cents,
        balanceCents: invoice.balance_cents,
        financer: invoice.financer,
        memo: invoice.memo,
        lineItems: invoice.line_items || [],
        createdAt: invoice.created_at,
        updatedAt: invoice.updated_at,
      })),
      inspections: inspectionRows.map((inspection) => ({
        id: inspection.id,
        inspectionType: inspection.inspection_type,
        scheduledAt: inspection.scheduled_at,
        completedAt: inspection.completed_at,
        result: inspection.result,
        inspectorName: inspection.inspector_name,
        authorityName: inspection.authority_name,
        notes: inspection.notes,
        createdAt: inspection.created_at,
        updatedAt: inspection.updated_at,
      })),
      history: historyRows
        .filter((item) => showFinancials || (!item.related_invoice_id && !item.related_payment_id && item.event_type !== "invoice_created" && item.event_type !== "payment_received"))
        .map((item) => ({
        id: item.id,
        fromStatus: item.from_status,
        toStatus: item.to_status,
        eventType: item.event_type,
        changedAt: item.changed_at,
        changedBy: item.changed_by,
        changedByName: item.changed_by_name,
        relatedInvoiceId: item.related_invoice_id,
        relatedPaymentId: item.related_payment_id,
        relatedInspectionId: item.related_inspection_id,
        note: item.note,
      })),
      payments: paymentRows.map((payment) => ({
        id: payment.id,
        paymentReference: payment.payment_reference,
        paymentMethod: payment.payment_method,
        status: payment.status,
        receivedAt: payment.received_at,
        amountCents: payment.amount_cents,
        sourceName: payment.source_name,
        notes: payment.notes,
        allocations: payment.allocations || [],
        createdAt: payment.created_at,
        updatedAt: payment.updated_at,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load job detail" }, { status: 500 });
  }
}
