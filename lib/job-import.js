const VALID_STATUSES = [
  "scheduled",
  "install_completed",
  "inspection_scheduled",
  "inspection_passed",
  "inspection_failed",
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
  inspection_failed: "Inspection failed",
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
const SECOND_HEADER_HINTS = new Set([
  "job_name",
  "address",
  "first_name",
  "last_name",
  "phone",
  "email",
  "status",
  "due_date",
  "created_date",
  "template_key",
  "template_name",
  "project_id",
  "container_id",
]);

const SITECAPTURE_EVENT_TEMPLATES = {
  inspection: "inspection",
  final_inspection_c10: "inspection",
  rough_inspection: "inspection",
  site_visit: "site_visit",
  site_visit_c9: "site_visit",
};

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

function normalizeLooseStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&[#a-z0-9]+;/gi, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function isLikelySecondHeaderRow(cells) {
  const normalized = cells.map(normalizeHeader).filter(Boolean);
  if (normalized.length < 3) return false;

  const hintMatches = normalized.filter((value) => SECOND_HEADER_HINTS.has(value)).length;
  const machineLikeCount = cells
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => /^[a-z0-9_]+$/i.test(value))
    .length;

  return hintMatches >= 3 && machineLikeCount / normalized.length > 0.6;
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

  const hasSecondaryHeader = isLikelySecondHeaderRow(nonEmptyRows[1]);
  const headers = (hasSecondaryHeader ? nonEmptyRows[1] : nonEmptyRows[0]).map(normalizeHeader);
  const dataRows = nonEmptyRows.slice(hasSecondaryHeader ? 2 : 1);

  return dataRows.map((cells, index) => {
    const record = {};
    headers.forEach((header, index) => {
      if (header) record[header] = cells[index] || "";
    });
    record.__sourceRow = hasSecondaryHeader ? index + 3 : index + 2;
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

function extractJobNumberCandidate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const patterns = [
    /(?:^|[-#\s])(\d{3,})$/,
    /^\([^)]*\)\s*(\d{3,})\b/,
    /^\s*(\d{3,})\s*-/,
    /-\s*(?:sz\s*)?(\d{3,})(?:\b|\s*\[)/i,
    /\b(?:sz\s*)?(\d{3,})\b/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }

  return "";
}

function extractTrailingJobNumber(...values) {
  for (const value of values) {
    const candidate = extractJobNumberCandidate(value);
    if (candidate) return candidate;
  }
  return "";
}

function extractDisplayCustomerName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const withoutPrefix = raw
    .replace(/^\([^)]*\)\s*/, "")
    .replace(/^\d{3,}\s*-\s*/, "")
    .replace(/\s*-\s*(?:sz\s*)?\d{3,}(?:\s*\[[^\]]+\])?\s*$/i, "")
    .replace(/\s*\[[^\]]+\]\s*$/, "")
    .trim();

  if (!withoutPrefix) return "";

  const commaMatch = withoutPrefix.match(/^([^,]+),\s*(.+)$/);
  if (commaMatch) {
    return `${commaMatch[2].trim()} ${commaMatch[1].trim()}`.replace(/\s+/g, " ").trim();
  }

  return withoutPrefix;
}

function detectSiteCaptureEventType(row) {
  const templateKey = normalizeLooseStatus(row.template_key || row.template_name);
  return SITECAPTURE_EVENT_TEMPLATES[templateKey] || null;
}

function normalizeEventDate(...values) {
  for (const value of values) {
    const normalized = normalizeDate(value);
    if (normalized) return normalized;
  }
  return null;
}

function buildEventNotes(row, eventType) {
  const fields = eventType === "inspection"
    ? [
        ["Inspection window", firstValue(row, ["inspection_window"])],
        ["Inspector", firstValue(row, ["ahj_inspector"])],
        ["Inspector phone", firstValue(row, ["ahj_inspector_phone_number"])],
        ["Inspection result", firstValue(row, ["inspection_result", "Inspection result"])],
        ["Failed reason", firstValue(row, ["failed_inspection_reason"])],
        ["Install report", firstValue(row, ["install_report"])],
        ["Notes", firstValue(row, ["notes"])],
        ["Admin notes", firstValue(row, ["admin_notes", "private_notes"])],
        ["Public notes", firstValue(row, ["public_notes"])],
        ["Documents", firstValue(row, ["documents_folder"])],
      ]
    : [
        ["Time window", firstValue(row, ["time_window", "inspection_window"])],
        ["Scope of work", firstValue(row, ["site_scope_of_work"])],
        ["Before work", firstValue(row, ["site_before_work", "before_work"])],
        ["Completed work", firstValue(row, ["site_completed_work", "completed_work"])],
        ["Notes", firstValue(row, ["notes"])],
        ["Admin notes", firstValue(row, ["admin_notes", "private_notes"])],
        ["Public notes", firstValue(row, ["public_notes"])],
        ["Documents", firstValue(row, ["documents_folder"])],
      ];

  return fields
    .filter(([, value]) => String(value || "").trim() !== "")
    .map(([label, value]) => `${label}: ${String(value).trim()}`)
    .join(" | ");
}

