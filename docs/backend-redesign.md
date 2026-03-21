# Backend Redesign

This app should move to a normalized Neon/Postgres model where:

- `jobs` is the source of truth for the project itself
- `invoices` is the source of truth for money requested
- `payments` is the source of truth for money received
- `inspections` is the source of truth for inspection scheduling/results
- `job_status_history` is the source of truth for workflow audit history

## Rollout Order

1. Apply `db/migrations/000_prepare_legacy_tables.sql` if the environment still has the old JSONB tables.
2. Apply `db/migrations/001_normalized_schema.sql`.
3. Review legacy data conflicts before backfill.
4. Apply `db/migrations/002_backfill_from_legacy_jobs.sql` in a staging database first.
5. Build new read endpoints that query normalized tables.
6. Switch the frontend reads one page at a time.
7. Move writes to the new schema.
8. Freeze writes to legacy JSON blobs.
9. Remove legacy-field-based UI logic.

## What Stays In Jobs

- job number
- customer/site identity
- utility/financer/contractor metadata
- system configuration metadata
- top-level milestone dates
- current status
- freeform notes

## What Moves Out Of Jobs

- M1 and M2 invoice numbers
- M1 and M2 invoice amounts
- payment booleans
- adder money
- invoice aging
- payment dates and methods
- inspection details/results
- status history

## Derived Instead Of Stored

- total invoiced
- total paid
- total outstanding
- M1 paid / M2 paid
- paid-in-full
- aging buckets
- dashboard rollups

## Example Query Shapes

### Jobs list with balances

```sql
select
  j.id,
  j.job_number,
  j.customer_name,
  j.current_status,
  j.install_scheduled_at,
  j.install_completed_at,
  j.pto_granted_at,
  coalesce(sum(case when i.status <> 'void' then i.total_cents else 0 end), 0) as total_invoiced_cents,
  coalesce(sum(case when i.status <> 'void' then i.balance_cents else 0 end), 0) as outstanding_cents
from jobs j
left join invoices i on i.job_id = j.id
where j.company_id = $1
group by j.id
order by j.created_at desc;
```

### Job detail

```sql
select
  j.*,
  coalesce(sum(case when i.status <> 'void' then i.total_cents else 0 end), 0) as total_invoiced_cents,
  coalesce(sum(case when i.status <> 'void' then i.balance_cents else 0 end), 0) as outstanding_cents
from jobs j
left join invoices i on i.job_id = j.id
where j.id = $1
group by j.id;
```

### Invoices for a job

```sql
select *
from invoices
where job_id = $1
order by created_at asc;
```

### Payments for a job

```sql
select *
from payments
where job_id = $1
order by received_at nulls last, created_at asc;
```

### Status history for a job

```sql
select *
from job_status_history
where job_id = $1
order by changed_at desc;
```

## API Shape

- `GET /api/jobs`
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/invoices`
- `GET /api/jobs/:id/payments`
- `GET /api/jobs/:id/inspections`
- `GET /api/jobs/:id/history`
- `POST /api/jobs`
- `POST /api/jobs/:id/invoices`
- `POST /api/payments`
- `POST /api/jobs/:id/status-transitions`

## Status Transition Guidance

- `scheduled` after the install is booked
- `install_completed` after install is actually complete
- `inspection_scheduled` after inspection is booked
- `inspection_passed` after inspection passes
- `pto_granted` after utility grants PTO
- `m1_invoiced` and `m2_invoiced` should come from invoice records, not booleans
- `m1_paid`, `m2_partially_paid`, and `paid_in_full` should come from invoice balances and payment allocations

## Frontend Cleanup

Frontend code should stop deriving invoices and payments from job fields. The existing helpers in `lib/useAllJobs.js` and finance booleans in job records should be removed once the normalized endpoints are live.
