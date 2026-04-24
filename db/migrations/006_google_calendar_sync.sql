create table if not exists google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  calendar_id text not null default 'primary',
  calendar_summary text,
  connected_email text,
  refresh_token_encrypted text not null,
  scopes text,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  created_by uuid references app_users(id) on delete set null,
  updated_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_connections_company_uniq unique (company_id)
);

create index if not exists google_calendar_connections_company_idx
  on google_calendar_connections(company_id);

create table if not exists google_calendar_event_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  source_type text not null,
  source_record_id text not null,
  calendar_id text not null,
  google_event_id text not null,
  google_event_html_link text,
  google_event_status text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_event_links_company_source_uniq unique (company_id, source_type, source_record_id),
  constraint google_calendar_event_links_company_google_event_uniq unique (company_id, google_event_id)
);

create index if not exists google_calendar_event_links_job_idx
  on google_calendar_event_links(job_id, last_synced_at desc);

create index if not exists google_calendar_event_links_customer_idx
  on google_calendar_event_links(customer_id, last_synced_at desc);
