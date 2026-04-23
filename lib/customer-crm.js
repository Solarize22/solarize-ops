import crypto from "node:crypto";

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

export function customerIdentityForRow(row) {
  const key = buildCustomerKey(row);
  const customerId = customerIdForKey(key);
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
  return rows.filter((row) => customerIdForKey(buildCustomerKey(row)) === customerId);
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
