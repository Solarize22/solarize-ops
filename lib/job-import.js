const VALID_STATUSES = [
  "scheduled",
  "install_completed",
  "inspection_scheduled",
  "inspection_passed",
  "pto_granted",
  "m1_invoiced",
  "m1_paid",
  "m2_invoiced",
  "paid_in_full",
  "on_hold",
];

const STATUS_LABELS = {
  scheduled: "Scheduled",
  install_completed: "Install complete",
  inspection_scheduled: "Inspection scheduled",
  inspection_passed: "Inspection passed",
  pto_granted: "PTO granted",
  m1_invoiced: "M1 invoiced",
  m1_paid: "M1 paid",
  m2_invoiced: "M2 invoiced",
  paid_in_full: "Paid in full / closed",
  on_hold: "On hold / issue",
};

const STATE_ABBREV = {
  connecticut: "CT",
  massachusetts: "MA",
  "new hampshire": "NH",
  maine: "ME",
  vermont: "VT",
  "rhode island": "RI",
  "new york": "NY",
  "new jersey": "NJ",
  california: "CA",
  florida: "FL",
  texas: "TX",
  ohio: "OH",
};

const TRUTHY_VALUES = new Set(["yes", "true", "1", "x", "paid", "complete", "completed"]);

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .replace(/^"|"$/g, "")
    .toLowerCase()
    .replace(/[\s\-/()%]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function normalizeCell(value) {
  return String(value || "").trim().replace(/^"|"$/g, "");
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }

  const nonEmptyRows = rows
    .map((cells) => cells.map(normalizeCell))
    .filter((cells) => cells.some((cell) => cell !== ""))
    .filter((cells) => {
      const firstCell = cells.find((cell) => cell !== "") || "";
      return !firstCell.startsWith("#");
    });

  if (nonEmptyRows.length < 2) return [];

  const headers = nonEmptyRows[0].map(normalizeHeader);
  return nonEmptyRows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      if (header) record[header] = cells[index] || "";
    });
    return record;
  });
}

function firstValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== "") return row[key];
  }
  return "";
}

function hasAny(row, keys) {
  return keys.some((key) => row[key] !== undefined && row[key] !== "");
}

function parseBoolean(value) {
  return TRUTHY_VALUES.has(String(value || "").trim().toLowerCase());
}

function parseMoney(value) {
  const amount = parseFloat(String(value || "").replace(/[$,]/g, "").trim());
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeState(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const lowered = raw.toLowerCase();
  return STATE_ABBREV[lowered] || raw.toUpperCase().slice(0, 2);
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, "0");
    const day = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  return raw;
}

function normalizeInvoiceNumber(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const lowered = normalized.toLowerCase();
  if (["paid", "unpaid", "complete", "completed", "yes", "no", "true", "false", "none", "n/a", "na", "-"].includes(lowered)) {
    return null;
  }
  return normalized;
}

function deriveStatus({ explicitStatus, installCompletedAt, inspectionCompletedAt, ptoGrantedAt, m1, m2, issueFlag }) {
  const raw = String(explicitStatus || "").trim().toLowerCase().replace(/[\s/]+/g, "_");
  if (["scheduled", "inspection_scheduled", "inspection_passed", "pto_granted", "m1_invoiced", "m1_paid", "m2_invoiced", "paid_in_full", "on_hold"].includes(raw)) {
    return raw;
  }
  if (["rescheduled", "issue", "on_hold", "pto_hold", "rescheduled_issue"].includes(raw) || issueFlag) return "on_hold";
  if (["closed", "fully_paid", "fully_paid_closed", "paid"].includes(raw)) return "paid_in_full";
  if (["inspection_scheduled", "waiting_inspection", "inspection_pending"].includes(raw)) return "inspection_scheduled";
  if (["inspection_passed", "passed", "need_m2"].includes(raw)) return "inspection_passed";
  if (m2.paid) return "paid_in_full";
  if (m2.amount > 0 || m2.invoiceNumber) return "m2_invoiced";
  if (ptoGrantedAt) return "pto_granted";
  if (inspectionCompletedAt) return "inspection_passed";
  if (m1.paid) return "m1_paid";
  if (m1.amount > 0 || m1.invoiceNumber) return "m1_invoiced";
  if (["install_complete", "installed", "complete", "in_progress"].includes(raw)) return "install_completed";
  if (installCompletedAt) return "install_completed";
  return "scheduled";
}

