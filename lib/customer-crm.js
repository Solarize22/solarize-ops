import crypto from "node:crypto";
import { hasColumn, hasTable } from "@/lib/normalized-api";

export function normalizeText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export function normalizePhone(value) {
  return normalizeText(value).replace(/\D/g, "");
}

export function buildCustomerKey(row) {
  return [
    normalizeText(row.customer_email).toLowerCase(),
    normalizePhone(row.customer_phone),
    normalizeText(row.customer_name).toLowerCase(),
  ].join("|");
}

export function customerIdForKey(key) {
  return crypto.createHash("sha1").update(key).digest("hex").slice(0, 12);
}

export function customerIdForRow(row) {
  return normalizeText(row?.customer_id || row?.customerId) || customerIdForKey(buildCustomerKey(row));
}

export function customerIdentityForRow(row) {
  const customerId = customerIdForRow(row);
  return {
    customerId,
    customerPath: `/customers/${customerId}`,
  };
}

export function isClosedJobStatus(status) {
  return ["paid_in_full", "cancelled"].includes(String(status || "").trim());
}

function dateSortValue(value) {
  const parsed = new Date(value || 0);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export function findCustomerRowsById(rows, customerId) {
  return rows.filter((row) => customerIdForRow(row) === customerId);
}

export function pickPrimaryCustomerJob(rows) {
  return [...rows].sort((left, right) => {
    const leftClosed = isClosedJobStatus(left.current_status);
    const rightClosed = isClosedJobStatus(right.current_status);
    if (leftClosed !== rightClosed) {
      return leftClosed ? 1 : -1;
    }

    return dateSortValue(right.current_status_changed_at || right.updated_at || right.created_at)
      - dateSortValue(left.current_status_changed_at || left.updated_at || left.created_at);
  })[0] || null;
}

export function chooseEarlierDate(current, candidate) {
  if (!candidate) return current;
  if (!current) return candidate;
  return String(candidate) < String(current) ? candidate : current;
}

export function chooseLaterDate(current, candidate) {
  if (!candidate) return current;
  if (!current) return candidate;
  return String(candidate) > String(current) ? candidate : current;
}

export async function isCustomerModelInstalled(sql) {
  const [hasCustomersTable, hasCustomerIdColumn] = await Promise.all([
    hasTable(sql, "customers"),
    hasColumn(sql, "jobs", "customer_id"),
  ]);

  return hasCustomersTable && hasCustomerIdColumn;
}

function normalizeNullableText(value) {
  const text = normalizeText(value);
  return text || null;
}

export async function syncCustomerForJob(sql, companyId, jobId, row) {
  if (!(await isCustomerModelInstalled(sql))) {
    return null;
  }

  const jobRows = await sql`
    select customer_id
    from jobs
    where id = ${jobId}
      and company_id = ${companyId}
    limit 1
  `;

  const job = jobRows[0];
  if (!job) return null;

  const customerName = normalizeNullableText(row?.customer_name || row?.customerName) || "Unknown Customer";
  const customerPhone = normalizeNullableText(row?.customer_phone || row?.customerPhone);
  const customerEmail = normalizeNullableText(row?.customer_email || row?.customerEmail);
  const street1 = normalizeNullableText(row?.street_1 || row?.street1);
  const street2 = normalizeNullableText(row?.street_2 || row?.street2);
  const city = normalizeNullableText(row?.city);
  const state = normalizeNullableText(row?.state);
  const postalCode = normalizeNullableText(row?.postal_code || row?.postalCode);
  const county = normalizeNullableText(row?.county);
  const legacyIdentityKey = normalizeNullableText(buildCustomerKey({
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail,
  }));

  let customerId = job.customer_id || null;

  if (!customerId && legacyIdentityKey) {
    const existingRows = await sql`
      select id
      from customers
      where company_id = ${companyId}
        and legacy_identity_key = ${legacyIdentityKey}
      limit 1
    `;
    customerId = existingRows[0]?.id || null;
  }

  if (!customerId) {
    const inserted = await sql`
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
      values (
        ${companyId},
        ${customerName},
        ${customerEmail},
        ${customerPhone},
        ${street1},
        ${street2},
        ${city},
        ${state},
        ${postalCode},
        ${county},
        ${legacyIdentityKey},
        now(),
        now()
      )
      returning id
    `;
    customerId = inserted[0].id;
  } else {
    await sql`
      update customers
      set
        name = ${customerName},
        email = ${customerEmail},
        phone = ${customerPhone},
        street_1 = ${street1},
        street_2 = ${street2},
        city = ${city},
        state = ${state},
        postal_code = ${postalCode},
        county = ${county},
        legacy_identity_key = ${legacyIdentityKey},
        updated_at = now()
      where id = ${customerId}
        and company_id = ${companyId}
    `;
  }

  await sql`
    update jobs
    set
      customer_id = ${customerId},
      updated_at = now()
    where id = ${jobId}
      and company_id = ${companyId}
  `;

  return customerId;
}