function normalizeSiteCaptureEvent(row, eventType) {
  const rawStatus = normalizeLooseStatus(row.status);
  const rawResult = normalizeLooseStatus(firstValue(row, ["inspection_result", "Inspection result"]));
  const failedReason = firstValue(row, ["failed_inspection_reason"]);
  const eventDate = normalizeEventDate(row.due_date, row.status_last_updated_date, row.created_date);
  const title = eventType === "inspection"
    ? normalizeHeader(row.template_name) === "rough_inspection" || normalizeLooseStatus(row.template_key) === "rough_inspection"
      ? "Rough inspection"
      : "Final inspection"
    : "Site visit";

  if (eventType === "inspection") {
    const result =
      rawStatus === "cancelled"
        ? "cancelled"
        : rawStatus === "failed" || rawResult === "fail" || String(failedReason || "").trim() !== ""
          ? "failed"
          : rawStatus === "complete" || rawResult === "pass"
            ? "passed"
            : "scheduled";

    return {
      kind: "inspection",
      templateKey: normalizeLooseStatus(row.template_key),
      title,
      eventDate,
      scheduledAt: eventDate,
      completedAt: result === "passed" || result === "failed" ? eventDate : null,
      result,
      reviewLabel:
        result === "passed"
          ? "Inspection Passed"
          : result === "failed"
            ? "Inspection Failed"
            : result === "cancelled"
              ? "Cancelled"
              : "Inspection Scheduled",
      inspectionType: normalizeLooseStatus(row.template_key) === "rough_inspection" ? "building" : "final",
      authorityName: firstValue(row, ["ahj_inspector"]),
      inspectorName: firstValue(row, ["ahj_inspector"]),
      notes: buildEventNotes(row, eventType),
      outcome: String(failedReason || "").trim() || null,
    };
  }

  const status =
    rawStatus === "cancelled"
      ? "cancelled"
      : rawStatus === "in_progress"
        ? "in_progress"
        : ["complete", "submitted", "submit_ready"].includes(rawStatus)
          ? "completed"
          : "scheduled";

  return {
    kind: "site_visit",
    templateKey: normalizeLooseStatus(row.template_key),
    title,
    eventDate,
    scheduledAt: eventDate,
    completedAt: status === "completed" ? eventDate : null,
    result: status,
    reviewLabel:
      status === "completed"
        ? "Completed"
        : status === "in_progress"
          ? "In Progress"
          : status === "cancelled"
            ? "Cancelled"
            : "Scheduled",
    notes: buildEventNotes(row, eventType),
    outcome: firstValue(row, ["site_completed_work", "completed_work"]) || null,
  };
}