function buildActions(draft, mode) {
  const actions = [];
  actions.push(mode === "import" ? "Create job" : "Update job");

  if (draft.milestones.contractSignedAt) actions.push("Set contract signed");
  if (draft.milestones.siteSurveyAt) actions.push("Set site survey");
  if (draft.milestones.installScheduledAt) actions.push("Set install date");
  if (draft.milestones.inspectionCompletedAt) actions.push("Set inspection date");
  if (draft.milestones.ptoGrantedAt) actions.push("Set PTO date");

  if (draft.financials.m1.invoiceNumber || draft.financials.m1.amount > 0) actions.push("Create or update M1");
  if (draft.financials.m1.paid) actions.push("Record M1 payment");
  if (draft.financials.m2.invoiceNumber || draft.financials.m2.amount > 0) actions.push("Create or update M2");
  if (draft.financials.m2.paid) actions.push("Record M2 payment");
  if (draft.financials.adder.amount > 0) actions.push("Create adder invoice");

  return actions;
}

export function mapCsvRowToDraft(row, index, mode = "import") {
  const get = (...keys) => firstValue(row, keys);
  const has = (...keys) => hasAny(row, keys);

  const jobNumber = get("job_id", "job_", "job_number", "id", "job", "project_id").trim() || `IMPORT-${index + 1}`;
  const address = get("address", "full_address");
  let street = get("street", "street_address");
  let city = get("city");
  let state = get("state", "market");
  let zip = get("zip", "zipcode", "zip_code");

  if (!street && address) {
    const parts = address.split(",").map((part) => part.trim());
    street = parts[0] || "";
    city = parts[1] || "";
    const stateZip = (parts[2] || "").trim().split(/\s+/);
    state = stateZip[0] || "";
    zip = stateZip[1] || parts[3] || "";
  }

  const m1InvoiceNumber = normalizeInvoiceNumber(get("m1_invoice_number", "m1_invoice"));
  const m2InvoiceNumber = normalizeInvoiceNumber(get("m2_invoice_number", "m2_invoice"));
  const m1Amount = parseMoney(get("m1_amount", "m1_amt", "due_80", "due_80_"));
  const m2Amount = parseMoney(get("m2_amount", "m2_amt", "due_20", "due_20_"));
  const adders = parseMoney(get("adders", "adder"));
  const m1Paid = parseBoolean(get("m1_status", "m1_received", "m1_paid", "m1"));
  const m2Paid = parseBoolean(get("m2_status", "m2_received", "m2_paid", "m2"));

  const draft = {
    mode,
    sourceRow: index + 2,
    raw: row,
    jobNumber,
    customerName: get("customer", "customer_name", "homeowner", "name", "job_name").trim(),
    phone: get("phone", "phone_number").trim(),
    email: get("email", "email_address").trim(),
    address: {
      street1: street.trim(),
      city: city.trim(),
      state: normalizeState(state),
      postalCode: zip.trim(),
      county: get("county").trim(),
    },
    system: {
      systemSizeKw: get("system_size_kw", "system_size", "kw").trim(),
      panelCount: parseInt(get("panel_count", "panels") || "0", 10) || 0,
      wattPerPanel: parseInt(get("watt_per_panel", "watt_panel", "watt", "watts") || "0", 10) || 0,
      inverter: get("inverter").trim(),
      module: get("module").trim(),
      battery: parseBoolean(get("battery")),
      roofType: get("roof_type").trim(),
    },
    job: {
      contractType: get("deal").trim(),
      financer: get("financer", "finance").trim(),
      utilityCompany: get("utility_company", "utility").trim(),
      contractor: get("contractor").trim(),
      partner: get("build_partner", "partner").trim(),
      rep: get("rep", "salesperson").trim(),
      notes: [get("notes"), get("additional_notes")].filter(Boolean).join(" ").trim(),
      explicitStatus: get("status").trim(),
    },
    crew: get("crew", "crew_members")
      .split(/[,;]+/)
      .map((name) => name.trim())
      .filter(Boolean),
    milestones: {
      contractSignedAt: normalizeDate(get("contract_signed", "contract_date")),
      siteSurveyAt: normalizeDate(get("site_survey_date")),
      installScheduledAt: normalizeDate(get("install_date", "due_date")),
      inspectionCompletedAt: normalizeDate(get("inspection_date", "inspection")),
      ptoGrantedAt: normalizeDate(get("pto_date")),
    },
    financials: {
      m1: {
        provided: has("m1_invoice_number", "m1_invoice", "m1_amount", "m1_amt", "m1_status", "m1_received", "m1_paid", "m1"),
        invoiceNumberProvided: has("m1_invoice_number", "m1_invoice"),
        amountProvided: has("m1_amount", "m1_amt", "due_80", "due_80_"),
        paidProvided: has("m1_status", "m1_received", "m1_paid", "m1"),
        invoiceNumber: m1InvoiceNumber,
        amount: m1Amount,
        paid: m1Paid,
      },
      m2: {
        provided: has("m2_invoice_number", "m2_invoice", "m2_amount", "m2_amt", "m2_status", "m2_received", "m2_paid", "m2"),
        invoiceNumberProvided: has("m2_invoice_number", "m2_invoice"),
        amountProvided: has("m2_amount", "m2_amt", "due_20", "due_20_"),
        paidProvided: has("m2_status", "m2_received", "m2_paid", "m2"),
        invoiceNumber: m2InvoiceNumber,
        amount: m2Amount,
        paid: m2Paid,
      },
      adder: {
        provided: has("adders", "adder"),
        amountProvided: has("adders", "adder"),
        amount: adders,
      },
    },
    provided: {
      customerName: has("customer", "customer_name", "homeowner", "name", "job_name"),
      phone: has("phone", "phone_number"),
      email: has("email", "email_address"),
      street: has("street", "street_address", "address", "full_address"),
      city: has("city", "address", "full_address"),
      state: has("state", "market", "address", "full_address"),
      postalCode: has("zip", "zipcode", "zip_code", "address", "full_address"),
      county: has("county"),
      systemSizeKw: has("system_size_kw", "system_size", "kw"),
      panelCount: has("panel_count", "panels"),
      wattPerPanel: has("watt_per_panel", "watt_panel", "watt", "watts"),
      inverter: has("inverter"),
      module: has("module"),
      battery: has("battery"),
      roofType: has("roof_type"),
      contractType: has("deal"),
      financer: has("financer", "finance"),
      utilityCompany: has("utility_company", "utility"),
      contractor: has("contractor"),
      partner: has("build_partner", "partner"),
      rep: has("rep", "salesperson"),
      notes: has("notes", "additional_notes"),
      status: has("status"),
      crew: has("crew", "crew_members"),
      contractSignedAt: has("contract_signed", "contract_date"),
      siteSurveyAt: has("site_survey_date"),
      installScheduledAt: has("install_date", "due_date"),
      inspectionCompletedAt: has("inspection_date", "inspection"),
      ptoGrantedAt: has("pto_date"),
    },
  };

  draft.derivedStatus = deriveStatus({
    explicitStatus: draft.job.explicitStatus,
    installCompletedAt: draft.milestones.installScheduledAt,
    inspectionCompletedAt: draft.milestones.inspectionCompletedAt,
    ptoGrantedAt: draft.milestones.ptoGrantedAt,
    m1: draft.financials.m1,
    m2: draft.financials.m2,
    issueFlag: draft.job.explicitStatus.toLowerCase().includes("issue"),
  });
  draft.derivedStatusLabel = STATUS_LABELS[draft.derivedStatus] || "Scheduled";
  draft.actions = buildActions(draft, mode);
  return draft;
}

export function evaluateImportDraft(draft, mode, existingJobNumbers = new Set()) {
  if (!draft.jobNumber || draft.jobNumber.startsWith("IMPORT-")) {
    return { ...draft, previewStatus: "error", previewReason: "Missing job number" };
  }

  const exists = existingJobNumbers.has(draft.jobNumber);
  if (mode === "import" && exists) {
    return { ...draft, previewStatus: "duplicate", previewReason: "Job number already exists" };
  }
  if (mode === "update" && !exists) {
    return { ...draft, previewStatus: "unmatched", previewReason: "Job number not found" };
  }
  if (mode === "import" && !draft.customerName) {
    return { ...draft, previewStatus: "error", previewReason: "Missing customer name" };
  }
  if (mode === "import" && !draft.address.street1 && !draft.address.city) {
    return { ...draft, previewStatus: "error", previewReason: "Missing address" };
  }

  return {
    ...draft,
    previewStatus: mode === "import" ? "valid" : "matched",
    previewReason: mode === "import" ? "Ready to import" : "Ready to update",
  };
}
