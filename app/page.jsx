"use client";

import AppShell from "@/components/AppShell";
import Link from "next/link";
import { jobs, invoices, serviceItems, permits, scheduleItems } from "@/lib/data";
import { statusBadgeClass, formatCurrency, formatDate } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, DollarSign, ClipboardList, Wrench, FileText, CalendarDays } from "lucide-react";

export default function DashboardPage() {
  const totalRevenue = jobs.reduce((s, j) => s + j.contractAmount, 0);
  const activeJobs = jobs.filter(j => j.status !== "Inspection Passed").length;
  const openService = serviceItems.filter(s => s.status !== "Resolved").length;
  const pendingPermits = permits.filter(p => p.status !== "Approved").length;
  const overdueInvoices = invoices.filter(i => i.status === "Overdue");
  const upcomingSchedule = scheduleItems.filter(s => s.status !== "Cancelled").slice(0, 3);
  const ptoHolds = jobs.filter(j => j.status === "PTO Hold");
  const highServiceItems = serviceItems.filter(s => s.urgency === "High" && s.status !== "Resolved");

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
            {ptoHolds.map(job => (
              <Link key={job.id} href="/jobs" style={{ textDecoration: "none" }}>
                <div style={{
                  background: "var(--amber-bg)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 12px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13, color: "var(--amber-text)" }}>PTO hold — {job.customer}</div>
                    <div style={{ fontSize: 12, color: "var(--amber)" }}>{job.id} · {job.nextAction}</div>
                  </div>
                  <span className="badge badge-amber">PTO Hold</span>
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
            {overdueInvoices.length === 0 && ptoHolds.length === 0 && highServiceItems.length === 0 && (
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
              {jobs.map(job => (
                <tr key={job.id}>
                  <td style={{ fontWeight: 500 }}>{job.customer}</td>
                  <td><span className="mono badge badge-slate">{job.id}</span></td>
                  <td style={{ color: "var(--text-secondary)" }}>{job.city}, {job.state}</td>
                  <td><span className={`badge ${statusBadgeClass(job.status)}`}>{job.status}</span></td>
                  <td style={{ minWidth: 120 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="progress-bar" style={{ flex: 1 }}>
                        <div className="progress-fill" style={{ width: `${job.stage}%` }} />
                      </div>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)", minWidth: 28 }}>{job.stage}%</span>
                    </div>
                  </td>
                  <td style={{ color: "var(--text-secondary)", maxWidth: 180 }}>{job.nextAction}</td>
                  <td style={{ fontWeight: 500 }}>{formatCurrency(job.contractAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
