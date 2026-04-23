create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  street_1 text,
  street_2 text,
  city text,
  state text,
  postal_code text,
  county text,
  legacy_identity_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_company_idx on customers(company_id);
create unique index if not exists customers_company_legacy_identity_uniq
  on customers(company_id, legacy_identity_key)
  where legacy_identity_key is not null;

alter table jobs
  add column if not exists customer_id uuid references customers(id) on delete set null;

create index if not exists jobs_customer_idx on jobs(customer_id);

with customer_groups as (
  select distinct on (
    j.company_id,
    lower(trim(coalesce(j.customer_email, ''))),
    regexp_replace(coalesce(j.customer_phone, ''), '\D', '', 'g'),
    lower(trim(coalesce(j.customer_name, '')))
  )
    j.company_id,
    j.customer_name as name,
    j.customer_email as email,
    j.customer_phone as phone,
    j.street_1,
    j.street_2,
    j.city,
    j.state,
    j.postal_code,
    j.county,
    concat_ws(
      '|',
      lower(trim(coalesce(j.customer_email, ''))),
      regexp_replace(coalesce(j.customer_phone, ''), '\D', '', 'g'),
      lower(trim(coalesce(j.customer_name, '')))
    ) as legacy_identity_key
  from jobs j
  order by
    j.company_id,
    lower(trim(coalesce(j.customer_email, ''))),
    regexp_replace(coalesce(j.customer_phone, ''), '\D', '', 'g'),
    lower(trim(coalesce(j.customer_name, ''))),
    j.created_at asc
)
insert into customers (
  company_id,
  name,
  email,
  phone,
  street_1,
  street_2,
  city,
  state,
  postal_code,
  county,
  legacy_identity_key,
  created_at,
  updated_at
)
select
  cg.company_id,
  coalesce(nullif(trim(cg.name), ''), 'Unknown Customer'),
  nullif(trim(cg.email), ''),
  nullif(trim(cg.phone), ''),
  nullif(trim(cg.street_1), ''),
  nullif(trim(cg.street_2), ''),
  nullif(trim(cg.city), ''),
  nullif(trim(cg.state), ''),
  nullif(trim(cg.postal_code), ''),
  nullif(trim(cg.county), ''),
  nullif(trim(cg.legacy_identity_key), ''),
  now(),
  now()
from customer_groups cg
left join customers existing
  on existing.company_id = cg.company_id
 and existing.legacy_identity_key = nullif(trim(cg.legacy_identity_key), '')
where existing.id is null;

with customer_groups as (
  select distinct on (
    j.company_id,
    lower(trim(coalesce(j.customer_email, ''))),
    regexp_replace(coalesce(j.customer_phone, ''), '\D', '', 'g'),
    lower(trim(coalesce(j.customer_name, '')))
  )
    j.company_id,
    j.customer_name as name,
    j.customer_email as email,
    j.customer_phone as phone,
    j.street_1,
    j.street_2,
    j.city,
    j.state,
    j.postal_code,
    j.county,
    concat_ws(
      '|',
      lower(trim(coalesce(j.customer_email, ''))),
      regexp_replace(coalesce(j.customer_phone, ''), '\D', '', 'g'),
      lower(trim(coalesce(j.customer_name, '')))
    ) as legacy_identity_key
  from jobs j
  order by
    j.company_id,
    lower(trim(coalesce(j.customer_email, ''))),
    regexp_replace(coalesce(j.customer_phone, ''), '\D', '', 'g'),
    lower(trim(coalesce(j.customer_name, ''))),
    j.created_at asc
)
update customers c
set
  name = source.name,
  email = source.email,
  phone = source.phone,
  street_1 = source.street_1,
  street_2 = source.street_2,
  city = source.city,
  state = source.state,
  postal_code = source.postal_code,
  county = source.county,
  updated_at = now()
from (
  select
    cg.company_id,
    coalesce(nullif(trim(cg.name), ''), 'Unknown Customer') as name,
    nullif(trim(cg.email), '') as email,
    nullif(trim(cg.phone), '') as phone,
    nullif(trim(cg.street_1), '') as street_1,
    nullif(trim(cg.street_2), '') as street_2,
    nullif(trim(cg.city), '') as city,
    nullif(trim(cg.state), '') as state,
    nullif(trim(cg.postal_code), '') as postal_code,
    nullif(trim(cg.county), '') as county,
    nullif(trim(cg.legacy_identity_key), '') as legacy_identity_key
  from customer_groups cg
) source
where c.company_id = source.company_id
  and c.legacy_identity_key = source.legacy_identity_key;

update jobs j
set customer_id = c.id
from customers c
where j.customer_id is null
  and c.company_id = j.company_id
  and c.legacy_identity_key = concat_ws(
    '|',
    lower(trim(coalesce(j.customer_email, ''))),
    regexp_replace(coalesce(j.customer_phone, ''), '\D', '', 'g'),
    lower(trim(coalesce(j.customer_name, '')))
  );
