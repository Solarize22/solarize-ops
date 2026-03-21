create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'company_role') then
    create type company_role as enum ('owner', 'admin', 'ops', 'installer', 'sales', 'accounting');
  end if;

  if not exists (select 1 from pg_type where typname = 'job_status') then
    create type job_status as enum (
      'created',
      'scheduled',
      'install_completed',
      'inspection_scheduled',
      'inspection_passed',
      'inspection_failed',
      'pto_submitted',
      'pto_granted',
      'm1_invoiced',
      'm1_partially_paid',
      'm1_paid',
      'm2_invoiced',
      'm2_partially_paid',
      'paid_in_full',
      'on_hold',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'status_event_type') then
    create type status_event_type as enum (
      'job_created',
      'job_scheduled',
      'install_completed',
      'inspection_scheduled',
      'inspection_passed',
      'inspection_failed',
      'pto_submitted',
      'pto_granted',
      'invoice_created',
      'invoice_sent',
      'payment_received',
      'status_changed',
      'note'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'invoice_type') then
    create type invoice_type as enum ('m1', 'm2', 'adder', 'special');
  end if;

  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type invoice_status as enum (
      'draft',
      'issued',
      'sent',
      'partially_paid',
      'paid',
      'void'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type payment_method as enum (
      'ach',
      'wire',
      'check',
      'credit_card',
      'financer',
      'cash',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum (
      'pending',
      'settled',
      'failed',
      'reversed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'inspection_result') then
    create type inspection_result as enum ('scheduled', 'passed', 'failed', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'inspection_type') then
    create type inspection_type as enum ('electrical', 'building', 'final', 'other');
  end if;
end
$$;

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  clerk_user_id text unique,
  email text not null,
  full_name text not null,
  role company_role not null default 'ops',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists app_users_company_email_uniq
  on app_users (company_id, lower(email));

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,

  job_number text not null,
  external_job_id text,

  customer_name text not null,
  customer_phone text,
  customer_email text,

  street_1 text not null,
  street_2 text,
  city text not null,
  state text not null,
  postal_code text,
  county text,

  contract_type text,
  financer text,
  contractor text,
  partner text,
  utility_company text,

  rep_user_id uuid references app_users(id) on delete set null,

  system_size_kw numeric(10,2),
  panel_count integer,
  watt_per_panel integer,
  inverter text,
  module text,
  battery boolean not null default false,
  roof_type text,

  contract_signed_at date,
  site_survey_at date,
  install_scheduled_at date,
  install_completed_at date,
  pto_submitted_at date,
  pto_granted_at date,

  current_status job_status not null default 'created',
  current_status_changed_at timestamptz not null default now(),

  is_active boolean not null default true,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint jobs_company_job_number_uniq unique (company_id, job_number),
  constraint jobs_panel_count_nonnegative check (panel_count is null or panel_count >= 0),
  constraint jobs_watt_per_panel_nonnegative check (watt_per_panel is null or watt_per_panel >= 0),
  constraint jobs_system_size_nonnegative check (system_size_kw is null or system_size_kw >= 0)
);

create index if not exists jobs_company_status_idx on jobs(company_id, current_status);
create index if not exists jobs_rep_user_idx on jobs(rep_user_id);
create index if not exists jobs_install_scheduled_idx on jobs(install_scheduled_at);
create index if not exists jobs_install_completed_idx on jobs(install_completed_at);
create index if not exists jobs_pto_granted_idx on jobs(pto_granted_at);
create unique index if not exists jobs_company_external_job_id_uniq
  on jobs(company_id, external_job_id)
  where external_job_id is not null;

create table if not exists job_crew_assignments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete restrict,
  assignment_role text not null default 'crew',
  created_at timestamptz not null default now(),
  constraint job_crew_assignments_uniq unique (job_id, user_id, assignment_role)
);

create index if not exists job_crew_assignments_user_idx on job_crew_assignments(user_id);

create table if not exists inspections (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  inspection_type inspection_type not null default 'final',
  scheduled_at timestamptz,
  completed_at timestamptz,
  result inspection_result not null default 'scheduled',
  inspector_name text,
  authority_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspections_completed_if_finalized
    check (
      (result in ('passed', 'failed') and completed_at is not null)
      or (result in ('scheduled', 'cancelled'))
    )
);

create index if not exists inspections_job_idx on inspections(job_id);
create index if not exists inspections_scheduled_idx on inspections(scheduled_at);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete restrict,

  invoice_number text not null,
  invoice_type invoice_type not null,
  status invoice_status not null default 'draft',

  issued_at date,
  sent_at date,
  due_at date,

  subtotal_cents integer not null default 0,
  total_cents integer not null,
  balance_cents integer not null,

  financer text,
  memo text,

  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint invoices_company_invoice_number_uniq unique (company_id, invoice_number),
  constraint invoices_total_nonnegative check (total_cents >= 0),
  constraint invoices_balance_nonnegative check (balance_cents >= 0),
  constraint invoices_balance_le_total check (balance_cents <= total_cents)
);

create index if not exists invoices_job_idx on invoices(job_id);
create index if not exists invoices_status_idx on invoices(company_id, status);
create index if not exists invoices_type_idx on invoices(company_id, invoice_type);

create unique index if not exists invoices_job_m1_uniq
  on invoices (job_id)
  where invoice_type = 'm1';

create unique index if not exists invoices_job_m2_uniq
  on invoices (job_id)
  where invoice_type = 'm2';

create table if not exists invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  line_type invoice_type not null,
  description text not null,
  amount_cents integer not null,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  constraint invoice_line_items_amount_nonnegative check (amount_cents >= 0)
);

create index if not exists invoice_line_items_invoice_idx on invoice_line_items(invoice_id);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete restrict,

  payment_reference text,
  payment_method payment_method not null,
  status payment_status not null default 'settled',

  received_at date,
  amount_cents integer not null,
  source_name text,
  notes text,

  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payments_amount_positive check (amount_cents > 0)
);

create index if not exists payments_job_idx on payments(job_id);
create index if not exists payments_company_received_idx on payments(company_id, received_at);

create table if not exists payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete restrict,
  allocated_cents integer not null,
  created_at timestamptz not null default now(),
  constraint payment_allocations_positive check (allocated_cents > 0),
  constraint payment_allocations_uniq unique (payment_id, invoice_id)
);

create index if not exists payment_allocations_invoice_idx on payment_allocations(invoice_id);

create table if not exists job_status_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  from_status job_status,
  to_status job_status not null,
  event_type status_event_type not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references app_users(id) on delete set null,
  related_invoice_id uuid references invoices(id) on delete set null,
  related_payment_id uuid references payments(id) on delete set null,
  related_inspection_id uuid references inspections(id) on delete set null,
  note text
);

create index if not exists job_status_history_job_changed_idx
  on job_status_history(job_id, changed_at desc);
