-- Run this first in any environment that still uses the legacy JSONB tables.
-- It renames the old tables so the normalized schema can use the canonical names.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'jobs'
      and column_name = 'data'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_name = 'legacy_jobs'
  ) then
    alter table jobs rename to legacy_jobs;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_name = 'import_batches'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_name = 'legacy_import_batches'
  ) then
    alter table import_batches rename to legacy_import_batches;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_name = 'users'
      and column_name = 'clerk_id'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_name = 'legacy_users'
  ) then
    alter table users rename to legacy_users;
  end if;
end
$$;