function splitCompactAddress(address) {
  const match = String(address || "").trim().match(/^(.*)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!match) return null;

  const beforeState = match[1].trim();
  const state = match[2].trim();
  const postalCode = match[3].trim();
  const suffixPattern = /\b(?:st|street|rd|road|ave|avenue|dr|drive|ln|lane|ct|court|cir|circle|way|blvd|boulevard|trl|trail|ter|terrace|pl|place|rte|route|pkwy|parkway|hwy|highway)\b\.?/gi;

  let lastMatch = null;
  let current = suffixPattern.exec(beforeState);
  while (current) {
    lastMatch = current;
    current = suffixPattern.exec(beforeState);
  }

  if (!lastMatch) return null;

  const streetEnd = lastMatch.index + lastMatch[0].length;
  const street1 = beforeState.slice(0, streetEnd).trim();
  const city = beforeState.slice(streetEnd).trim();
  if (!street1 || !city) return null;

  return { street1, city, state, postalCode };
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
  if (draft.importType === "event" && draft.event) {
    if (draft.event.kind === "inspection") {
      return [
        draft.event.result === "passed"
          ? "Log passed inspection"
          : draft.event.result === "failed"
            ? "Log failed inspection"
            : draft.event.result === "cancelled"
              ? "Record cancelled inspection"
              : "Schedule inspection",
        "Review workflow status",
      ];
    }

    return [
      draft.event.result === "completed"
        ? "Record completed site visit"
        : draft.event.result === "cancelled"
          ? "Record cancelled site visit"
          : draft.event.result === "in_progress"
            ? "Log in-progress site visit"
            : "Schedule site visit",
      "Attach visit details",
    ];
  }

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
  const eventType = detectSiteCaptureEventType(row);

  const customerFirstName = get("first_name", "customer_first_name").trim();
  const customerLastName = get("last_name", "customer_last_name").trim();
  const customerName = [customerFirstName, customerLastName].filter(Boolean).join(" ").trim()
    || get("customer", "customer_name", "homeowner", "name", "job_name").trim()
    || extractDisplayCustomerName(get("display1"));
  const parsedJobNumber = extractTrailingJobNumber(
    get("job_number", "project_number"),
    get("job_name", "project_name", "display1")
  );
  const jobNumber = parsedJobNumber
    || get("job_id", "job_", "job_number", "project_number", "id", "job", "project_id").trim()
    || `IMPORT-${index + 1}`;
  const address = get("address", "full_address", "display3");
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

  if (street && !city && address && !address.includes(",")) {
    const compact = splitCompactAddress(address);
    if (compact) {
      street = compact.street1;
      city = compact.city;
      state = state || compact.state;
      zip = zip || compact.postalCode;
    }
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
    importType: eventType ? "event" : "job",
    sourceRow: Number(row.__sourceRow) || index + 2,
    raw: row,
    jobNumber,
    customerName,
    phone: get("phone", "phone_number", "customer_phone").trim(),
    email: get("email", "email_address", "customer_email").trim(),
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
      utilityCompany: get("utility_company", "utility", "utility_provider").trim(),
      contractor: get("contractor").trim(),
      partner: get("build_partner", "partner").trim(),
      rep: get("rep", "salesperson", "username").trim(),
      notes: [
        get("notes"),
        get("additional_notes"),
        get("admin_notes"),
        get("public_notes"),
        get("job_notes"),
        get("installers_notes"),
      ].filter(Boolean).join(" | ").trim(),
      explicitStatus: get("status").trim(),
    },
    crew: get("crew", "crew_members")
      .split(/[,;]+/)
      .map((name) => name.trim())
      .filter(Boolean),
    milestones: {
      contractSignedAt: normalizeDate(get("contract_signed", "contract_date", "origination_date")),
      siteSurveyAt: normalizeDate(get("site_survey_date")),
      installScheduledAt: normalizeDate(get("install_date", "install_start_date", "install_end_date", "due_date")),
      inspectionCompletedAt: normalizeDate(get("inspection_date", "final_inspection_date", "inspection")),
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
      customerName: has("customer", "customer_name", "homeowner", "name", "job_name", "first_name", "last_name", "customer_first_name", "customer_last_name"),
      phone: has("phone", "phone_number", "customer_phone"),
      email: has("email", "email_address", "customer_email"),
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
      utilityCompany: has("utility_company", "utility", "utility_provider"),
      contractor: has("contractor"),
      partner: has("build_partner", "partner"),
      rep: has("rep", "salesperson", "username"),
      notes: has("notes", "additional_notes", "admin_notes", "public_notes", "job_notes", "installers_notes"),
      status: has("status"),
      crew: has("crew", "crew_members"),
      contractSignedAt: has("contract_signed", "contract_date", "origination_date"),
      siteSurveyAt: has("site_survey_date"),
      installScheduledAt: has("install_date", "install_start_date", "install_end_date", "due_date"),
      inspectionCompletedAt: has("inspection_date", "final_inspection_date", "inspection"),
      ptoGrantedAt: has("pto_date"),
    },
    event: eventType ? normalizeSiteCaptureEvent(row, eventType) : null,
  };

  if (draft.event) {
    draft.derivedStatus =
      draft.event.kind === "inspection"
        ? draft.event.result === "passed"
          ? "Inspection Passed"
          : draft.event.result === "failed"
            ? "Inspection Failed"
            : draft.event.result === "cancelled"
              ? "Cancelled"
              : "Inspection Scheduled"
        : draft.event.reviewLabel;
    draft.derivedStatusLabel = draft.derivedStatus;
  } else {
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
  }
  draft.actions = buildActions(draft, mode);
  return draft;
}

export function evaluateImportDraft(draft, mode, existingJobNumbers = new Set()) {
  if (draft.importType === "event" && mode !== "update") {
    return { ...draft, previewStatus: "error", previewReason: "Event CSVs can only be applied in update mode" };
  }

  if (!draft.jobNumber || draft.jobNumber.startsWith("IMPORT-")) {
    return { ...draft, previewStatus: "error", previewReason: "Missing job number" };
  }

  if (draft.importType === "event" && !draft.event?.eventDate) {
    return { ...draft, previewStatus: "error", previewReason: "Missing event date" };
  }

  const exists = existingJobNumbers.has(draft.jobNumber);
  if (mode === "import" && exists) {
    return { ...draft, previewStatus: "duplicate", previewReason: "Job number already exists" };
  }
  if (mode === "update" && !exists) {
    return { ...draft, previewStatus: "unmatched", previewReason: "Job number not found" };
  }
  if (draft.importType !== "event" && mode === "import" && !draft.customerName) {
    return { ...draft, previewStatus: "error", previewReason: "Missing customer name" };
  }
  if (draft.importType !== "event" && mode === "import" && !draft.address.street1 && !draft.address.city) {
    return { ...draft, previewStatus: "error", previewReason: "Missing address" };
  }

  return {
    ...draft,
    previewStatus: mode === "import" ? "valid" : "matched",
    previewReason: mode === "import" ? "Ready to import" : "Ready to update",
  };
}
