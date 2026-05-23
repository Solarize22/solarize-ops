import fs from "fs";
import { neon } from "@neondatabase/serverless";

function readConnectionString() {
  const envText = fs.readFileSync(".env.local", "utf8");
  const match = envText.match(/^POSTGRES_URL=(.*)$/m);
  if (!match?.[1]) {
    throw new Error("POSTGRES_URL not found in .env.local");
  }
  return match[1].trim();
}

function earlierDate(left, right) {
  if (!left) return right || null;
  if (!right) return left || null;
  return new Date(left).getTime() <= new Date(right).getTime() ? left : right;
}

async function main() {
  const sql = neon(readConnectionString());

  const before = await sql`
    with derived as (
      select
        j.id,
        j.job_number,
        j.customer_name,
        j.current_status,
        j.install_scheduled_at,
        j.install_completed_at,
        j.pto_submitted_at,
        j.pto_granted_at,
        (
          select min(h.changed_at::date)
          from job_status_history h
          where h.job_id = j.id
            and h.to_status = 'scheduled'::job_status
        ) as history_scheduled_at,
        (
          select min(h.changed_at::date)
          from job_status_history h
          where h.job_id = j.id
            and h.to_status = 'install_completed'::job_status
        ) as history_install_completed_at,
        (
          select min(v.visit_date::date)
          from job_field_visits v
          where v.job_id = j.id
            and v.visit_type = 'install_day'::field_visit_type
            and v.status = 'completed'::field_visit_status
        ) as field_install_completed_at,
        (
          select min(h.changed_at::date)
          from job_status_history h
          where h.job_id = j.id
            and h.to_status = 'pto_submitted'::job_status
        ) as history_pto_submitted_at,
        (
          select min(h.changed_at::date)
          from job_status_history h
          where h.job_id = j.id
            and h.to_status = 'pto_granted'::job_status
        ) as history_pto_granted_at
      from jobs j
    )
    select
      count(*) filter (
        where install_completed_at is null
          and (history_install_completed_at is not null or field_install_completed_at is not null)
      )::int as install_completed_repairs,
      count(*) filter (
        where install_scheduled_at is null
          and history_scheduled_at is not null
      )::int as install_scheduled_repairs,
      count(*) filter (
        where pto_submitted_at is null
          and history_pto_submitted_at is not null
      )::int as pto_submitted_repairs,
      count(*) filter (
        where pto_granted_at is null
          and history_pto_granted_at is not null
      )::int as pto_granted_repairs
    from derived
  `;

  const previewRows = await sql`
    with derived as (
      select
        j.job_number,
        j.customer_name,
        j.install_completed_at,
        (
          select min(h.changed_at::date)
          from job_status_history h
          where h.job_id = j.id
            and h.to_status = 'install_completed'::job_status
        ) as history_install_completed_at,
        (
          select min(v.visit_date::date)
          from job_field_visits v
          where v.job_id = j.id
            and v.visit_type = 'install_day'::field_visit_type
            and v.status = 'completed'::field_visit_status
        ) as field_install_completed_at
      from jobs j
    )
    select *
    from derived
    where install_completed_at is null
      and (history_install_completed_at is not null or field_install_completed_at is not null)
    order by customer_name asc
    limit 10
  `;

  await sql`begin`;
  try {
    const jobs = await sql`
      with derived as (
        select
          j.id,
          j.install_scheduled_at,
          j.install_completed_at,
          j.pto_submitted_at,
          j.pto_granted_at,
          (
            select min(h.changed_at::date)
            from job_status_history h
            where h.job_id = j.id
              and h.to_status = 'scheduled'::job_status
          ) as history_scheduled_at,
          (
            select min(h.changed_at::date)
            from job_status_history h
            where h.job_id = j.id
              and h.to_status = 'install_completed'::job_status
          ) as history_install_completed_at,
          (
            select min(v.visit_date::date)
            from job_field_visits v
            where v.job_id = j.id
              and v.visit_type = 'install_day'::field_visit_type
              and v.status = 'completed'::field_visit_status
          ) as field_install_completed_at,
          (
            select min(h.changed_at::date)
            from job_status_history h
            where h.job_id = j.id
              and h.to_status = 'pto_submitted'::job_status
          ) as history_pto_submitted_at,
          (
            select min(h.changed_at::date)
            from job_status_history h
            where h.job_id = j.id
              and h.to_status = 'pto_granted'::job_status
          ) as history_pto_granted_at
        from jobs j
      )
      select *
      from derived
      where
        (install_completed_at is null and (history_install_completed_at is not null or field_install_completed_at is not null))
        or (install_scheduled_at is null and history_scheduled_at is not null)
        or (pto_submitted_at is null and history_pto_submitted_at is not null)
        or (pto_granted_at is null and history_pto_granted_at is not null)
    `;

    let updatedCount = 0;

    for (const job of jobs) {
      const candidateInstallCompletedAt = earlierDate(job.history_install_completed_at, job.field_install_completed_at);
      const candidateInstallScheduledAt = job.history_scheduled_at || null;
      const candidatePtoSubmittedAt = job.history_pto_submitted_at || null;
      const candidatePtoGrantedAt = job.history_pto_granted_at || null;

      const shouldUpdate =
        (job.install_completed_at === null && candidateInstallCompletedAt !== null)
        || (job.install_scheduled_at === null && candidateInstallScheduledAt !== null)
        || (job.pto_submitted_at === null && candidatePtoSubmittedAt !== null)
        || (job.pto_granted_at === null && candidatePtoGrantedAt !== null);

      if (!shouldUpdate) continue;

      await sql`
        update jobs
        set
          install_completed_at = coalesce(install_completed_at, ${candidateInstallCompletedAt}::date),
          install_scheduled_at = coalesce(install_scheduled_at, ${candidateInstallScheduledAt}::date),
          pto_submitted_at = coalesce(pto_submitted_at, ${candidatePtoSubmittedAt}::date),
          pto_granted_at = coalesce(pto_granted_at, ${candidatePtoGrantedAt}::date),
          updated_at = now()
        where id = ${job.id}
      `;
      updatedCount += 1;
    }

    await sql`commit`;

    console.log(JSON.stringify({
      repairedJobs: updatedCount,
      repairableByField: before[0],
      sampleJobs: previewRows,
    }, null, 2));
  } catch (error) {
    try {
      await sql`rollback`;
    } catch {}
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
