const PREVIEW_LIMIT = 5;

function normalizeSource(value) {
  const source = String(value || "").trim().toLowerCase();
  return source || "csv";
}

function normalizeMode(value) {
  return String(value || "").trim().toLowerCase() === "update" ? "update" : "import";
}

export async function ensureImportBatchTables(sql) {
  await sql`
    create table if not exists import_batches (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null references companies(id) on delete cascade,
      source text not null default 'csv',
      mode text not null default 'import',
      file_name text,
      created_by uuid references app_users(id) on delete set null,
      created_at timestamptz not null default now(),
      reverted_at timestamptz
    )
  `;

  await sql`
    create table if not exists import_batch_jobs (
      id uuid primary key default gen_random_uuid(),
      batch_id uuid not null references import_batches(id) on delete cascade,
      job_id uuid not null,
      job_number text not null,
      customer_name text,
      source_row integer,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create index if not exists import_batches_company_created_idx
      on import_batches(company_id, created_at desc)
  `;

  await sql`
    create index if not exists import_batches_company_source_created_idx
      on import_batches(company_id, source, created_at desc)
  `;

  await sql`
    create unique index if not exists import_batch_jobs_batch_job_uniq
      on import_batch_jobs(batch_id, job_id)
  `;
}

export async function createImportBatch(sql, {
  companyId,
  actorId = null,
  source = "csv",
  mode = "import",
  fileName = null,
}) {
  const rows = await sql`
    insert into import_batches (
      company_id,
      source,
      mode,
      file_name,
      created_by,
      created_at
    )
    values (
      ${companyId},
      ${normalizeSource(source)},
      ${normalizeMode(mode)},
      ${fileName ? String(fileName).trim() : null},
      ${actorId},
      now()
    )
    returning id, source, mode, file_name, created_at, reverted_at
  `;

  return rows[0];
}

export async function addImportBatchJob(sql, {
  batchId,
  jobId,
  jobNumber,
  customerName = null,
  sourceRow = null,
}) {
  await sql`
    insert into import_batch_jobs (
      batch_id,
      job_id,
      job_number,
      customer_name,
      source_row,
      created_at
    )
    values (
      ${batchId},
      ${jobId},
      ${String(jobNumber || "").trim()},
      ${customerName ? String(customerName).trim() : null},
      ${sourceRow},
      now()
    )
    on conflict (batch_id, job_id) do nothing
  `;
}

async function loadBatchPreviewJobs(sql, batchIds) {
  if (!batchIds.length) return new Map();

  const rows = await sql`
    select
      batch_id,
      job_number,
      customer_name,
      source_row,
      created_at
    from (
      select
        ibj.*,
        row_number() over (
          partition by batch_id
          order by created_at asc, job_number asc
        ) as row_num
      from import_batch_jobs ibj
      where batch_id = any(${batchIds}::uuid[])
    ) ranked
    where row_num <= ${PREVIEW_LIMIT}
    order by created_at desc
  `;

  const previewMap = new Map();
  for (const row of rows) {
    const existing = previewMap.get(row.batch_id) || [];
    existing.push({
      jobNumber: row.job_number,
      customerName: row.customer_name,
      sourceRow: row.source_row,
    });
    previewMap.set(row.batch_id, existing);
  }
  return previewMap;
}

export async function listImportBatches(sql, companyId, {
  source = null,
  limit = 5,
  includeReverted = false,
} = {}) {
  const sourceFilter = normalizeSource(source);
  const rows = await sql`
    select
      b.id,
      b.source,
      b.mode,
      b.file_name,
      b.created_at,
      b.reverted_at,
      count(j.id)::integer as job_count
    from import_batches b
    left join import_batch_jobs j on j.batch_id = b.id
    where b.company_id = ${companyId}
      and (${source ? sourceFilter : null}::text is null or b.source = ${source ? sourceFilter : null})
      and (${includeReverted}::boolean = true or b.reverted_at is null)
    group by b.id
    order by b.created_at desc
    limit ${Math.max(1, Math.min(Number(limit) || 5, 20))}
  `;

  const previewMap = await loadBatchPreviewJobs(sql, rows.map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    mode: row.mode,
    fileName: row.file_name,
    createdAt: row.created_at,
    revertedAt: row.reverted_at,
    jobCount: row.job_count,
    previewJobs: previewMap.get(row.id) || [],
  }));
}

export async function getImportBatch(sql, companyId, batchId) {
  const rows = await sql`
    select
      b.id,
      b.source,
      b.mode,
      b.file_name,
      b.created_at,
      b.reverted_at,
      count(j.id)::integer as job_count
    from import_batches b
    left join import_batch_jobs j on j.batch_id = b.id
    where b.company_id = ${companyId}
      and b.id = ${batchId}
    group by b.id
    limit 1
  `;

  if (!rows.length) return null;
  const batch = rows[0];
  const previewMap = await loadBatchPreviewJobs(sql, [batch.id]);
  return {
    id: batch.id,
    source: batch.source,
    mode: batch.mode,
    fileName: batch.file_name,
    createdAt: batch.created_at,
    revertedAt: batch.reverted_at,
    jobCount: batch.job_count,
    previewJobs: previewMap.get(batch.id) || [],
  };
}

export async function revertImportBatch(sql, companyId, batchId) {
  await sql`begin`;
  try {
    const batchRows = await sql`
      select id, source, mode, file_name, created_at, reverted_at
      from import_batches
      where id = ${batchId}
        and company_id = ${companyId}
      limit 1
    `;

    const batch = batchRows[0];
    if (!batch) {
      throw new Error("Import batch not found");
    }
    if (batch.reverted_at) {
      throw new Error("Import batch already reverted");
    }
    if (batch.mode !== "import") {
      throw new Error("Only created-job import batches can be reverted");
    }

    const jobRows = await sql`
      select distinct
        ibj.job_id,
        j.customer_id
      from import_batch_jobs ibj
      left join jobs j on j.id = ibj.job_id
      where ibj.batch_id = ${batchId}
    `;

    const jobIds = jobRows.map((row) => row.job_id).filter(Boolean);
    const customerIds = [...new Set(jobRows.map((row) => row.customer_id).filter(Boolean))];

    if (jobIds.length) {
      await sql`
        delete from payments
        where job_id = any(${jobIds}::uuid[])
      `;

      await sql`
        delete from invoices
        where job_id = any(${jobIds}::uuid[])
      `;

      await sql`
        delete from inspections
        where job_id = any(${jobIds}::uuid[])
      `;

      await sql`
        delete from jobs
        where id = any(${jobIds}::uuid[])
          and company_id = ${companyId}
      `;
    }

    if (customerIds.length) {
      await sql`
        delete from customers c
        where c.id = any(${customerIds}::uuid[])
          and c.company_id = ${companyId}
          and not exists (
            select 1
            from jobs j
            where j.customer_id = c.id
          )
      `;
    }

    await sql`
      update import_batches
      set reverted_at = now()
      where id = ${batchId}
    `;

    await sql`commit`;

    return {
      id: batch.id,
      source: batch.source,
      mode: batch.mode,
      fileName: batch.file_name,
      createdAt: batch.created_at,
      revertedAt: new Date().toISOString(),
      deletedJobs: jobIds.length,
    };
  } catch (error) {
    try { await sql`rollback`; } catch {}
    throw error;
  }
}
