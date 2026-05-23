import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { hasTable } from "@/lib/normalized-api";
import { canTransitionStatus } from "@/lib/job-workflow";
import { appConfig } from "@/lib/app-config";

const GOOGLE_AUTH_SCOPE = "https://www.googleapis.com/auth/calendar";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const DEFAULT_TIMEZONE = process.env.GOOGLE_CALENDAR_TIMEZONE || "America/New_York";

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw.replace(/\/$/, "");
  return `https://${raw.replace(/\/$/, "")}`;
}

function getOriginFromRequest(req) {
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}

function getAppBaseUrl(req) {
  return (
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL)
    || normalizeBaseUrl(process.env.APP_URL)
    || normalizeBaseUrl(process.env.VERCEL_URL)
    || getOriginFromRequest(req)
  );
}

function getRedirectUri(req) {
  const configured = normalizeBaseUrl(process.env.GOOGLE_CALENDAR_REDIRECT_URI);
  if (configured) return configured;
  const baseUrl = getAppBaseUrl(req);
  return baseUrl ? `${baseUrl}/api/v2/integrations/google-calendar/callback` : "";
}

function deriveKey(secret) {
  const trimmed = String(secret || "").trim();
  if (!trimmed) return null;

  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  try {
    const base64Buffer = Buffer.from(trimmed, "base64");
    if (base64Buffer.length === 32) return base64Buffer;
  } catch {
    // Fall through to deterministic hash.
  }

  return createHash("sha256").update(trimmed).digest();
}

function getEncryptionKey() {
  return deriveKey(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY);
}

