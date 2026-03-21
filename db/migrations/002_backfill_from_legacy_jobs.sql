-- This migration assumes the legacy table has already been renamed to:
--   legacy_jobs(id text primary key, data jsonb not null)
-- from the current application shape.
--
-- Run this only after:
--   000_prepare_legacy_tables.sql
--   001_normalized_schema.sql
-- Review conflicts first in the helper queries at the bottom.

begin;

create temp table legacy_jobs_flat as
select
  j.id as legacy_row_id,
  j.data,
  nullif(trim(j.data->>'id'), '') as legacy_job_number,
  nullif(trim(j.data->>'customer'), '') as customer_name,
  nullif(trim(j.data->>'phone'), '') as customer_phone,
  nullif(trim(j.data->>'email'), '') as customer_email,
  nullif(trim(j.data->>'street'), '') as street_1,
  nullif(trim(j.data->>'city'), '') as city,
  nullif(trim(j.data->>'state'), '') as state,
  nullif(trim(j.data->>'zip'), '') as postal_code,
  nullif(trim(j.data->>'deal'), '') as contract_type,
  nullif(trim(j.data->>'financer'), '') as financer,
  nullif(trim(j.data->>'contractor'), '') as contractor,
  nullif(trim(j.data->>'partner'), '') as partner,
  nullif(trim(j.data->>'utilityCompany'), '') as utility_company,
  nullif(trim(j.data->>'rep'), '') as rep_name,
  nullif(trim(j.data->>'systemSize'), '') as system_size_kw_raw,
  nullif(trim(j.data->>'panelCount'), '') as panel_count_raw,
  nullif(trim(j.data->>'watt'), '') as watt_per_panel_raw,
  nullif(trim(j.data->>'inverter'), '') as inverter,
  nullif(trim(j.data->>'module'), '') as module,
  coalesce((j.data->>'battery')::boolean, false) as battery,
  nullif(trim(j.data->>'roofType'), '') as roof_type,
  nullif(trim(j.data->>'contractSigned'), '') as contract_signed_raw,
  nullif(trim(j.data->>'siteSurveyDate'), '') as site_survey_raw,
  nullif(trim(j.data->>'installDate'), '') as install_date_raw,
  nullif(trim(j.data->>'ptoDate'), '') as pto_date_raw,
  nullif(trim(j.data->>'status'), '') as legacy_status,
  nullif(trim(j.data->>'notes'), '') as notes,
  nullif(trim(j.data->>'createdAt'), '') as created_at_raw,
  nullif(trim(j.data->>'updatedAt'), '') as updated_at_raw,
  nullif(trim(j.data->>'m1InvoiceNumber'), '') as m1_invoice_number,
  nullif(trim(j.data->>'m2InvoiceNumber'), '') as m2_invoice_number,
  coalesce(nullif(trim(j.data->>'m1Amount'), '')::numeric, 0) as m1_amount,
  coalesce(nullif(trim(j.data->>'m2Amount'), '')::numeric, 0) as m2_amount,
  coalesce(nullif(trim(j.data->>'adders'), '')::numeric, 0) as adders_amount,
  coalesce((j.data->>'m1Status')::boolean, false) as m1_paid_flag,
  coalesce((j.data->>'m2Status')::boolean, false) as m2_paid_flag,
  nullif(trim(j.data->>'inspectionDate'), '') as inspection_date_raw,
  nullif(trim(j.data->>'inspectionStatus'), '') as inspection_status,
  nullif(trim(j.data->>'permitStatus'), '') as permit_status,
  nullif(trim(j.data->>'nextAction'), '') as next_action
from legacy_jobs j;

insert into companies (name)
select 'Solarize Ops'
where not exists (select 1 from companies);

with company_cte as (
  select id as company_id
  from companies
  order by created_at asc
  limit 1
)
insert into app_users (company_id, email, full_name, role, is_active, created_at, updated_at)
select
  c.company_id,
  coalesce(nullif(lower(u.email), ''), lower(replace(u.name, ' ', '.')) || '@local.invalid'),
  u.name,
  case u.role
    when 'owner' then 'owner'::company_role
    when 'admin' then 'admin'::company_role
    when 'installer' then 'installer'::company_role
    when 'salesperson' then 'sales'::company_role
    else 'ops'::company_role
  end,
  coalesce(u.status, 'active') = 'active',
  coalesce(u.created_at, now()),
  now()
