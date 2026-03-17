"use client";

import { useState, useMemo } from "react";
import AppShell from "@/components/AppShell";
import { useAllJobs, jobsToSchedule } from "@/lib/useAllJobs";
import { statusBadgeClass, formatDate } from "@/lib/utils";
import Link from "next/link";
import { Search, MapPin, Clock, Users } from "lucide-react";

const TYPES = ["All", "Install", "Inspection", "Service"];
const STATUSES = ["All", "Confirmed", "Tentative", "Cancelled"];

export default function SchedulingPage() {
  const allJobs = useAllJobs();
  const scheduleItems = useMemo(() => jobsToSchedule(allJobs), [allJobs]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const filtered = useMemo(() => {
    return scheduleItems.filter(item => {
      const text = [item.id, item.customer, item.site, item.crew.join(" "), item.type].join(" ").toLowerCase();
      const matchSearch = text.includes(search.toLowerCase());
      const matchType = typeFilter === "All" || item.type === typeFilter;
      const matchStatus = statusFilter === "All" || item.status === statusFilter;
      return matchSearch && matchType && matchStatus;
    });
  }, [search, typeFilter, statusFilter]);

  // Group by date
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(item => {
      if (!map[item.date]) map[item.date] = [];
      map[item.date].push(item);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const installs = scheduleItems.filter(s => s.type === "Install").length;
  const inspections = scheduleItems.filter(s => s.type === "Inspection").length;
  const services = scheduleItems.filter(s => s.type === "Service").length;
  const confirmed = scheduleItems.filter(s => s.status === "Confirmed").length;

  return (
    <AppShell>
      <div className="page-header">
        <h1>Scheduling</h1>
        <p>Crew calendar, installs, inspections, and service dispatch.</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Installs</div>
          <div className="stat-value">{installs}</div>
          <div className="stat-detail">Scheduled installs</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Inspections</div>
          <div className="stat-value">{inspections}</div>
          <div className="stat-detail">Town or AHJ inspections</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Service visits</div>
          <div className="stat-value">{services}</div>
          <div className="stat-detail">Scheduled service calls</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Confirmed</div>
          <div className="stat-value" style={{ color: "var(--green)" }}>{confirmed}</div>
          <div className="stat-detail">Locked in</div>
        </div>
      </div>

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
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          {TYPES.map(t => <option key={t} value={t}>{t === "All" ? "All types" : t}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{s === "All" ? "All statuses" : s}</option>)}
        </select>
        {(search || typeFilter !== "All" || statusFilter !== "All") && (
          <button className="btn btn-ghost" onClick={() => { setSearch(""); setTypeFilter("All"); setStatusFilter("All"); }}>
            Clear
          </button>
        )}
      </div>

      {grouped.length === 0 && (
        <div className="card empty-state">No schedule items match your filters.</div>
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
                        <span className="mono badge badge-slate">{item.id}</span>
                      </div>
                      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-secondary)", flexWrap: "wrap" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={11} />{item.site}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={11} />{item.startTime} · {item.duration}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Users size={11} />{item.crew.join(", ")}</span>
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