function getStateSigningKey() {
  return deriveKey(process.env.GOOGLE_STATE_SIGNING_KEY || process.env.GOOGLE_TOKEN_ENCRYPTION_KEY);
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

export function getGoogleCalendarConfigStatus(req) {
  const missing = [];
  if (!process.env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!process.env.GOOGLE_TOKEN_ENCRYPTION_KEY) missing.push("GOOGLE_TOKEN_ENCRYPTION_KEY");

  const redirectUri = getRedirectUri(req);
  if (!redirectUri) missing.push("APP_URL or NEXT_PUBLIC_APP_URL");

  return {
    ready: missing.length === 0,
    missing,
    redirectUri,
    appBaseUrl: getAppBaseUrl(req),
    scope: GOOGLE_AUTH_SCOPE,
    timezone: DEFAULT_TIMEZONE,
  };
}

export async function isGoogleCalendarInstalled(sql) {
  const [hasConnections, hasLinks] = await Promise.all([
    hasTable(sql, "google_calendar_connections"),
    hasTable(sql, "google_calendar_event_links"),
  ]);

  return hasConnections && hasLinks;
}

export async function isGoogleCalendarImportInstalled(sql) {
  return hasTable(sql, "google_calendar_import_events");
}

export function encryptSecret(value) {
  const key = getEncryptionKey();
  if (!key) throw new Error("Missing GOOGLE_TOKEN_ENCRYPTION_KEY");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value || ""), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decryptSecret(payload) {
  const key = getEncryptionKey();
  if (!key) throw new Error("Missing GOOGLE_TOKEN_ENCRYPTION_KEY");
  const [ivRaw, contentRaw, tagRaw] = String(payload || "").split(".");
  if (!ivRaw || !contentRaw || !tagRaw) throw new Error("Stored Google token is malformed");

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(contentRaw, "base64url")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

export function createGoogleOAuthState(payload) {
  const key = getStateSigningKey();
  if (!key) throw new Error("Missing GOOGLE_STATE_SIGNING_KEY or GOOGLE_TOKEN_ENCRYPTION_KEY");
  const body = encodeBase64Url(JSON.stringify(payload || {}));
  const sig = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyGoogleOAuthState(token) {
  const key = getStateSigningKey();
  if (!key) throw new Error("Missing GOOGLE_STATE_SIGNING_KEY or GOOGLE_TOKEN_ENCRYPTION_KEY");
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) throw new Error("Invalid Google OAuth state");

  const expected = createHmac("sha256", key).update(body).digest("base64url");
  if (sig !== expected) throw new Error("Google OAuth state signature mismatch");

  const payload = JSON.parse(decodeBase64Url(body));
  if (payload?.exp && Number(payload.exp) < Date.now()) {
    throw new Error("Google OAuth state has expired");
  }

  return payload;
}

async function googleFetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload?.error_description
      || payload?.error?.message
      || payload?.error
      || `Google request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function fetchCalendarList(accessToken) {
  const payload = await googleFetchJson(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  return Array.isArray(payload?.items) ? payload.items : [];
}

async function fetchCalendarEvents(accessToken, calendarId) {
  const url = new URL(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("showDeleted", "false");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "2500");
  url.searchParams.set("timeMin", new Date(Date.now() - (90 * 24 * 60 * 60 * 1000)).toISOString());
  url.searchParams.set("timeMax", new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)).toISOString());

  const payload = await googleFetchJson(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  return Array.isArray(payload?.items) ? payload.items : [];
}

function eventToImportedRow(event, calendarId) {
  const startDateTime = event?.start?.dateTime || null;
  const endDateTime = event?.end?.dateTime || null;
  const startDate = event?.start?.date || null;
  const endDate = event?.end?.date || null;

  return {
    calendarId,
    googleEventId: event.id,
    summary: event.summary || "",
    description: event.description || "",
    location: event.location || "",
    status: event.status || "",
    htmlLink: event.htmlLink || "",
    startAt: startDateTime,
    endAt: endDateTime,
    startDate,
    endDate,
    isAllDay: !!startDate && !startDateTime,
  };
}

async function exchangeToken(params) {
  const body = new URLSearchParams(params);
  return googleFetchJson(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
}

export async function exchangeGoogleCodeForTokens(code, req) {
  const config = getGoogleCalendarConfigStatus(req);
  if (!config.ready) {
    throw new Error(`Google Calendar is not configured: missing ${config.missing.join(", ")}`);
  }

  return exchangeToken({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
}

export async function refreshGoogleAccessToken(refreshToken, req) {
  const config = getGoogleCalendarConfigStatus(req);
  if (!config.ready) {
    throw new Error(`Google Calendar is not configured: missing ${config.missing.join(", ")}`);
  }

  return exchangeToken({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

export async function getGoogleCalendarConnection(sql, companyId) {
  if (!companyId) return null;

  const rows = await sql`
    select *
    from google_calendar_connections
    where company_id = ${companyId}
    limit 1
  `;

  return rows[0] || null;
}

export function mapGoogleConnection(row) {
  if (!row) return null;
  return {
    calendarId: row.calendar_id,
    calendarSummary: row.calendar_summary,
    connectedEmail: row.connected_email,
    lastSyncedAt: row.last_synced_at,
    lastSyncStatus: row.last_sync_status,
    lastSyncError: row.last_sync_error,
    tokenExpiresAt: row.token_expires_at,
    scopes: String(row.scopes || "").split(/\s+/).filter(Boolean),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatGoogleSourceLabel(sourceType) {
  if (sourceType === "install") return "Install";
  if (sourceType === "inspection") return "Inspection";
  if (sourceType === "field_visit") return "Field visit";
  return "CRM event";
}

export function mapGoogleEventLink(row) {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceLabel: formatGoogleSourceLabel(row.source_type),
    sourceRecordId: row.source_record_id,
    eventId: row.google_event_id,
    htmlLink: row.google_event_html_link,
    status: row.google_event_status,
    lastSyncedAt: row.last_synced_at,
    calendarId: row.calendar_id,
  };
}

export async function listCalendarsForConnection(connection, req) {
  if (!connection?.refresh_token_encrypted) return [];

  const refreshToken = decryptSecret(connection.refresh_token_encrypted);
  const token = await refreshGoogleAccessToken(refreshToken, req);
  const items = await fetchCalendarList(token.access_token);

  return items.map((item) => ({
    id: item.id,
    summary: item.summary || item.id,
    primary: !!item.primary,
    accessRole: item.accessRole || "",
    timeZone: item.timeZone || DEFAULT_TIMEZONE,
    selected: item.id === connection.calendar_id,
  }));
}

export async function upsertGoogleCalendarConnection(sql, companyId, values) {
  const {
    calendarId = "primary",
    calendarSummary = null,
    connectedEmail = null,
    refreshTokenEncrypted,
    scopes = "",
    tokenExpiresAt = null,
    lastSyncedAt = null,
    lastSyncStatus = null,
    lastSyncError = null,
    createdBy = null,
    updatedBy = null,
  } = values || {};

  const rows = await sql`
    insert into google_calendar_connections (
      company_id,
      calendar_id,
      calendar_summary,
      connected_email,
      refresh_token_encrypted,
      scopes,
      token_expires_at,
      last_synced_at,
      last_sync_status,
      last_sync_error,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    values (
      ${companyId},
      ${calendarId},
      ${calendarSummary},
      ${connectedEmail},
      ${refreshTokenEncrypted},
      ${scopes},
      ${tokenExpiresAt}::timestamptz,
      ${lastSyncedAt}::timestamptz,
      ${lastSyncStatus},
      ${lastSyncError},
      ${createdBy}::uuid,
      ${updatedBy}::uuid,
      now(),
      now()
    )
    on conflict (company_id) do update
    set
      calendar_id = excluded.calendar_id,
      calendar_summary = excluded.calendar_summary,
      connected_email = excluded.connected_email,
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      scopes = excluded.scopes,
      token_expires_at = excluded.token_expires_at,
      last_synced_at = excluded.last_synced_at,
      last_sync_status = excluded.last_sync_status,
      last_sync_error = excluded.last_sync_error,
      updated_by = excluded.updated_by,
      updated_at = now()
    returning *
  `;

  return rows[0] || null;
}

export async function updateGoogleCalendarConnection(sql, companyId, values) {
  const {
    calendarId,
    calendarSummary,
    lastSyncedAt,
    lastSyncStatus,
    lastSyncError,
    updatedBy = null,
  } = values || {};

  const rows = await sql`
    update google_calendar_connections
    set
      calendar_id = coalesce(${calendarId}, calendar_id),
      calendar_summary = coalesce(${calendarSummary}, calendar_summary),
      last_synced_at = coalesce(${lastSyncedAt}::timestamptz, last_synced_at),
      last_sync_status = coalesce(${lastSyncStatus}, last_sync_status),
      last_sync_error = ${lastSyncError},
      updated_by = ${updatedBy}::uuid,
      updated_at = now()
    where company_id = ${companyId}
    returning *
  `;

  return rows[0] || null;
}

export async function disconnectGoogleCalendar(sql, companyId) {
  await sql`
    delete from google_calendar_event_links
    where company_id = ${companyId}
  `;

  await sql`
    delete from google_calendar_connections
    where company_id = ${companyId}
  `;
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildEventDescription(source, appBaseUrl) {
  const lines = [
    `${formatGoogleSourceLabel(source.sourceType)} synced from ${appConfig.calendarSourceLabel}`,
    `Job: ${source.jobNumber}`,
    `Customer: ${source.customerName}`,
    `Address: ${source.location}`,
  ];

  if (source.statusLabel) lines.push(`Status: ${source.statusLabel}`);
  if (source.notes) lines.push(`Notes: ${source.notes}`);
  if (appBaseUrl) lines.push(`CRM job: ${appBaseUrl}/jobs/${encodeURIComponent(source.jobNumber || source.jobId)}`);
  if (appBaseUrl && source.customerId) lines.push(`CRM customer: ${appBaseUrl}/customers/${encodeURIComponent(source.customerId)}`);

  return lines.filter(Boolean).join("\n");
}

function buildGoogleEventBody(source, req) {
  const appBaseUrl = getAppBaseUrl(req);
  const privateProps = {
    companyId: source.companyId,
    jobId: source.jobId,
    customerId: source.customerId || "",
    sourceType: source.sourceType,
    sourceRecordId: source.sourceRecordId,
    jobNumber: source.jobNumber,
    crmJobUrl: appBaseUrl ? `${appBaseUrl}/jobs/${encodeURIComponent(source.jobNumber || source.jobId)}` : "",
  };

  const event = {
    summary: source.summary,
    description: buildEventDescription(source, appBaseUrl),
    location: source.location,
    status: "confirmed",
    extendedProperties: {
      private: Object.fromEntries(
        Object.entries(privateProps).filter(([, value]) => String(value || "").trim())
      ),
    },
  };

  if (source.dateTimeStart) {
    event.start = {
      dateTime: source.dateTimeStart,
      timeZone: DEFAULT_TIMEZONE,
    };
    event.end = {
      dateTime: source.dateTimeEnd,
      timeZone: DEFAULT_TIMEZONE,
    };
  } else {
    event.start = { date: source.allDayDate };
    event.end = { date: addDays(source.allDayDate, 1) };
  }

  return event;
}

async function createGoogleEvent(accessToken, calendarId, source, req) {
  return googleFetchJson(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildGoogleEventBody(source, req)),
    cache: "no-store",
  });
}

async function updateGoogleEvent(accessToken, calendarId, eventId, source, req) {
  return googleFetchJson(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildGoogleEventBody(source, req)),
    cache: "no-store",
  });
}

async function deleteGoogleEvent(accessToken, calendarId, eventId) {
  const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (response.status === 404 || response.status === 410) return;
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.error?.message || `Failed to delete Google Calendar event (${response.status})`;
    throw new Error(message);
  }
}

async function loadCalendarSyncSources(sql, companyId) {
  const [installs, inspections, hasFieldVisits] = await Promise.all([
    sql`
      select
        j.company_id,
        j.id as job_id,
        j.customer_id,
        j.job_number,
        j.customer_name,
        j.install_scheduled_at,
        j.current_status,
        j.notes,
        concat_ws(', ', nullif(j.street_1, ''), nullif(j.city, ''), nullif(j.state, '')) as location
      from jobs j
      where j.company_id = ${companyId}
        and j.is_active = true
        and j.current_status <> 'cancelled'
        and j.install_scheduled_at is not null
      order by j.install_scheduled_at asc
    `,
    sql`
      select
        j.company_id,
        j.id as job_id,
        j.customer_id,
        j.job_number,
        j.customer_name,
        i.id as inspection_id,
        i.scheduled_at,
        i.result,
        i.notes,
        concat_ws(', ', nullif(j.street_1, ''), nullif(j.city, ''), nullif(j.state, '')) as location
      from inspections i
      join jobs j on j.id = i.job_id
      where j.company_id = ${companyId}
        and j.is_active = true
        and j.current_status <> 'cancelled'
        and i.scheduled_at is not null
      order by i.scheduled_at asc
    `,
    hasTable(sql, "job_field_visits"),
  ]);

  const fieldVisits = hasFieldVisits
    ? await sql`
        select
          j.company_id,
          j.id as job_id,
          j.customer_id,
          j.job_number,
          j.customer_name,
          fv.id as field_visit_id,
          fv.visit_type,
          fv.visit_date,
          fv.status,
          fv.install_day_number,
          fv.title,
          fv.details,
          fv.outcome,
          concat_ws(', ', nullif(j.street_1, ''), nullif(j.city, ''), nullif(j.state, '')) as location
        from job_field_visits fv
        join jobs j on j.id = fv.job_id
        where j.company_id = ${companyId}
          and j.is_active = true
          and j.current_status <> 'cancelled'
          and fv.visit_date is not null
          and fv.status <> 'cancelled'
        order by fv.visit_date asc
      `
    : [];

  return [
    ...installs.map((row) => ({
      companyId: row.company_id,
      jobId: row.job_id,
      customerId: row.customer_id,
      jobNumber: row.job_number,
      customerName: row.customer_name,
      sourceType: "install",
      sourceRecordId: row.job_id,
      summary: `${row.job_number} · Install · ${row.customer_name}`,
      statusLabel: row.current_status === "install_completed" ? "Completed" : "Scheduled",
      notes: row.notes || "",
      location: row.location || "",
      allDayDate: row.install_scheduled_at,
    })),
    ...inspections.map((row) => {
      const start = new Date(row.scheduled_at);
      const end = new Date(start.getTime() + (60 * 60 * 1000));
      return {
        companyId: row.company_id,
        jobId: row.job_id,
        customerId: row.customer_id,
        jobNumber: row.job_number,
        customerName: row.customer_name,
        sourceType: "inspection",
        sourceRecordId: row.inspection_id,
        summary: `${row.job_number} · Inspection · ${row.customer_name}`,
        statusLabel: row.result === "passed" ? "Passed" : row.result === "failed" ? "Failed" : "Scheduled",
        notes: row.notes || "",
        location: row.location || "",
        dateTimeStart: start.toISOString(),
        dateTimeEnd: end.toISOString(),
      };
    }),
    ...fieldVisits.map((row) => ({
      companyId: row.company_id,
      jobId: row.job_id,
      customerId: row.customer_id,
      jobNumber: row.job_number,
      customerName: row.customer_name,
      sourceType: "field_visit",
      sourceRecordId: row.field_visit_id,
      summary: `${row.job_number} · ${row.title || formatGoogleSourceLabel("field_visit")} · ${row.customer_name}`,
      statusLabel: row.status,
      notes: [row.details, row.outcome].filter(Boolean).join(" | "),
      location: row.location || "",
      allDayDate: row.visit_date,
    })),
  ];
}

async function upsertEventLink(sql, values) {
  const rows = await sql`
    insert into google_calendar_event_links (
      company_id,
      job_id,
      customer_id,
      source_type,
      source_record_id,
      calendar_id,
      google_event_id,
      google_event_html_link,
      google_event_status,
      last_synced_at,
      created_at,
      updated_at
    )
    values (
      ${values.companyId},
      ${values.jobId}::uuid,
      ${values.customerId || null}::uuid,
      ${values.sourceType},
      ${String(values.sourceRecordId)},
      ${values.calendarId},
      ${values.googleEventId},
      ${values.googleEventHtmlLink || null},
      ${values.googleEventStatus || null},
      now(),
      now(),
      now()
    )
    on conflict (company_id, source_type, source_record_id) do update
    set
      job_id = excluded.job_id,
      customer_id = excluded.customer_id,
      calendar_id = excluded.calendar_id,
      google_event_id = excluded.google_event_id,
      google_event_html_link = excluded.google_event_html_link,
      google_event_status = excluded.google_event_status,
      last_synced_at = now(),
      updated_at = now()
    returning *
  `;

  return rows[0] || null;
}

export async function syncGoogleCalendarForCompany(sql, company, appUser, req) {
  if (!company?.id) {
    throw new Error("No company is available for Google Calendar sync");
  }

  const installed = await isGoogleCalendarInstalled(sql);
  if (!installed) {
    throw new Error("Google Calendar sync tables are not installed. Apply db/migrations/006_google_calendar_sync.sql first.");
  }

  const connection = await getGoogleCalendarConnection(sql, company.id);
  if (!connection) {
    throw new Error("Google Calendar is not connected for this company yet.");
  }

  const refreshToken = decryptSecret(connection.refresh_token_encrypted);
  const token = await refreshGoogleAccessToken(refreshToken, req);
  const calendarId = connection.calendar_id || "primary";
  const sources = await loadCalendarSyncSources(sql, company.id);
  const existingLinks = await sql`
    select *
    from google_calendar_event_links
    where company_id = ${company.id}
  `;

  const existingByKey = new Map(
    existingLinks.map((row) => [`${row.source_type}:${row.source_record_id}`, row])
  );

  let created = 0;
  let updated = 0;
  const errors = [];

  for (const source of sources) {
    const key = `${source.sourceType}:${source.sourceRecordId}`;
    const existing = existingByKey.get(key);

    try {
      const event = existing?.google_event_id
        ? await updateGoogleEvent(token.access_token, calendarId, existing.google_event_id, source, req)
        : await createGoogleEvent(token.access_token, calendarId, source, req);

      await upsertEventLink(sql, {
        companyId: company.id,
        jobId: source.jobId,
        customerId: source.customerId,
        sourceType: source.sourceType,
        sourceRecordId: source.sourceRecordId,
        calendarId,
        googleEventId: event.id,
        googleEventHtmlLink: event.htmlLink,
        googleEventStatus: event.status,
      });

      if (existing?.google_event_id) {
        updated += 1;
      } else {
        created += 1;
      }
      existingByKey.delete(key);
    } catch (error) {
      errors.push(`${source.summary}: ${error.message || "Unknown sync failure"}`);
    }
  }

  const status = errors.length > 0 ? (created || updated ? "partial" : "error") : "success";
  const errorText = errors.length > 0 ? errors.slice(0, 5).join(" | ") : null;

  await updateGoogleCalendarConnection(sql, company.id, {
    lastSyncedAt: new Date().toISOString(),
    lastSyncStatus: status,
    lastSyncError: errorText,
    updatedBy: appUser?.id || null,
  });

  return {
    connected: true,
    calendarId,
    created,
    updated,
    totalSources: sources.length,
    errors,
    status,
  };
}

function lowerText(value) {
  return String(value || "").trim().toLowerCase();
}

function extractEventDateParts(event) {
  const startDateTime = event?.start?.dateTime || null;
  const endDateTime = event?.end?.dateTime || null;
  const startDate = event?.start?.date || (startDateTime ? String(startDateTime).slice(0, 10) : null);
  return {
    startDate,
    startDateTime,
    endDateTime,
  };
}

function getEventPrivateProps(event) {
  return event?.extendedProperties?.private || {};
}

function detectInboundSourceType(event, existingLink = null) {
  if (existingLink?.source_type) return existingLink.source_type;

  const props = getEventPrivateProps(event);
  if (props.sourceType) return props.sourceType;

  const text = `${event?.summary || ""}\n${event?.description || ""}`.toLowerCase();
  if (text.includes("inspection")) return "inspection";
  if (text.includes("install day") || text.includes("site visit") || text.includes("service call") || text.includes("field visit")) return "field_visit";
  if (text.includes("install")) return "install";
  return null;
}

function detectInboundOutcome(event, sourceType) {
  const text = `${event?.summary || ""}\n${event?.description || ""}`.toLowerCase();
  const cancelled = lowerText(event?.status) === "cancelled";
  const completed = cancelled || /\[(done|complete|completed)\]|\bdone\b|\bcompleted\b/.test(text);
  const passed = /\bpassed\b/.test(text);
  const failed = /\bfailed\b/.test(text);

  if (sourceType === "inspection") {
    if (cancelled) return "cancelled";
    if (failed) return "failed";
    if (passed || completed) return "passed";
    return "scheduled";
  }

  if (sourceType === "field_visit") {
    if (cancelled) return "cancelled";
    if (completed) return "completed";
    return "scheduled";
  }

  if (sourceType === "install") {
    if (completed) return "completed";
    return "scheduled";
  }

  return "scheduled";
}

function extractJobNumberCandidate(event) {
  const props = getEventPrivateProps(event);
  if (props.jobNumber) return props.jobNumber;

  const summary = String(event?.summary || "");
  const beforeDot = summary.split("·")[0]?.trim();
  if (beforeDot && /^[A-Za-z0-9-]{2,}$/.test(beforeDot)) return beforeDot;

  const match = summary.match(/\b([A-Z]{1,4}-\d{2,}|[A-Z]{2,}\d{2,}|\d{3,})\b/);
  return match?.[1] || null;
}

async function findInboundJob(sql, companyId, event, existingLink = null) {
  const props = getEventPrivateProps(event);
  const jobId = props.jobId || existingLink?.job_id || null;
  const jobNumber = extractJobNumberCandidate(event);

  if (jobId) {
    const rows = await sql`
      select id, company_id, customer_id, job_number, customer_name, current_status, install_scheduled_at, install_completed_at
      from jobs
      where company_id = ${companyId}
        and id = ${jobId}::uuid
      limit 1
    `;
    if (rows[0]) return rows[0];
  }

  if (jobNumber) {
    const rows = await sql`
      select id, company_id, customer_id, job_number, customer_name, current_status, install_scheduled_at, install_completed_at
      from jobs
      where company_id = ${companyId}
        and job_number = ${jobNumber}
      limit 1
    `;
    if (rows[0]) return rows[0];
  }

  return null;
}

async function recordJobHistory(sql, values) {
  await sql`
    insert into job_status_history (
      job_id,
      from_status,
      to_status,
      event_type,
      changed_at,
      changed_by,
      related_inspection_id,
      note
    )
    values (
      ${values.jobId},
      ${values.fromStatus || null}::job_status,
      ${values.toStatus}::job_status,
      ${values.eventType || "note"}::status_event_type,
      now(),
      ${values.changedBy || null}::uuid,
      ${values.relatedInspectionId || null}::uuid,
      ${values.note || null}
    )
  `;
}

async function maybeAdvanceJobStatus(sql, job, nextStatus, effectiveDate, appUserId, note, relatedInspectionId = null) {
  if (!job?.id || !nextStatus || !canTransitionStatus(job.current_status, nextStatus)) {
    return job;
  }

  const updates = {
    currentStatus: nextStatus,
    installScheduledAt: job.install_scheduled_at,
    installCompletedAt: job.install_completed_at,
  };

  if (nextStatus === "scheduled" && effectiveDate) {
    updates.installScheduledAt = effectiveDate;
  }
  if (nextStatus === "install_completed" && effectiveDate) {
    updates.installCompletedAt = effectiveDate;
  }

  const rows = await sql`
    update jobs
    set
      current_status = ${nextStatus}::job_status,
      current_status_changed_at = now(),
      install_scheduled_at = ${updates.installScheduledAt || null}::date,
      install_completed_at = ${updates.installCompletedAt || null}::date,
      updated_at = now()
    where id = ${job.id}
    returning id, company_id, customer_id, job_number, customer_name, current_status, install_scheduled_at, install_completed_at
  `;

  await recordJobHistory(sql, {
    jobId: job.id,
    fromStatus: job.current_status,
    toStatus: nextStatus,
    eventType: "status_changed",
    changedBy: appUserId,
    relatedInspectionId,
    note,
  });

  return rows[0] || job;
}

async function syncInboundInstallEvent(sql, companyId, event, existingLink, appUserId) {
  const job = await findInboundJob(sql, companyId, event, existingLink);
  if (!job) return { applied: false, reason: "No matching job found for install event" };

  const { startDate } = extractEventDateParts(event);
  if (!startDate) return { applied: false, reason: "Install event is missing a start date" };

  await sql`
    update jobs
    set
      install_scheduled_at = ${startDate}::date,
      updated_at = now()
    where id = ${job.id}
  `;

  let currentJob = {
    ...job,
    install_scheduled_at: startDate,
  };

  if (currentJob.current_status === "created" || currentJob.current_status === "on_hold") {
    currentJob = await maybeAdvanceJobStatus(
      sql,
      currentJob,
      "scheduled",
      startDate,
      appUserId,
      "Google Calendar inbound sync: install scheduled"
    );
  } else {
    await recordJobHistory(sql, {
      jobId: job.id,
      toStatus: currentJob.current_status,
      changedBy: appUserId,
      note: `Google Calendar inbound sync: install scheduled for ${startDate}`,
    });
  }

  const outcome = detectInboundOutcome(event, "install");
  if (outcome === "completed") {
    await sql`
      update jobs
      set
        install_completed_at = ${startDate}::date,
        updated_at = now()
      where id = ${job.id}
    `;

    currentJob = {
      ...currentJob,
      install_completed_at: startDate,
    };

    currentJob = await maybeAdvanceJobStatus(
      sql,
      currentJob,
      "install_completed",
      startDate,
      appUserId,
      "Google Calendar inbound sync: install completed"
    );
  }

  return {
    applied: true,
    action: outcome === "completed" ? "install_completed" : "install_scheduled",
    jobId: job.id,
  };
}

async function resolveInspectionRecord(sql, jobId, event, existingLink) {
  const props = getEventPrivateProps(event);
  const inspectionId = props.sourceRecordId || existingLink?.source_record_id || null;

  if (inspectionId) {
    const rows = await sql`
      select *
      from inspections
      where job_id = ${jobId}
        and id::text = ${String(inspectionId)}
      limit 1
    `;
    if (rows[0]) return rows[0];
  }

  const { startDateTime } = extractEventDateParts(event);
  if (startDateTime) {
    const rows = await sql`
      select *
      from inspections
      where job_id = ${jobId}
        and scheduled_at::date = ${String(startDateTime).slice(0, 10)}::date
      order by created_at desc
      limit 1
    `;
    if (rows[0]) return rows[0];
  }

  return null;
}

async function syncInboundInspectionEvent(sql, companyId, event, existingLink, appUserId) {
  const job = await findInboundJob(sql, companyId, event, existingLink);
  if (!job) return { applied: false, reason: "No matching job found for inspection event" };

  const { startDateTime, endDateTime } = extractEventDateParts(event);
  const outcome = detectInboundOutcome(event, "inspection");
  const inspectionResult =
    outcome === "passed"
      ? "passed"
      : outcome === "failed"
        ? "failed"
        : null;
  const completedAt =
    outcome === "passed" || outcome === "failed"
      ? (endDateTime || new Date().toISOString())
      : null;
  const existingInspection = await resolveInspectionRecord(sql, job.id, event, existingLink);

  let inspectionId = existingInspection?.id || null;
  if (existingInspection) {
    await sql`
      update inspections
      set
        scheduled_at = ${startDateTime || existingInspection.scheduled_at}::timestamptz,
        completed_at = ${completedAt}::timestamptz,
        result = ${inspectionResult}::inspection_result,
        notes = ${existingInspection.notes || null},
        updated_at = now()
      where id = ${existingInspection.id}
    `;
    inspectionId = existingInspection.id;
  } else {
    const inserted = await sql`
      insert into inspections (
        job_id,
        inspection_type,
        scheduled_at,
        completed_at,
        result,
        notes,
        created_at,
        updated_at
      )
      values (
        ${job.id},
        'final'::inspection_type,
        ${startDateTime || null}::timestamptz,
        ${completedAt}::timestamptz,
        ${inspectionResult}::inspection_result,
        ${`Inbound Google Calendar sync: ${event.summary || "Inspection"}`},
        now(),
        now()
      )
      returning id
    `;
    inspectionId = inserted[0]?.id || null;
  }

  if (outcome === "scheduled") {
    await maybeAdvanceJobStatus(
      sql,
      job,
      "inspection_scheduled",
      null,
      appUserId,
      "Google Calendar inbound sync: inspection scheduled",
      inspectionId
    );
  } else if (outcome === "passed") {
    await maybeAdvanceJobStatus(
      sql,
      job,
      "inspection_passed",
      null,
      appUserId,
      "Google Calendar inbound sync: inspection passed",
      inspectionId
    );
  } else if (outcome === "failed") {
    await maybeAdvanceJobStatus(
      sql,
      job,
      "inspection_failed",
      null,
      appUserId,
      "Google Calendar inbound sync: inspection failed",
      inspectionId
    );
  } else {
    await recordJobHistory(sql, {
      jobId: job.id,
      toStatus: job.current_status,
      changedBy: appUserId,
      relatedInspectionId: inspectionId,
      note: "Google Calendar inbound sync: inspection cancelled",
    });
  }

  return {
    applied: true,
    action: `inspection_${outcome}`,
    jobId: job.id,
    inspectionId,
  };
}

function buildInboundFieldVisitTitle(event, jobNumber) {
  const summary = String(event?.summary || "").trim();
  const stripped = summary.replace(new RegExp(`^${jobNumber}\\s*[·\\-|:]\\s*`, "i"), "").trim();
  return stripped || "Field visit";
}

async function resolveFieldVisitRecord(sql, jobId, event, existingLink) {
  const props = getEventPrivateProps(event);
  const visitId = props.sourceRecordId || existingLink?.source_record_id || null;

  if (visitId) {
    const rows = await sql`
      select *
      from job_field_visits
      where job_id = ${jobId}
        and id::text = ${String(visitId)}
      limit 1
    `;
    if (rows[0]) return rows[0];
  }

  return null;
}

async function syncInboundFieldVisitEvent(sql, companyId, event, existingLink, appUserId) {
  const installed = await hasTable(sql, "job_field_visits");
  if (!installed) return { applied: false, reason: "Field visit tables are not installed" };

  const job = await findInboundJob(sql, companyId, event, existingLink);
  if (!job) return { applied: false, reason: "No matching job found for field visit event" };

  const { startDate } = extractEventDateParts(event);
  if (!startDate) return { applied: false, reason: "Field visit event is missing a start date" };

  const outcome = detectInboundOutcome(event, "field_visit");
  const existingVisit = await resolveFieldVisitRecord(sql, job.id, event, existingLink);
  const title = buildInboundFieldVisitTitle(event, job.job_number);

  let visitId = existingVisit?.id || null;
  if (existingVisit) {
    await sql`
      update job_field_visits
      set
        title = ${title},
        visit_date = ${startDate}::date,
        status = ${outcome === "completed" ? "completed" : outcome === "cancelled" ? "cancelled" : "scheduled"}::field_visit_status,
        completed_at = ${outcome === "completed" ? new Date().toISOString() : null}::timestamptz,
        updated_at = now()
      where id = ${existingVisit.id}
    `;
    visitId = existingVisit.id;
  } else {
    const inserted = await sql`
      insert into job_field_visits (
        job_id,
        visit_type,
        status,
        visit_date,
        completed_at,
        title,
        details,
        outcome,
        created_by,
        created_at,
        updated_at
      )
      values (
        ${job.id},
        'site_visit'::field_visit_type,
        ${outcome === "completed" ? "completed" : outcome === "cancelled" ? "cancelled" : "scheduled"}::field_visit_status,
        ${startDate}::date,
        ${outcome === "completed" ? new Date().toISOString() : null}::timestamptz,
        ${title},
        ${event.description || null},
        ${outcome === "completed" ? "Completed from Google Calendar" : null},
        ${appUserId || null}::uuid,
        now(),
        now()
      )
      returning id
    `;
    visitId = inserted[0]?.id || null;
  }

  await recordJobHistory(sql, {
    jobId: job.id,
    toStatus: job.current_status,
    changedBy: appUserId,
    note: `Google Calendar inbound sync: field visit ${outcome}`,
  });

  return {
    applied: true,
    action: `field_visit_${outcome}`,
    jobId: job.id,
    visitId,
  };
}

function importedRowToEvent(row) {
  return {
    id: row.google_event_id,
    summary: row.summary,
    description: row.description,
    location: row.location,
    status: row.status,
    htmlLink: row.html_link,
    start: row.is_all_day
      ? { date: row.start_date }
      : { dateTime: row.start_at },
    end: row.is_all_day
      ? { date: row.end_date }
      : { dateTime: row.end_at },
  };
}

async function upsertImportedCalendarEvent(sql, companyId, values) {
  const rows = await sql`
    insert into google_calendar_import_events (
      company_id,
      calendar_id,
      google_event_id,
      summary,
      description,
      location,
      status,
      html_link,
      start_at,
      end_at,
      start_date,
      end_date,
      is_all_day,
      imported_at,
      last_seen_at,
      created_at,
      updated_at
    )
    values (
      ${companyId},
      ${values.calendarId},
      ${values.googleEventId},
      ${values.summary || null},
      ${values.description || null},
      ${values.location || null},
      ${values.status || null},
      ${values.htmlLink || null},
      ${values.startAt || null}::timestamptz,
      ${values.endAt || null}::timestamptz,
      ${values.startDate || null}::date,
      ${values.endDate || null}::date,
      ${values.isAllDay}::boolean,
      now(),
      now(),
      now(),
      now()
    )
    on conflict (company_id, google_event_id) do update
    set
      calendar_id = excluded.calendar_id,
      summary = excluded.summary,
      description = excluded.description,
      location = excluded.location,
      status = excluded.status,
      html_link = excluded.html_link,
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      is_all_day = excluded.is_all_day,
      last_seen_at = now(),
      updated_at = now()
    returning *
  `;

  return rows[0] || null;
}

export function mapImportedGoogleCalendarEvent(row) {
  return {
    id: row.id,
    calendarId: row.calendar_id,
    googleEventId: row.google_event_id,
    summary: row.summary,
    description: row.description,
    location: row.location,
    status: row.status,
    htmlLink: row.html_link,
    startAt: row.start_at,
    endAt: row.end_at,
    startDate: row.start_date,
    endDate: row.end_date,
    isAllDay: row.is_all_day,
    matchedJobId: row.resolved_matched_job_id || row.matched_job_id,
    matchedSourceType: row.resolved_matched_source_type || row.matched_source_type,
    matchedSourceRecordId: row.resolved_matched_source_record_id || row.matched_source_record_id,
    importedAt: row.imported_at,
    lastSeenAt: row.last_seen_at,
    matchedJobNumber: row.matched_job_number,
    matchedCustomerName: row.matched_customer_name,
  };
}

export async function importGoogleCalendarEvents(sql, company, req, appUser = null) {
  if (!company?.id) {
    throw new Error("No company is available for Google Calendar import");
  }

  const installed = await isGoogleCalendarInstalled(sql);
  const importInstalled = await isGoogleCalendarImportInstalled(sql);
  if (!installed || !importInstalled) {
    throw new Error("Google Calendar import tables are not installed. Apply db/migrations/006_google_calendar_sync.sql and db/migrations/007_google_calendar_import_events.sql first.");
  }

  const connection = await getGoogleCalendarConnection(sql, company.id);
  if (!connection) {
    throw new Error("Google Calendar is not connected for this company yet.");
  }

  const refreshToken = decryptSecret(connection.refresh_token_encrypted);
  const token = await refreshGoogleAccessToken(refreshToken, req);
  const calendarId = connection.calendar_id || "primary";
  const events = await fetchCalendarEvents(token.access_token, calendarId);

  let imported = 0;
  for (const event of events) {
    await upsertImportedCalendarEvent(sql, company.id, eventToImportedRow(event, calendarId));
    imported += 1;
  }

  const backfilledFromLinks = await reconcileImportedEventMatchesFromLinks(sql, company.id);
  const autoMatched = await autoMatchImportedGoogleEvents(sql, company, appUser);

  await updateGoogleCalendarConnection(sql, company.id, {
    lastSyncedAt: new Date().toISOString(),
    lastSyncStatus: "success",
    lastSyncError: null,
  });

  return {
    imported,
    calendarId,
    backfilledFromLinks,
    autoMatched,
  };
}

export async function listImportedGoogleCalendarEvents(sql, companyId) {
  const rows = await sql`
    select
      e.*,
      coalesce(e.matched_job_id, l.job_id) as resolved_matched_job_id,
      coalesce(e.matched_source_type, l.source_type) as resolved_matched_source_type,
      coalesce(e.matched_source_record_id, l.source_record_id) as resolved_matched_source_record_id,
      j.job_number as matched_job_number,
      j.customer_name as matched_customer_name
    from google_calendar_import_events e
    left join google_calendar_event_links l
      on l.company_id = e.company_id
     and l.google_event_id = e.google_event_id
    left join jobs j on j.id = coalesce(e.matched_job_id, l.job_id)
    where e.company_id = ${companyId}
    order by coalesce(e.start_at, e.start_date::timestamptz, e.last_seen_at) asc, e.created_at asc
  `;

  return rows.map(mapImportedGoogleCalendarEvent);
}

async function getJobById(sql, companyId, jobId) {
  const rows = await sql`
    select id, company_id, customer_id, job_number, customer_name, current_status, install_scheduled_at, install_completed_at
    from jobs
    where company_id = ${companyId}
      and id = ${jobId}::uuid
    limit 1
  `;
  return rows[0] || null;
}

async function setImportedEventMatch(sql, eventId, values) {
  const rows = await sql`
    update google_calendar_import_events
    set
      matched_job_id = ${values.matchedJobId || null}::uuid,
      matched_source_type = ${values.matchedSourceType || null},
      matched_source_record_id = ${values.matchedSourceRecordId || null},
      updated_at = now()
    where id = ${eventId}::uuid
    returning *
  `;

  return rows[0] || null;
}

async function reconcileImportedEventMatchesFromLinks(sql, companyId) {
  const rows = await sql`
    update google_calendar_import_events e
    set
      matched_job_id = coalesce(e.matched_job_id, l.job_id),
      matched_source_type = coalesce(e.matched_source_type, l.source_type),
      matched_source_record_id = coalesce(e.matched_source_record_id, l.source_record_id),
      updated_at = now()
    from google_calendar_event_links l
    where e.company_id = ${companyId}
      and l.company_id = e.company_id
      and l.google_event_id = e.google_event_id
      and (
        e.matched_job_id is distinct from l.job_id
        or e.matched_source_type is distinct from l.source_type
        or e.matched_source_record_id is distinct from l.source_record_id
      )
    returning e.id
  `;

  return rows.length;
}

async function autoMatchImportedGoogleEvents(sql, company, appUser) {
  const unresolvedRows = await sql`
    select *
    from google_calendar_import_events
    where company_id = ${company.id}
      and matched_job_id is null
    order by updated_at desc
  `;

  let autoMatched = 0;
  for (const imported of unresolvedRows) {
    try {
      const event = importedRowToEvent(imported);
      const sourceType = detectInboundSourceType(event);
      if (!sourceType) continue;

      const job = await findInboundJob(sql, company.id, event, null);
      if (!job?.id) continue;

      await manuallyMatchImportedGoogleEvent(sql, company, appUser, imported.id, {
        sourceType,
        jobId: job.id,
      });
      autoMatched += 1;
    } catch {
      // Leave ambiguous or invalid rows in the queue for manual review.
    }
  }

  return autoMatched;
}

export async function manuallyMatchImportedGoogleEvent(sql, company, appUser, importedEventId, options = {}) {
  const importInstalled = await isGoogleCalendarImportInstalled(sql);
  if (!importInstalled) {
    throw new Error("Google Calendar import tables are not installed. Apply db/migrations/007_google_calendar_import_events.sql first.");
  }

  const rows = await sql`
    select *
    from google_calendar_import_events
    where id = ${importedEventId}::uuid
      and company_id = ${company.id}
    limit 1
  `;
  const imported = rows[0];
  if (!imported) {
    throw new Error("Imported Google Calendar event was not found.");
  }

  const sourceType = String(options.sourceType || "").trim();
  const jobId = String(options.jobId || "").trim();
  if (!sourceType || !jobId) {
    throw new Error("Both sourceType and jobId are required.");
  }

  const job = await getJobById(sql, company.id, jobId);
  if (!job) {
    throw new Error("Selected job was not found.");
  }

  const fakeEvent = importedRowToEvent(imported);
  let result;
  if (sourceType === "install") {
    result = await syncInboundInstallEvent(sql, company.id, {
      ...fakeEvent,
      summary: `${job.job_number} · Install · ${job.customer_name}`,
    }, { job_id: job.id }, appUser?.id || null);
  } else if (sourceType === "inspection") {
    result = await syncInboundInspectionEvent(sql, company.id, {
      ...fakeEvent,
      summary: `${job.job_number} · Inspection · ${job.customer_name}`,
    }, { job_id: job.id }, appUser?.id || null);
  } else if (sourceType === "field_visit") {
    result = await syncInboundFieldVisitEvent(sql, company.id, {
      ...fakeEvent,
      summary: `${job.job_number} · ${fakeEvent.summary || "Field visit"} · ${job.customer_name}`,
    }, { job_id: job.id }, appUser?.id || null);
  } else {
    throw new Error("Unsupported match type.");
  }

  const matchedSourceRecordId = String(result?.inspectionId || result?.visitId || result?.jobId || job.id);

  await setImportedEventMatch(sql, imported.id, {
    matchedJobId: job.id,
    matchedSourceType: sourceType,
    matchedSourceRecordId,
  });

  await recordJobHistory(sql, {
    jobId: job.id,
    toStatus: job.current_status,
    changedBy: appUser?.id || null,
    note: `Google Calendar matched manually: ${formatGoogleSourceLabel(sourceType)} linked from "${imported.summary || "Untitled event"}" on ${String(imported.start_at || imported.start_date || "").slice(0, 10) || "unknown date"}`,
  });

  await upsertEventLink(sql, {
    companyId: company.id,
    jobId: job.id,
    customerId: job.customer_id,
    sourceType,
    sourceRecordId: matchedSourceRecordId,
    calendarId: imported.calendar_id,
    googleEventId: imported.google_event_id,
    googleEventHtmlLink: imported.html_link,
    googleEventStatus: imported.status,
  });

  return {
    matched: true,
    matchedJobId: job.id,
    matchedJobNumber: job.job_number,
    matchedCustomerName: job.customer_name,
    matchedSourceType: sourceType,
    result,
  };
}

export async function pullGoogleCalendarIntoCrm(sql, company, appUser, req) {
  if (!company?.id) {
    throw new Error("No company is available for Google Calendar inbound sync");
  }

  const installed = await isGoogleCalendarInstalled(sql);
  if (!installed) {
    throw new Error("Google Calendar sync tables are not installed. Apply db/migrations/006_google_calendar_sync.sql first.");
  }

  const connection = await getGoogleCalendarConnection(sql, company.id);
  if (!connection) {
    throw new Error("Google Calendar is not connected for this company yet.");
  }

  const refreshToken = decryptSecret(connection.refresh_token_encrypted);
  const token = await refreshGoogleAccessToken(refreshToken, req);
  const calendarId = connection.calendar_id || "primary";
  const events = await fetchCalendarEvents(token.access_token, calendarId);
  const existingLinks = await sql`
    select *
    from google_calendar_event_links
    where company_id = ${company.id}
  `;
  const existingByEventId = new Map(existingLinks.map((row) => [row.google_event_id, row]));

  let updated = 0;
  const skipped = [];
  const errors = [];

  for (const event of events) {
    const existingLink = existingByEventId.get(event.id) || null;
    const sourceType = detectInboundSourceType(event, existingLink);
    if (!sourceType) {
      skipped.push(event.summary || event.id);
      continue;
    }

    try {
      let result;
      if (sourceType === "install") {
        result = await syncInboundInstallEvent(sql, company.id, event, existingLink, appUser?.id || null);
      } else if (sourceType === "inspection") {
        result = await syncInboundInspectionEvent(sql, company.id, event, existingLink, appUser?.id || null);
      } else if (sourceType === "field_visit") {
        result = await syncInboundFieldVisitEvent(sql, company.id, event, existingLink, appUser?.id || null);
      } else {
        result = { applied: false, reason: "Unsupported Google event type" };
      }

      if (result?.applied) {
        updated += 1;
        const job = await findInboundJob(sql, company.id, event, existingLink);
        await upsertEventLink(sql, {
          companyId: company.id,
          jobId: job?.id || existingLink?.job_id || null,
          customerId: job?.customer_id || existingLink?.customer_id || null,
          sourceType,
          sourceRecordId: existingLink?.source_record_id || getEventPrivateProps(event).sourceRecordId || String(result.inspectionId || result.visitId || result.jobId || event.id),
          calendarId,
          googleEventId: event.id,
          googleEventHtmlLink: event.htmlLink,
          googleEventStatus: event.status,
        });
      } else {
        skipped.push(`${event.summary || event.id}: ${result?.reason || "Skipped"}`);
      }
    } catch (error) {
      errors.push(`${event.summary || event.id}: ${error.message || "Inbound sync failed"}`);
    }
  }

  const status = errors.length > 0 ? (updated > 0 ? "partial" : "error") : "success";
  const errorText = errors.length > 0 ? errors.slice(0, 5).join(" | ") : null;

  await updateGoogleCalendarConnection(sql, company.id, {
    lastSyncedAt: new Date().toISOString(),
    lastSyncStatus: status,
    lastSyncError: errorText,
    updatedBy: appUser?.id || null,
  });

  return {
    connected: true,
    calendarId,
    updated,
    skipped: skipped.length,
    skippedSamples: skipped.slice(0, 5),
    errors,
    status,
  };
}