from company_cte c
join (
  select
    nullif(trim(id), '') as id,
    nullif(trim(clerk_id), '') as clerk_id,
    nullif(trim(name), '') as name,
    nullif(trim(email), '') as email,
    nullif(trim(role), '') as role,
    nullif(trim(status), '') as status,
    coalesce(nullif(trim(created_at), '')::timestamptz, now()) as created_at
  from (
    select
      (data->>'id') as id,
      (data->>'clerkId') as clerk_id,
      (data->>'name') as name,
      (data->>'email') as email,
      (data->>'role') as role,
      (data->>'status') as status,
      (data->>'createdAt') as created_at
    from (
      select jsonb_array_elements(
        case
          when exists (select 1 from information_schema.tables where table_name = 'users') then '[]'::jsonb
          else '[]'::jsonb
        end
      ) as data
    ) q
  ) raw
) u on true
where false;

-- The app's user records currently live outside normalized SQL in most environments.
-- Seed app_users separately if you have a real source of user rows.

with company_cte as (
  select id as company_id
  from companies
  order by created_at asc
  limit 1
),
rep_map as (
  select company_id, full_name, id as user_id
  from app_users
),
normalized_jobs as (
  select
    gen_random_uuid() as new_job_id,
    c.company_id,
    coalesce(f.legacy_job_number, f.legacy_row_id) as job_number,
    null::text as external_job_id,
    coalesce(f.customer_name, 'Unknown Customer') as customer_name,
    f.customer_phone,
    f.customer_email,
    coalesce(f.street_1, 'Unknown Address') as street_1,
    null::text as street_2,
    coalesce(f.city, 'Unknown City') as city,
    coalesce(f.state, 'NA') as state,
    f.postal_code,
    null::text as county,
    f.contract_type,
    f.financer,
    f.contractor,
    f.partner,
    f.utility_company,
    r.user_id as rep_user_id,
    nullif(f.system_size_kw_raw, '')::numeric as system_size_kw,
    nullif(f.panel_count_raw, '')::integer as panel_count,
    nullif(f.watt_per_panel_raw, '')::integer as watt_per_panel,
    f.inverter,
    f.module,
    f.battery,
    f.roof_type,
    nullif(f.contract_signed_raw, '')::date as contract_signed_at,
    nullif(f.site_survey_raw, '')::date as site_survey_at,
    nullif(f.install_date_raw, '')::date as install_scheduled_at,
    case
      when f.legacy_status in ('Install Complete', 'Inspection Scheduled', 'Inspection Passed', 'Fully Paid / Closed')
        then nullif(f.install_date_raw, '')::date
      else null
    end as install_completed_at,
    case
      when f.legacy_status in ('Inspection Passed', 'Fully Paid / Closed')
        then coalesce(nullif(f.inspection_date_raw, '')::date, null)
      else null
    end as pto_submitted_at,
    nullif(f.pto_date_raw, '')::date as pto_granted_at,
    case
      when f.legacy_status = 'Scheduled' then 'scheduled'::job_status
      when f.legacy_status = 'Install Complete' then 'install_completed'::job_status
      when f.legacy_status = 'Inspection Scheduled' then 'inspection_scheduled'::job_status
      when f.legacy_status = 'Inspection Passed' then 'inspection_passed'::job_status
      when f.legacy_status = 'Fully Paid / Closed' then 'paid_in_full'::job_status
      when f.legacy_status = 'Rescheduled / Issue' then 'on_hold'::job_status
      else 'created'::job_status
    end as current_status,
    coalesce(nullif(f.updated_at_raw, '')::timestamptz, now()) as current_status_changed_at,
    true as is_active,
    concat_ws(E'\n', f.notes, f.next_action) as notes,
    coalesce(nullif(f.created_at_raw, '')::timestamptz, now()) as created_at,
    coalesce(nullif(f.updated_at_raw, '')::timestamptz, now()) as updated_at,
    f.*
  from legacy_jobs_flat f
  cross join company_cte c
  left join rep_map r
    on r.company_id = c.company_id
   and lower(r.full_name) = lower(f.rep_name)
)
insert into jobs (
  id,
  company_id,
  job_number,
  external_job_id,
  customer_name,
  customer_phone,
  customer_email,
  street_1,
  street_2,
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
  pto_submitted_at,
  pto_granted_at,
  current_status,
  current_status_changed_at,
  is_active,
  notes,
  created_at,
  updated_at
)
select
  new_job_id,
  company_id,
  job_number,
  external_job_id,
  customer_name,
  customer_phone,
  customer_email,
  street_1,
  street_2,
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
  pto_submitted_at,
  pto_granted_at,
  current_status,
  current_status_changed_at,
  is_active,
  notes,
  created_at,
  updated_at
