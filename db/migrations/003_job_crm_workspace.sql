do $$
begin
  if not exists (select 1 from pg_type where typname = 'crm_contact_channel') then
    create type crm_contact_channel as enum ('call', 'text', 'email', 'voicemail', 'note');
  end if;

  if not exists (select 1 from pg_type where typname = 'crm_contact_direction') then
    create type crm_contact_direction as enum ('outbound', 'inbound', 'internal');
  end if;

  if not exists (select 1 from pg_type where typname = 'follow_up_task_status') then
    create type follow_up_task_status as enum ('open', 'in_progress', 'done');
  end if;

  if not exists (select 1 from pg_type where typname = 'follow_up_task_priority') then
    create type follow_up_task_priority as enum ('low', 'medium', 'high');
  end if;
end
$$;

alter table jobs
  add column if not exists last_contact_at timestamptz,
  add column if not exists next_follow_up_at date,
  add column if not exists follow_up_owner_id uuid references app_users(id) on delete set null;

create index if not exists jobs_last_contact_idx on jobs(last_contact_at desc);
create index if not exists jobs_next_follow_up_idx on jobs(next_follow_up_at);
create index if not exists jobs_follow_up_owner_idx on jobs(follow_up_owner_id);

create table if not exists job_contact_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  contact_channel crm_contact_channel not null default 'note',
  contact_direction crm_contact_direction not null default 'outbound',
  summary text not null,
  details text,
  contacted_at timestamptz not null default now(),
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_contact_log_job_contacted_idx
  on job_contact_log(job_id, contacted_at desc);

create table if not exists job_follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  title text not null,
  details text,
  status follow_up_task_status not null default 'open',
  priority follow_up_task_priority not null default 'medium',
  due_at date,
  owner_user_id uuid references app_users(id) on delete set null,
  completed_at timestamptz,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_follow_up_tasks_job_status_idx
  on job_follow_up_tasks(job_id, status, due_at asc);

create index if not exists job_follow_up_tasks_owner_status_idx
  on job_follow_up_tasks(owner_user_id, status, due_at asc);
