"use client";

import { useState, useMemo } from "react";
import AppShell from "@/components/AppShell";
import { useAllJobs, jobsToSchedule } from "@/lib/useAllJobs";
import { statusBadgeClass, formatDate } from "@/lib/utils";
import Link from "next/link";
import { Search, MapPin, Clock, Users } from "lucide-react";

const TYPES = ["All", "Install", "Inspection", "Service"];

const today = new Date().toISOString().slice(0, 10);

export default function SchedulingPage() {
  const allJobs = useAllJobs();
  // Only show items that have a date set
  const scheduleItems = useMemo(
    () => jobsToSchedule(allJobs).filter(i => !!i.date),
    [allJobs]
  );
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [timeFilter, setTimeFilter] = useState("Future");

  const filtered = useMemo(() => {
    return scheduleItems.filter(item => {
      const text = [item.customer, item.site, item.crew.join(" "), item.type].join(" ").toLowerCase();
      const matchSearch = !search || text.includes(search.toLowerCase());
      const matchType = typeFilter === "All" || item.type === typeFilter;
      const matchTime =
        timeFilter === "All"    ? true :
        timeFilter === "Future" ? item.date >= today :
        /* Past */                item.date < today;
      return matchSearch && matchType && matchTime;
    });
  }, [scheduleItems, search, typeFilter, timeFilter]);

  // Group by date, sorted asc for future, desc for past
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(item => {
      if (!map[item.date]) map[item.date] = [];
      map[item.date].push(item);
    });
    const entries = Object.entries(map);
    return timeFilter === "Past"
      ? entries.sort(([a], [b]) => b.localeCompare(a))   // newest first for past
      : entries.sort(([a], [b]) => a.localeCompare(b));  // soonest first for future
  }, [filtered, timeFilter]);

  const futureCount = scheduleItems.filter(i => i.date >= today).length;
  const pastCount   = scheduleItems.filter(i => i.date < today).length;
  const installs    = scheduleItems.filter(s => s.type === "Install").length;
  const inspections = scheduleItems.filter(s => s.type === "Inspection").length;
  const services    = scheduleItems.filter(s => s.type === "Service").length;

  const hasFilters = search || typeFilter !== "All" || timeFilter !== "Future";

  return (
    <AppShell>
      <div className="page-header">
        <h1>Scheduling</h1>
        <p>Crew calendar, installs, inspections, and service dispatch.</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Upcoming</div>
          <div className="stat-value" style={{ color: "var(--green)" }}>{futureCount}</div>
          <div className="stat-detail">Future events</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Installs</div>
          <div className="stat-value">{installs}</div>
          <div className="stat-detail">Total scheduled</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Inspections</div>
          <div className="stat-value">{inspections}</div>
          <div className="stat-detail">Total scheduled</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Service visits</div>
          <div className="stat-value">{services}</div>
          <div className="stat-detail">Total scheduled</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 340 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search customer, crew, site..."
            style={{ width: "100%", paddingLeft: 30 }}
          />
        </div>

        {/* Future / Past toggle */}
        <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: "var(--radius-md)", padding: 3, gap: 2 }}>
          {["Future", "Past", "All"].map(t => (
            <button
              key={t}
              onClick={() => setTimeFilter(t)}
              style={{
                padding: "5px 14px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "var(--font-body)",
                background: timeFilter === t ? "var(--text-primary)" : "transparent",
                color: timeFilter === t ? "white" : "var(--text-secondary)",
                transition: "background .15s",
              }}
            >
              {t}{t === "Future" ? ` (${futureCount})` : t === "Past" ? ` (${pastCount})` : ""}
            </button>
          ))}
        </div>

        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          {TYPES.map(t => <option key={t} value={t}>{t === "All" ? "All types" : t}</option>)}
        </select>

        {hasFilters && (
          <button className="btn btn-ghost" onClick={() => { setSearch(""); setTypeFilter("All"); setTimeFilter("Future"); }}>
            Clear
          </button>
        )}
      </div>

      {grouped.length === 0 && (
        <div className="card empty-state">No {timeFilter === "Future" ? "upcoming" : timeFilter === "Past" ? "past" : ""} schedule items{typeFilter !== "All" ? ` of type "${typeFilter}"` : ""}.</div>
      )}

      {/* Timeline grouped by date */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {grouped.map(([date, items]) => (
          <div key={date}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 10,
              paddingBottom: 8,
              borderBottom: "1px solid var(--border)",
            }}>
              {formatDate(date)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map(item => (
                <div key={item.id} className="card" style={{ padding: "14px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                        <span className={`badge ${statusBadgeClass(item.type)}`}>{item.type}</span>
                        <Link href={`/jobs/${item.jobId || item.id}`} style={{ fontWeight: 600, fontSize: 14, color: "inherit", textDecoration: "none" }}>{item.customer}</Link>
                      </div>
                      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-secondary)", flexWrap: "wrap" }}>
                        {item.site && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={11} />{item.site}</span>}
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={11} />{item.startTime} · {item.duration}</span>
                        {item.crew.length > 0 && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Users size={11} />{item.crew.join(", ")}</span>}
                      </div>
                    </div>
                    <span className={`badge ${statusBadgeClass(item.status)}`}>{item.status}</span>
                  </div>
                  {item.notes && (
                    <div style={{
                      marginTop: 10,
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      background: "var(--surface-2)",
                      borderRadius: "var(--radius-sm)",
                      padding: "7px 10px",
                      lineHeight: 1.6,
                    }}>
                      {item.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
