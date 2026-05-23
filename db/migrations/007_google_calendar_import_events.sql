create table if not exists google_calendar_import_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  calendar_id text not null,
  google_event_id text not null,
  summary text,
  description text,
  location text,
  status text,
  html_link text,
  start_at timestamptz,
  end_at timestamptz,
  start_date date,
  end_date date,
  is_all_day boolean not null default false,
  matched_job_id uuid references jobs(id) on delete set null,
  matched_source_type text,
  matched_source_record_id text,
  imported_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_import_events_company_event_uniq unique (company_id, google_event_id)
);

create index if not exists google_calendar_import_events_company_seen_idx
  on google_calendar_import_events(company_id, last_seen_at desc);

create index if not exists google_calendar_import_events_match_idx
  on google_calendar_import_events(company_id, matched_job_id, matched_source_type);
