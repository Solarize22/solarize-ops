create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  source text not null default 'csv',
  mode text not null default 'import',
  file_name text,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  reverted_at timestamptz
);

create index if not exists import_batches_company_created_idx
  on import_batches(company_id, created_at desc);

create index if not exists import_batches_company_source_created_idx
  on import_batches(company_id, source, created_at desc);

create table if not exists import_batch_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references import_batches(id) on delete cascade,
  job_id uuid not null,
  job_number text not null,
  customer_name text,
  source_row integer,
  created_at timestamptz not null default now()
);

create unique index if not exists import_batch_jobs_batch_job_uniq
  on import_batch_jobs(batch_id, job_id);
