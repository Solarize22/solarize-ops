do $$
begin
  if not exists (select 1 from pg_type where typname = 'field_visit_type') then
    create type field_visit_type as enum ('install_day', 'site_visit', 'service_call');
  end if;

  if not exists (select 1 from pg_type where typname = 'field_visit_status') then
    create type field_visit_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');
  end if;
end
$$;

create table if not exists job_field_visits (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  visit_type field_visit_type not null,
  status field_visit_status not null default 'scheduled',
  visit_date date not null,
  completed_at timestamptz,
  install_day_number integer,
  title text not null,
  details text,
  outcome text,
  assigned_user_id uuid references app_users(id) on delete set null,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_field_visits_install_day_rule
    check (
      (visit_type = 'install_day' and install_day_number is not null and install_day_number > 0)
      or (visit_type <> 'install_day' and install_day_number is null)
    ),
  constraint job_field_visits_completion_rule
    check (
      (status = 'completed' and completed_at is not null)
      or (status <> 'completed' and completed_at is null)
    )
);

create index if not exists job_field_visits_job_idx
  on job_field_visits(job_id, visit_type, visit_date desc);

create index if not exists job_field_visits_status_idx
  on job_field_visits(status, visit_date desc);

create index if not exists job_field_visits_assigned_idx
  on job_field_visits(assigned_user_id, status, visit_date desc);

create unique index if not exists job_field_visits_install_day_uniq
  on job_field_visits(job_id, install_day_number)
  where visit_type = 'install_day';