from normalized_jobs;

create temp table migrated_job_map as
select
  j.id as new_job_id,
  j.job_number,
  f.*
from jobs j
join legacy_jobs_flat f
  on f.legacy_job_number = j.job_number;

insert into inspections (
  job_id,
  inspection_type,
  scheduled_at,
  completed_at,
  result,
  authority_name,
  notes,
  created_at,
  updated_at
)
select
  m.new_job_id,
  'final'::inspection_type,
  case
    when m.inspection_date_raw is not null then (m.inspection_date_raw::date)::timestamp
    else null
  end,
  case
    when coalesce(m.inspection_status, '') = 'Passed'
      or m.legacy_status in ('Inspection Passed', 'Fully Paid / Closed')
      then (m.inspection_date_raw::date)::timestamp
    else null
  end,
  case
    when coalesce(m.inspection_status, '') = 'Failed' then 'failed'::inspection_result
    when coalesce(m.inspection_status, '') = 'Passed' then 'passed'::inspection_result
    when m.inspection_date_raw is not null then 'scheduled'::inspection_result
    else null
  end,
  m.permit_status,
  m.notes,
  coalesce(nullif(m.created_at_raw, '')::timestamptz, now()),
  coalesce(nullif(m.updated_at_raw, '')::timestamptz, now())
from migrated_job_map m
where m.inspection_date_raw is not null
   or m.inspection_status is not null
   or m.legacy_status in ('Inspection Scheduled', 'Inspection Passed', 'Fully Paid / Closed');

insert into invoices (
  company_id,
  job_id,
  invoice_number,
  invoice_type,
  status,
  issued_at,
  sent_at,
  due_at,
  subtotal_cents,
  total_cents,
  balance_cents,
  financer,
  memo,
  created_at,
  updated_at
)
select
  j.company_id,
  m.new_job_id,
  coalesce(m.m1_invoice_number, 'MIG-M1-' || j.job_number),
  'm1'::invoice_type,
  case
    when m.m1_paid_flag then 'paid'::invoice_status
    when m.m1_amount > 0 then 'issued'::invoice_status
    else 'draft'::invoice_status
  end,
  j.install_completed_at,
  j.install_completed_at,
  null,
  round(m.m1_amount * 100)::integer,
  round(m.m1_amount * 100)::integer,
  case
    when m.m1_paid_flag then 0
    else round(m.m1_amount * 100)::integer
  end,
  j.financer,
  'Backfilled from legacy M1 fields',
  j.created_at,
  j.updated_at
from migrated_job_map m
join jobs j on j.id = m.new_job_id
where m.m1_amount > 0 or m.m1_invoice_number is not null;

insert into invoices (
  company_id,
  job_id,
  invoice_number,
  invoice_type,
  status,
  issued_at,
  sent_at,
  due_at,
  subtotal_cents,
  total_cents,
  balance_cents,
  financer,
  memo,
  created_at,
  updated_at
)
select
  j.company_id,
  m.new_job_id,
  coalesce(m.m2_invoice_number, 'MIG-M2-' || j.job_number),
  'm2'::invoice_type,
  case
    when m.m2_paid_flag then 'paid'::invoice_status
    when m.m2_amount > 0 then 'issued'::invoice_status
    else 'draft'::invoice_status
  end,
  j.pto_granted_at,
  j.pto_granted_at,
  null,
  round(m.m2_amount * 100)::integer,
  round(m.m2_amount * 100)::integer,
  case
    when m.m2_paid_flag then 0
    else round(m.m2_amount * 100)::integer
  end,
  j.financer,
  'Backfilled from legacy M2 fields',
  j.created_at,
  j.updated_at
from migrated_job_map m
join jobs j on j.id = m.new_job_id
where m.m2_amount > 0 or m.m2_invoice_number is not null;

