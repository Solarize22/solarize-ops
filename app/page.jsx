"use client";

import AppShell from "@/components/AppShell";
import Link from "next/link";
import { jobs, invoices, serviceItems, permits, scheduleItems } from "@/lib/data";
import { statusBadgeClass, formatCurrency, formatDate } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, DollarSign, ClipboardList, Wrench, FileText, CalendarDays } from "lucide-react";

export default function DashboardPage() {
  const STAGE_MAP = {
    "Scheduled":             20,
    "Install Complete":      40,
    "Inspection Scheduled":  60,
    "Inspection Passed":     80,
    "Fully Paid / Closed":   100,
    "Rescheduled / Issue":   50,
  };

  const totalRevenue = jobs.reduce((s, j) => s + (j.contractAmount || 0), 0);
  const activeJobs = jobs.filter(j => j.status !== "Fully Paid / Closed").length;
  const openService = serviceItems.filter(s => s.status !== "Resolved").length;
  const pendingPermits = permits.filter(p => p.status !== "Approved").length;
  const overdueInvoices = invoices.filter(i => i.status === "Overdue");
  const upcomingSchedule = scheduleItems.filter(s => s.status !== "Cancelled").slice(0, 3);
  const issueJobs = jobs.filter(j => j.status === "Rescheduled / Issue");
  const highServiceItems = serviceItems.filter(s => s.urgency === "High" && s.status !== "Resolved");

  const PIPELINE_STAGES = [
    "Scheduled", "Install Complete", "Inspection Scheduled",
    "Inspection Passed", "Fully Paid / Closed", "Rescheduled / Issue",
  ];
  const stageCounts = {};
  PIPELINE_STAGES.forEach(s => { stageCounts[s] = jobs.filter(j => j.status === s).length; });

  return (
    <AppShell>
      <div className="page-header">
        <h1>Operations dashboard</h1>
        <p>Built around the way your solar company actually runs.</p>
      </div>

      {/* Stat cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Pipeline revenue</div>
          <div className="stat-value">{formatCurrency(totalRevenue)}</div>
          <div className="stat-detail">Current visible jobs</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active jobs</div>
          <div className="stat-value">{activeJobs}</div>
          <div className="stat-detail">Moving through ops</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Open service</div>
          <div className="stat-value">{openService}</div>
          <div className="stat-detail">Monitoring, repairs, closeout</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Permits pending</div>
          <div className="stat-value">{pendingPermits}</div>
          <div className="stat-detail">Needs town or AHJ action</div>
        </div>
      </div>

      {/* Pipeline stage summary */}
      <div className="card" style={{ padding: "14px 20px", marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, display: "flex", alignItems: "center", gap: 7 }}>
          <ClipboardList size={14} />
          Pipeline stages
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Scheduled",            bg: "#dbeafe", color: "#1e3a8a" },
            { label: "Install Complete",     bg: "#d8f3dc", color: "#1b4332" },
            { label: "Inspection Scheduled", bg: "#dbeafe", color: "#1e3a8a" },
            { label: "Inspection Passed",    bg: "#d8f3dc", color: "#1b4332" },
            { label: "Fully Paid / Closed",  bg: "#1a1917", color: "#ffffff" },
            { label: "Rescheduled / Issue",  bg: "#fee2e2", color: "#7f1d1d" },
          ].map(({ label, bg, color }) => (
            <Link key={label} href="/jobs" style={{ textDecoration: "none" }}>
              <div style={{
                background: bg, color, borderRadius: 20,
                padding: "5px 14px", fontSize: 12, fontWeight: 500,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                {label === "Rescheduled / Issue" && <AlertTriangle size={10} />}
                {label}
                <span style={{ fontWeight: 700 }}>{stageCounts[label]}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: 16, alignItems: "flex-start" }}>

        {/* Alerts */}
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}>
            <AlertTriangle size={14} style={{ color: "var(--amber)" }} />
            Needs attention
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {overdueInvoices.map(inv => (
              <Link key={inv.id} href="/invoices" style={{ textDecoration: "none" }}>
                <div style={{
                  background: "var(--red-bg)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 12px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  cursor: "pointer",
                }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13, color: "var(--red-text)" }}>Overdue invoice — {inv.customer}</div>
                    <div style={{ fontSize: 12, color: "var(--red)" }}>{inv.id} · {inv.type} · {formatCurrency(inv.amount)}</div>
                  </div>
                  <span className={`badge badge-red`}>Overdue</span>
                </div>
              </Link>
            ))}
            {issueJobs.map(job => (
              <Link key={job.id} href={`/jobs/${job.id}`} style={{ textDecoration: "none" }}>
                <div style={{
                  background: "var(--red-bg)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 12px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13, color: "var(--red-text)" }}>Rescheduled / issue — {job.customer}</div>
                    <div style={{ fontSize: 12, color: "var(--red)" }}>{job.id} · {job.nextAction || "Needs attention"}</div>
                  </div>
                  <span className="badge badge-red">Issue</span>
                </div>
              </Link>
            ))}
            {highServiceItems.map(item => (
              <Link key={item.id} href="/service" style={{ textDecoration: "none" }}>
                <div style={{
                  background: "var(--red-bg)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 12px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13, color: "var(--red-text)" }}>High urgency — {item.issue}</div>
                    <div style={{ fontSize: 12, color: "var(--red)" }}>{item.id} · {item.customer}</div>
                  </div>
                  <span className="badge badge-red">High</span>
                </div>
              </Link>
            ))}
            {overdueInvoices.length === 0 && issueJobs.length === 0 && highServiceItems.length === 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--green)", fontSize: 13, padding: "8px 0" }}>
                <CheckCircle2 size={15} />
                No blockers right now — great shape.
              </div>
            )}
          </div>
        </div>

        {/* Upcoming schedule */}
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}>
            <CalendarDays size={14} />
            Coming up
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {upcomingSchedule.map(item => (
              <Link key={item.id} href="/scheduling" style={{ textDecoration: "none" }}>
                <div style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 12px",
                  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{item.customer}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      {formatDate(item.date)} · {item.startTime} · {item.crew.join(", ")}
                    </div>
                  </div>
                  <span className={`badge ${statusBadgeClass(item.type)}`}>{item.type}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Active jobs table */}
      <div className="card" style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 7 }}>
            <ClipboardList size={14} />
            Active job pipeline
          </div>
          <Link href="/jobs" style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>View all →</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Job ID</th>
                <th>Town</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Next action</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {jobs.filter(j => j.status !== "Fully Paid / Closed").map(job => {
                const stage = STAGE_MAP[job.status] || 0;
                const isIssue = job.status === "Rescheduled / Issue";
                return (
                  <tr key={job.id} style={isIssue ? { background: "#fff8f8" } : undefined}>
                    <td style={{ fontWeight: 500 }}>
                      {isIssue && <AlertTriangle size={11} style={{ color: "#dc2626", marginRight: 4, verticalAlign: "middle" }} />}
                      {job.customer}
                    </td>
                    <td><span className="mono badge badge-slate">{job.id}</span></td>
                    <td style={{ color: "var(--text-secondary)" }}>{job.city}, {job.state}</td>
                    <td><span className={`badge ${statusBadgeClass(job.status)}`}>{job.status}</span></td>
                    <td style={{ minWidth: 120 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div className="progress-bar" style={{ flex: 1 }}>
                          <div className="progress-fill" style={{ width: `${stage}%`, background: isIssue ? "#dc2626" : undefined }} />
                        </div>
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)", minWidth: 28 }}>{stage}%</span>
                      </div>
                    </td>
                    <td style={{ color: isIssue ? "#dc2626" : "var(--text-secondary)", maxWidth: 180 }}>{job.nextAction}</td>
                    <td style={{ fontWeight: 500 }}>{formatCurrency(job.contractAmount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
