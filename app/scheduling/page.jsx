"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Clock, MapPin, RefreshCw, Search, Sparkles, Users } from "lucide-react";
import AppShell from "@/components/AppShell";
import { formatDate, statusBadgeClass } from "@/lib/utils";

const TYPES = ["All", "Install", "Inspection"];
const today = new Date().toISOString().slice(0, 10);
const GOOGLE_PAST_WINDOW_DAYS = 45;
const GOOGLE_FUTURE_WINDOW_DAYS = 120;
const STRONG_MATCH_SCORE = 140;
const MIN_SUGGESTION_SCORE = 80;
const STATUS_CAN_SKIP = new Set(["cancelled"]);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 3);
}

function getEventIsoDate(event) {
  return String(event?.startAt || event?.startDate || "").slice(0, 10);
}

function formatEventMoment(event) {
  if (event?.isAllDay) return formatDate(event.startDate);
  if (event?.startAt) return new Date(event.startAt).toLocaleString();
  return event?.startDate ? formatDate(event.startDate) : "No date";
}

function daysBetween(dateA, dateB) {
  if (!dateA || !dateB) return null;
  const a = new Date(`${dateA}T00:00:00`);
  const b = new Date(`${dateB}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

function isWithinRelevantWindow(eventDate) {
  if (!eventDate) return false;
  const diff = daysBetween(eventDate, today);
  if (diff === null) return false;
  return diff >= -GOOGLE_FUTURE_WINDOW_DAYS && diff <= GOOGLE_PAST_WINDOW_DAYS;
}

function inferMatchType(event) {
  const text = `${event?.summary || ""} ${event?.description || ""}`.toLowerCase();
  if (text.includes("inspection")) return "inspection";
  if (text.includes("site visit") || text.includes("service call") || text.includes("field visit")) return "field_visit";
  return "install";
}

function previewText(value, max = 180) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max).trim()}...` : text;
}

function scoreLabel(score) {
  if (score >= STRONG_MATCH_SCORE) return "Strong";
  if (score >= MIN_SUGGESTION_SCORE) return "Likely";
  if (score >= 40) return "Possible";
  return "";
}

function shouldShowMissingInstall(job) {
  if (!job || STATUS_CAN_SKIP.has(String(job.currentStatus || "").toLowerCase())) return false;
  return !job.installScheduledAt && !job.installCompletedAt;
}

function shouldShowMissingInspection(job) {
  if (!job || STATUS_CAN_SKIP.has(String(job.currentStatus || "").toLowerCase())) return false;
  if (job.inspectionScheduledAt || job.inspectionCompletedAt) return false;

  return Boolean(
    job.installScheduledAt
    || job.installCompletedAt
    || ["install_completed", "inspection_scheduled", "inspection_passed", "inspection_failed"].includes(job.currentStatus)
  );
}

function buildMissingDateRows(jobs) {
  const rows = [];

  jobs.forEach((job) => {
    if (shouldShowMissingInstall(job)) {
      rows.push({
        id: `${job.id}:install`,
        sourceType: "install",
        missingLabel: "Missing install date",
        job,
      });
    }

    if (shouldShowMissingInspection(job)) {
      rows.push({
        id: `${job.id}:inspection`,
        sourceType: "inspection",
        missingLabel: "Missing inspection date",
        job,
      });
    }
  });

  return rows;
}

function scoreEventForMissingDate(job, sourceType, event) {
  if (!job?.id || !event || inferMatchType(event) !== sourceType) return 0;
  if (event.matchedJobId && event.matchedJobId !== job.id) return 0;

  const eventDate = getEventIsoDate(event);
  if (!isWithinRelevantWindow(eventDate)) return 0;

  const eventText = normalizeText([
    event.summary,
    event.description,
    event.location,
  ].join(" "));

  const jobNumber = normalizeText(job.jobNumber);
  const customerTokens = tokenize(job.customerName);
  const addressTokens = tokenize([
    job.address?.street1,
    job.address?.city,
    job.address?.state,
  ].join(" "));

  let score = 0;
  if (jobNumber && eventText.includes(jobNumber)) {
    score += 190;
  }

  const matchedCustomerTokens = customerTokens.filter((token) => eventText.includes(token));
  score += Math.min(matchedCustomerTokens.length * 18, 54);

  const matchedAddressTokens = addressTokens.filter((token) => eventText.includes(token));
  score += Math.min(matchedAddressTokens.length * 8, 24);

  if (!jobNumber && matchedCustomerTokens.length === 0) {
    return 0;
  }

  if (sourceType === "inspection") {
    score += /\binspection\b/.test(eventText) ? 12 : 0;
  }

  if (sourceType === "install") {
    score += /\binstall\b/.test(eventText) ? 10 : 0;
  }

  return score;
}

export default function SchedulingPage() {
  const [scheduleItems, setScheduleItems] = useState([]);
  const [googleEvents, setGoogleEvents] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [matchingId, setMatchingId] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [timeFilter, setTimeFilter] = useState("Future");

  async function loadData() {
    setLoading(true);
    try {
      const [scheduleRes, googleRes, jobsRes] = await Promise.all([
        fetch("/api/v2/schedule", { cache: "no-store" }),
        fetch("/api/v2/integrations/google-calendar/events", { cache: "no-store" }),
        fetch("/api/v2/jobs", { cache: "no-store" }),
      ]);
      const [scheduleData, googleData, jobsData] = await Promise.all([
        scheduleRes.ok ? scheduleRes.json() : [],
        googleRes.ok ? googleRes.json() : [],
        jobsRes.ok ? jobsRes.json() : [],
      ]);
      setScheduleItems(Array.isArray(scheduleData) ? scheduleData : []);
      setGoogleEvents(Array.isArray(googleData) ? googleData : []);
      setJobs(Array.isArray(jobsData) ? jobsData : []);
    } catch {
      setScheduleItems([]);
      setGoogleEvents([]);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(() => {
    return scheduleItems.filter((item) => {
      const text = [item.customerName, item.site, (item.crewNames || []).join(" "), item.type]
        .join(" ")
        .toLowerCase();
      const matchSearch = !search || text.includes(search.toLowerCase());
      const matchType = typeFilter === "All" || item.type === typeFilter;
      const matchTime =
        timeFilter === "All" ? true :
        timeFilter === "Future" ? item.date >= today :
        item.date < today;
      return matchSearch && matchType && matchTime;
    });
  }, [scheduleItems, search, typeFilter, timeFilter]);

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((item) => {
      if (!map[item.date]) map[item.date] = [];
      map[item.date].push(item);
    });
    const entries = Object.entries(map);
    return timeFilter === "Past"
      ? entries.sort(([a], [b]) => b.localeCompare(a))
      : entries.sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, timeFilter]);

  const futureCount = scheduleItems.filter((i) => i.date >= today).length;
  const pastCount = scheduleItems.filter((i) => i.date < today).length;
  const installs = scheduleItems.filter((s) => s.type === "Install").length;
  const inspections = scheduleItems.filter((s) => s.type === "Inspection").length;
  const hasFilters = search || typeFilter !== "All" || timeFilter !== "Future";

  const relevantGoogleEvents = useMemo(
    () => googleEvents.filter((event) => !event.matchedJobId && isWithinRelevantWindow(getEventIsoDate(event))),
    [googleEvents]
  );

  const missingDateRows = useMemo(() => {
    return buildMissingDateRows(jobs)
      .map((row) => {
        const suggestions = relevantGoogleEvents
          .map((event) => ({
            event,
            score: scoreEventForMissingDate(row.job, row.sourceType, event),
          }))
          .filter((item) => item.score >= MIN_SUGGESTION_SCORE)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        return {
          ...row,
          suggestions,
          topScore: suggestions[0]?.score || 0,
        };
      })
      .filter((row) => row.suggestions.length > 0)
      .sort((a, b) => {
        const strongA = a.topScore >= STRONG_MATCH_SCORE;
        const strongB = b.topScore >= STRONG_MATCH_SCORE;
        if (strongA !== strongB) return strongA ? -1 : 1;
        if (a.topScore !== b.topScore) return b.topScore - a.topScore;
        return String(a.job.jobNumber).localeCompare(String(b.job.jobNumber));
      });
  }, [jobs, relevantGoogleEvents]);

  const strongBackfillRows = missingDateRows.filter((row) => row.topScore >= STRONG_MATCH_SCORE);
  const missingInstallCount = buildMissingDateRows(jobs).filter((row) => row.sourceType === "install").length;
  const missingInspectionCount = buildMissingDateRows(jobs).filter((row) => row.sourceType === "inspection").length;

  async function importGoogleEvents() {
    setImporting(true);
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch("/api/v2/integrations/google-calendar/events", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to import Google Calendar events");
      const details = [
        `Imported ${data.imported || 0} Google Calendar event${data.imported === 1 ? "" : "s"}.`,
        data.backfilledFromLinks ? `Resolved ${data.backfilledFromLinks} from existing CRM links.` : "",
        data.autoMatched ? `Auto-matched ${data.autoMatched} obvious event${data.autoMatched === 1 ? "" : "s"}.` : "",
      ].filter(Boolean);
      setMessage({ type: "success", text: details.join(" ") });
      await loadData();
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Failed to import Google Calendar events" });
    } finally {
      setImporting(false);
    }
  }

  async function applyBackfill(row, event) {
    if (!row?.job?.id || !event?.id) return;

    setMatchingId(`${row.id}:${event.id}`);
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch(`/api/v2/integrations/google-calendar/events/${event.id}/match`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId: row.job.id,
          sourceType: row.sourceType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to backfill CRM date from Google Calendar");

      setMessage({
        type: "success",
        text: `${row.job.jobNumber} · ${row.job.customerName} updated from Google Calendar.`,
      });
      await loadData();
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Failed to backfill CRM date from Google Calendar" });
    } finally {
      setMatchingId("");
    }
  }

  async function applyAllStrongMatches() {
    const rows = strongBackfillRows.slice(0, 12);
    if (rows.length === 0) return;

    setImporting(true);
    setMessage({ type: "", text: "" });
    let applied = 0;
    try {
      for (const row of rows) {
        const topSuggestion = row.suggestions[0]?.event;
        if (!topSuggestion?.id) continue;

        const res = await fetch(`/api/v2/integrations/google-calendar/events/${topSuggestion.id}/match`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jobId: row.job.id,
            sourceType: row.sourceType,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Failed on ${row.job.jobNumber}`);
        applied += 1;
      }

      setMessage({
        type: "success",
        text: `Applied ${applied} strong Google Calendar backfill${applied === 1 ? "" : "s"} to missing CRM dates.`,
      });
      await loadData();
    } catch (error) {
      setMessage({
        type: applied > 0 ? "success" : "error",
        text: applied > 0
          ? `Applied ${applied} strong match${applied === 1 ? "" : "es"} before stopping. ${error.message || ""}`.trim()
          : (error.message || "Failed to apply strong Google Calendar backfills"),
      });
      await loadData();
    } finally {
      setImporting(false);
    }
  }

  return (
    <AppShell>
      <div className="page-header">
        <h1>Scheduling</h1>
        <p>Use Google Calendar only to fill missing CRM dates. Jobs that already have dates stay out of this queue.</p>
      </div>

      {message.text ? (
        <div
          className="card"
          style={{
            marginBottom: 18,
            padding: "12px 14px",
            border: message.type === "success" ? "1px solid #86efac" : "1px solid #fecaca",
            background: message.type === "success" ? "#f0fdf4" : "#fff1f2",
            color: message.type === "success" ? "#166534" : "#991b1b",
          }}
        >
          {message.text}
        </div>
      ) : null}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Upcoming</div>
          <div className="stat-value" style={{ color: "var(--green)" }}>{futureCount}</div>
          <div className="stat-detail">Future CRM events</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Missing install dates</div>
          <div className="stat-value">{missingInstallCount}</div>
          <div className="stat-detail">CRM jobs missing install scheduling</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Missing inspections</div>
          <div className="stat-value">{missingInspectionCount}</div>
          <div className="stat-detail">CRM jobs missing inspection dates</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ready to fill</div>
          <div className="stat-value">{strongBackfillRows.length}</div>
          <div className="stat-detail">Strong Google date matches</div>
        </div>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div className="panel-title" style={{ marginBottom: 4 }}>Fill Missing CRM Dates</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
              This queue only shows CRM jobs that are missing dates and have likely Google Calendar candidates. Existing CRM dates are ignored.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-outline" type="button" onClick={importGoogleEvents} disabled={importing}>
              <RefreshCw size={13} />
              {importing ? "Importing..." : "Refresh Google"}
            </button>
            <button className="btn btn-primary" type="button" onClick={applyAllStrongMatches} disabled={importing || strongBackfillRows.length === 0}>
              <Sparkles size={13} />
              Apply strong matches
            </button>
          </div>
        </div>

        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 14 }}>
          Showing {missingDateRows.length} missing CRM date{missingDateRows.length === 1 ? "" : "s"} with usable Google candidates.
        </div>

        <div style={{ marginTop: 16 }}>
          {missingDateRows.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              No obvious Google Calendar backfills right now. Either the CRM already has the date, or the Google event is too ambiguous to auto-suggest.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 14 }}>
              {missingDateRows.map((row) => (
                <div key={row.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "14px 16px", background: "var(--surface-2)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span className={`badge ${statusBadgeClass(row.sourceType === "inspection" ? "Inspection" : "Install")}`}>
                        {row.sourceType === "inspection" ? "Inspection" : "Install"}
                      </span>
                      {row.topScore >= MIN_SUGGESTION_SCORE ? (
                        <span className="badge badge-green">
                          <Sparkles size={11} />
                          {scoreLabel(row.topScore)} match
                        </span>
                      ) : null}
                    </div>
                    <Link href={`/jobs/${row.job.jobNumber}`} style={{ fontSize: 12, fontWeight: 700, color: "inherit", textDecoration: "none" }}>
                      Open job
                    </Link>
                  </div>

                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                    {row.job.jobNumber} · {row.job.customerName}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
                    {row.missingLabel}
                  </div>

                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-secondary)", flexWrap: "wrap", marginBottom: 12 }}>
                    {row.job.address?.street1 ? <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={11} />{row.job.address.street1}</span> : null}
                    <span className={`badge ${statusBadgeClass(row.job.currentStatus)}`}>{row.job.currentStatus}</span>
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    {row.suggestions.map((suggestion, index) => (
                      <div key={`${row.id}:${suggestion.event.id}`} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 12px", background: "#fff" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>
                            {index === 0 ? "Top Google match" : "Alternative"}
                          </div>
                          <span className="badge badge-slate">{scoreLabel(suggestion.score) || "Review"}</span>
                        </div>

                        <div style={{ fontSize: 13, marginBottom: 6 }}>{suggestion.event.summary || "Untitled event"}</div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                            <CalendarDays size={11} />
                            <span>{formatEventMoment(suggestion.event)}</span>
                          </div>
                          {suggestion.event.location ? <div style={{ marginTop: 4 }}>{suggestion.event.location}</div> : null}
                          {suggestion.event.description ? <div style={{ marginTop: 6 }}>{previewText(suggestion.event.description)}</div> : null}
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                          <button
                            className="btn btn-primary"
                            type="button"
                            disabled={matchingId === `${row.id}:${suggestion.event.id}`}
                            onClick={() => applyBackfill(row, suggestion.event)}
                          >
                            <Sparkles size={13} />
                            {matchingId === `${row.id}:${suggestion.event.id}` ? "Applying..." : "Use this Google date"}
                          </button>
                          {suggestion.event.htmlLink ? (
                            <a className="btn btn-outline" href={suggestion.event.htmlLink} target="_blank" rel="noreferrer">
                              Open in Google
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
          <div>
            <div className="panel-title" style={{ marginBottom: 4 }}>CRM Schedule</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
              This stays the source of truth. Google is only helping fill blanks here.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 340 }}>
            <Search
              size={13}
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, crew, site..."
              style={{ width: "100%", paddingLeft: 30 }}
            />
          </div>

          <div className="segmented-control">
            {["Future", "Past", "All"].map((t) => (
              <button
                key={t}
                onClick={() => setTimeFilter(t)}
                className={`segmented-button ${timeFilter === t ? "active" : ""}`}
              >
                {t}{t === "Future" ? ` (${futureCount})` : t === "Past" ? ` (${pastCount})` : ""}
              </button>
            ))}
          </div>

          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t === "All" ? "All types" : t}
              </option>
            ))}
          </select>

          {hasFilters ? (
            <button
              className="btn btn-outline"
              onClick={() => {
                setSearch("");
                setTypeFilter("All");
                setTimeFilter("Future");
              }}
            >
              Clear
            </button>
          ) : null}
        </div>

        {loading ? <div className="empty-state">Loading schedule...</div> : null}
        {!loading && grouped.length === 0 ? (
          <div className="empty-state">
            No {timeFilter === "Future" ? "upcoming" : timeFilter === "Past" ? "past" : ""} CRM schedule items{typeFilter !== "All" ? ` of type "${typeFilter}"` : ""}.
          </div>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {grouped.map(([date, items]) => (
            <div key={date}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 10,
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {formatDate(date)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map((item) => (
                  <div key={item.id} className="card" style={{ padding: "14px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                          <span className={`badge ${statusBadgeClass(item.type)}`}>{item.type}</span>
                          <Link
                            href={`/jobs/${item.jobNumber || item.jobId || item.id}`}
                            style={{ fontWeight: 600, fontSize: 14, color: "inherit", textDecoration: "none" }}
                          >
                            {item.customerName}
                          </Link>
                        </div>
                        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-secondary)", flexWrap: "wrap" }}>
                          {item.site ? <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={11} />{item.site}</span> : null}
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={11} />{`${item.startTime} - ${item.duration}`}</span>
                          {(item.crewNames || []).length > 0 ? <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Users size={11} />{item.crewNames.join(", ")}</span> : null}
                        </div>
                      </div>
                      <span className={`badge ${statusBadgeClass(item.status)}`}>{item.status}</span>
                    </div>
                    {item.notes ? (
                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          background: "var(--surface-2)",
                          borderRadius: "var(--radius-sm)",
                          padding: "7px 10px",
                          lineHeight: 1.6,
                        }}
                      >
                        {item.notes}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