insert into invoices (
  company_id,
  job_id,
  invoice_number,
  invoice_type,
  status,
  issued_at,
  sent_at,
  due_at,
  subtotal_cents,
  total_cents,
  balance_cents,
  financer,
  memo,
  created_at,
  updated_at
)
select
  j.company_id,
  m.new_job_id,
  'MIG-ADDER-' || j.job_number,
  'adder'::invoice_type,
  'issued'::invoice_status,
  j.created_at::date,
  null,
  null,
  round(m.adders_amount * 100)::integer,
  round(m.adders_amount * 100)::integer,
  round(m.adders_amount * 100)::integer,
  j.financer,
  'Backfilled adder amount from legacy job',
  j.created_at,
  j.updated_at
from migrated_job_map m
join jobs j on j.id = m.new_job_id
where m.adders_amount > 0;

insert into invoice_line_items (invoice_id, line_type, description, amount_cents, sort_order, created_at)
select
  i.id,
  i.invoice_type,
  case i.invoice_type
    when 'm1' then 'Milestone 1'
    when 'm2' then 'Milestone 2'
    when 'adder' then 'Adder'
    else 'Imported line item'
  end,
  i.total_cents,
  1,
  i.created_at
from invoices i
where i.memo like 'Backfilled%';

insert into payments (
  company_id,
  job_id,
  payment_reference,
  payment_method,
  status,
  received_at,
  amount_cents,
  source_name,
  notes,
  created_at,
  updated_at
)
select
  i.company_id,
  i.job_id,
  'LEGACY-M1-' || j.job_number,
  'other'::payment_method,
  'settled'::payment_status,
  i.issued_at,
  i.total_cents,
  coalesce(i.financer, 'legacy'),
  'Backfilled from legacy m1Status flag',
  i.created_at,
  i.updated_at
from invoices i
join jobs j on j.id = i.job_id
where i.invoice_type = 'm1' and i.status = 'paid';

insert into payments (
  company_id,
  job_id,
  payment_reference,
  payment_method,
  status,
  received_at,
  amount_cents,
  source_name,
  notes,
  created_at,
  updated_at
)
select
  i.company_id,
  i.job_id,
  'LEGACY-M2-' || j.job_number,
  'other'::payment_method,
  'settled'::payment_status,
  i.issued_at,
  i.total_cents,
  coalesce(i.financer, 'legacy'),
  'Backfilled from legacy m2Status flag',
  i.created_at,
  i.updated_at
from invoices i
join jobs j on j.id = i.job_id
where i.invoice_type = 'm2' and i.status = 'paid';

insert into payment_allocations (payment_id, invoice_id, allocated_cents, created_at)
select
  p.id,
  i.id,
  least(p.amount_cents, i.total_cents),
  p.created_at
from payments p
join invoices i
  on i.job_id = p.job_id
 and (
   (p.payment_reference like 'LEGACY-M1-%' and i.invoice_type = 'm1')
   or
   (p.payment_reference like 'LEGACY-M2-%' and i.invoice_type = 'm2')
 )
where not exists (
  select 1
  from payment_allocations pa
  where pa.payment_id = p.id and pa.invoice_id = i.id
);

insert into job_status_history (
  job_id,
  from_status,
  to_status,
  event_type,
  changed_at,
  note
)
select
  j.id,
  null,
  j.current_status,
  'status_changed'::status_event_type,
  j.current_status_changed_at,
  'Seeded from legacy jobs.data status field'
from jobs j;

insert into job_status_history (
  job_id,
  from_status,
  to_status,
  event_type,
  changed_at,
  related_invoice_id,
  note
)
select
  i.job_id,
  null,
  case
    when i.invoice_type = 'm1' and i.status = 'paid' then 'm1_paid'::job_status
    when i.invoice_type = 'm1' then 'm1_invoiced'::job_status
    when i.invoice_type = 'm2' and i.status = 'paid' then 'paid_in_full'::job_status
    when i.invoice_type = 'm2' then 'm2_invoiced'::job_status
    else 'created'::job_status
  end,
  'invoice_created'::status_event_type,
  coalesce(i.issued_at::timestamptz, i.created_at),
  i.id,
  'Backfilled invoice event'
from invoices i
where i.invoice_type in ('m1', 'm2');

commit;

-- Review queries before enabling strict write paths:
--
-- Duplicate legacy invoice numbers:
-- select invoice_number, count(*)
-- from invoices
-- group by invoice_number
-- having count(*) > 1;
--
-- Jobs with generated migration invoice numbers:
-- select job_id, invoice_type, invoice_number
-- from invoices
-- where invoice_number like 'MIG-%';
--
-- Payments missing dates:
-- select *
-- from payments
-- where received_at is null;
