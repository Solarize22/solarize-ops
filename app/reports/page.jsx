"use client";
import { useMemo } from "react";
import AppShell from "@/components/AppShell";
import { useAllJobs, jobsToInvoices, jobsToService, jobsToPermits } from "@/lib/useAllJobs";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

function ProgressRow({ label, value, max, color = "var(--text-primary)" }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span style={{ fontWeight: 600 }}>{value} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>/ {max}</span></span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function MetricBlock({ label, value, sub, trend }) {
  return (
    <div style={{
      background: "var(--surface-2)",
      borderRadius: "var(--radius-md)",
      padding: "14px 16px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

const STAGE_MAP = {
  "Scheduled": 20, "Install Complete": 40, "Inspection Scheduled": 60,
  "Inspection Passed": 80, "Fully Paid / Closed": 100, "Rescheduled / Issue": 50,
};

export default function ReportsPage() {
  const jobs = useAllJobs();
  const invoices = useMemo(() => jobsToInvoices(jobs), [jobs]);
  const serviceItems = useMemo(() => jobsToService(jobs), [jobs]);
  const permits = useMemo(() => jobsToPermits(jobs), [jobs]);

  // Computed metrics
  const totalPipeline = jobs.reduce((s, j) => s + (j.contractAmount || j.installCost || 0), 0);
  const collected = invoices.filter(i => i.status === "Paid").reduce((s, i) => s + i.amount, 0);
  const outstanding = invoices.filter(i => i.status !== "Paid").reduce((s, i) => s + i.amount, 0);
  const overdueAmt = invoices.filter(i => i.status === "Overdue").reduce((s, i) => s + i.amount, 0);

  const approvedPermits = permits.filter(p => p.status === "Approved").length;
  const stages = jobs.map(j => STAGE_MAP[j.status] || 20);
  const avgStage = stages.length ? Math.round(stages.reduce((a, b) => a + b, 0) / stages.length) : 0;
  const nearPto = jobs.filter(j => (STAGE_MAP[j.status] || 0) >= 80).length;

  const openService = serviceItems.filter(s => s.status !== "Resolved").length;
  const highUrgency = serviceItems.filter(s => s.urgency === "High" && s.status !== "Resolved").length;

  // Job breakdown by status
  const statusCounts = {};
  jobs.forEach(j => { statusCounts[j.status] = (statusCounts[j.status] || 0) + 1; });

  // Revenue by rep
  const repRevenue = {};
  jobs.forEach(j => { repRevenue[j.rep] = (repRevenue[j.rep] || 0) + (j.contractAmount || j.installCost || 0); });

  // Finance breakdown
  const financeCounts = {};
  jobs.forEach(j => {
    const f = j.financer || j.finance || "Unknown";
    financeCounts[f] = (financeCounts[f] || 0) + 1;
  });

  return (
    <AppShell>
      <div className="page-header">
        <h1>Reports</h1>
        <p>Install, inspection, PTO, and payment performance overview.</p>
      </div>

      {/* Top metrics row */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Pipeline value</div>
          <div className="stat-value">{formatCurrency(totalPipeline)}</div>
          <div className="stat-detail">{jobs.length} jobs</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Collected</div>
          <div className="stat-value" style={{ color: "var(--green)" }}>{formatCurrency(collected)}</div>
          <div className="stat-detail">{Math.round((collected / (collected + outstanding)) * 100)}% of invoiced</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Outstanding</div>
          <div className="stat-value" style={{ color: "var(--amber)" }}>{formatCurrency(outstanding)}</div>
          <div className="stat-detail">Pending + overdue</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Overdue</div>
          <div className="stat-value" style={{ color: overdueAmt > 0 ? "var(--red)" : "var(--green)" }}>
            {formatCurrency(overdueAmt)}
          </div>
          <div className="stat-detail">{invoices.filter(i => i.status === "Overdue").length} invoices past due</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Ops health */}
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16 }}>Ops health</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <MetricBlock label="Avg progress" value={`${avgStage}%`} sub="Across all jobs" />
            <MetricBlock label="Near PTO" value={nearPto} sub="Stage ≥ 80%" />
            <MetricBlock label="Permits OK" value={approvedPermits} sub={`of ${permits.length} total`} />
            <MetricBlock label="Open service" value={openService} sub={`${highUrgency} high urgency`} />
          </div>
        </div>

        {/* Pipeline by status */}
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16 }}>Jobs by status</div>
          {Object.entries(statusCounts).map(([status, count]) => (
            <ProgressRow key={status} label={status} value={count} max={jobs.length} />
          ))}
        </div>

        {/* Finance breakdown */}
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16 }}>Finance partners</div>
          {Object.entries(financeCounts).map(([f, count]) => (
            <ProgressRow key={f} label={f} value={count} max={jobs.length} />
          ))}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Revenue by rep</div>
            {Object.entries(repRevenue).sort(([,a],[,b]) => b - a).map(([rep, amt]) => (
              <div key={rep} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{rep}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{formatCurrency(amt)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Invoice aging table */}
      <div className="card" style={{ padding: "18px 20px" }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>Invoice aging summary</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {["Paid", "Pending", "Overdue"].map(status => {
            const items = invoices.filter(i => i.status === status);
            const total = items.reduce((s, i) => s + i.amount, 0);
            const colorMap = { Paid: "var(--green)", Pending: "var(--amber)", Overdue: "var(--red)" };
            return (
              <div key={status} style={{
                background: "var(--surface-2)",
                borderRadius: "var(--radius-md)",
                padding: "14px 16px",
                borderLeft: `3px solid ${colorMap[status]}`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: 6 }}>
                  {status}
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: colorMap[status] }}>{formatCurrency(total)}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>{items.length} invoice{items.length !== 1 ? "s" : ""}</div>
              </div>
            );
          })}
          <div style={{
            background: "var(--surface-2)",
            borderRadius: "var(--radius-md)",
            padding: "14px 16px",
            borderLeft: "3px solid var(--border-strong)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: 6 }}>
              Total invoiced
            </div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{formatCurrency(invoices.reduce((s, i) => s + i.amount, 0))}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>{invoices.length} invoices</div>
          </div>
        </div>
      </div>

      {/* Roadmap */}
      <div className="card" style={{ padding: "18px 20px", marginTop: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>Planned future modules</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
          {[
            "Lead intake and quoting",
            "Town permit database",
            "Install crew scheduling",
            "Inspection and PTO tracking",
            "Empower / partner invoicing",
            "Service ticket dispatch",
            "Battery and EV add-ons",
            "Document storage by job",
            "Real-time monitoring alerts",
            "Customer portal",
            "Subcontractor management",
            "Material procurement tracking",
          ].map(item => (
            <div key={item} style={{
              background: "var(--surface-2)",
              borderRadius: "var(--radius-md)",
              padding: "10px 12px",
              fontSize: 12,
              color: "var(--text-secondary)",
            }}>
              {item}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
