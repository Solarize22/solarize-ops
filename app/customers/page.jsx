"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import WorkspaceHeader from "@/components/WorkspaceHeader";
import { AlertTriangle, Mail, MessageSquareMore, Phone, Search, UserRound } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useUserRole } from "@/lib/useUserRole";

const FILTERS = [
  { key: "all", label: "All customers" },
  { key: "needsFollowUp", label: "Needs follow-up" },
  { key: "atRisk", label: "At risk" },
  { key: "openTasks", label: "Open tasks" },
  { key: "healthy", label: "Healthy" },
];

const SORTS = [
  { key: "attention", label: "Needs attention" },
  { key: "name", label: "Name" },
  { key: "lastContact", label: "Last contact" },
  { key: "nextFollowUp", label: "Next follow-up" },
];

function daysSince(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.floor((Date.now() - parsed.getTime()) / 86400000);
}

function healthTone(customer) {
  if (customer.atRiskJobCount > 0 || customer.overdueTaskCount > 0) return "red";
  if (customer.needsFollowUp || customer.openTaskCount > 0) return "amber";
  return "green";
}

function healthLabel(customer) {
  if (customer.atRiskJobCount > 0 || customer.overdueTaskCount > 0) return "At risk";
  if (customer.needsFollowUp || customer.openTaskCount > 0) return "Needs follow-up";
  return "Healthy";
}

function toneBadgeClass(tone) {
  if (tone === "red") return "badge-red";
  if (tone === "amber") return "badge-amber";
  return "badge-green";
}

export default function CustomersPage() {
  const { canSeeFinancials } = useUserRole();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("attention");

  useEffect(() => {
    setLoading(true);
    fetch("/api/v2/customers")
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => setCustomers(Array.isArray(data) ? data : []))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => ({
    needsFollowUp: customers.filter((customer) => customer.needsFollowUp).length,
    atRisk: customers.filter((customer) => customer.atRiskJobCount > 0 || customer.overdueTaskCount > 0).length,
    openTasks: customers.filter((customer) => customer.openTaskCount > 0).length,
  }), [customers]);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const filteredCustomers = customers.filter((customer) => {
      const matchesSearch = !normalizedSearch || [
        customer.name,
        customer.email,
        customer.phone,
        customer.city,
        customer.state,
        ...(customer.repNames || []),
        ...(customer.followUpOwners || []),
        ...(customer.jobs || []).map((job) => job.jobNumber),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);

      if (!matchesSearch) return false;

      switch (filter) {
        case "needsFollowUp":
          return customer.needsFollowUp;
        case "atRisk":
          return customer.atRiskJobCount > 0 || customer.overdueTaskCount > 0;
        case "openTasks":
          return customer.openTaskCount > 0;
        case "healthy":
          return !customer.needsFollowUp && customer.atRiskJobCount === 0 && customer.openTaskCount === 0;
        default:
          return true;
      }
    });

    return [...filteredCustomers].sort((left, right) => {
      switch (sort) {
        case "name":
          return left.name.localeCompare(right.name);
        case "lastContact":
          return String(right.lastContactAt || "").localeCompare(String(left.lastContactAt || ""));
        case "nextFollowUp":
          return String(left.nextFollowUpAt || "9999-12-31").localeCompare(String(right.nextFollowUpAt || "9999-12-31"));
        default:
          if (Number(right.needsFollowUp) !== Number(left.needsFollowUp)) {
            return Number(right.needsFollowUp) - Number(left.needsFollowUp);
          }
          if ((right.atRiskJobCount + right.overdueTaskCount) !== (left.atRiskJobCount + left.overdueTaskCount)) {
            return (right.atRiskJobCount + right.overdueTaskCount) - (left.atRiskJobCount + left.overdueTaskCount);
          }
          if (right.openTaskCount !== left.openTaskCount) {
            return right.openTaskCount - left.openTaskCount;
          }
          return left.name.localeCompare(right.name);
      }
    });
  }, [customers, filter, search, sort]);

  const totalOutstanding = useMemo(() => customers.reduce((sum, customer) => sum + (customer.totalOutstandingCents || 0), 0), [customers]);

  return (
    <AppShell>
      <WorkspaceHeader
        eyebrow="Customer CRM"
        title="See the relationship, not just the project"
        description="Track each homeowner across jobs, follow-up history, risk signals, and open commitments so the team can keep communication tight from sale to closeout."
      >
        <span className="hero-chip">{loading ? "Loading..." : `${customers.length} homeowners in the CRM`}</span>
        <span className="hero-chip">{loading ? "Loading..." : `${counts.needsFollowUp} need follow-up`}</span>
        <span className="hero-chip">{loading ? "Loading..." : `${counts.atRisk} at risk`}</span>
      </WorkspaceHeader>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Customers</div>
          <div className="stat-value">{customers.length}</div>
          <div className="stat-detail">Homeowners in the CRM</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Need follow-up</div>
          <div className="stat-value" style={{ color: "var(--amber)" }}>{counts.needsFollowUp}</div>
          <div className="stat-detail">Past due or still untouched</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">At risk</div>
          <div className="stat-value" style={{ color: "var(--red)" }}>{counts.atRisk}</div>
          <div className="stat-detail">Blocked jobs or overdue commitments</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{canSeeFinancials ? "Open balance" : "Open tasks"}</div>
          <div className="stat-value" style={{ color: canSeeFinancials ? "var(--amber)" : "var(--text-primary)" }}>
            {canSeeFinancials ? formatCurrency(totalOutstanding / 100) : counts.openTasks}
          </div>
          <div className="stat-detail">{canSeeFinancials ? "Across all linked jobs" : "Customers carrying active tasks"}</div>
        </div>
      </div>

      <div className="card toolbar-card">
        <div className="toolbar-group" style={{ flex: "1 1 360px" }}>
          <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 360 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, job #, rep, owner..."
            style={{ width: "100%", paddingLeft: 30 }}
          />
        </div>

        <div className="segmented-control">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`segmented-button ${filter === item.key ? "active" : ""}`}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
              {item.key === "needsFollowUp" ? ` (${counts.needsFollowUp})` : ""}
              {item.key === "atRisk" ? ` (${counts.atRisk})` : ""}
              {item.key === "openTasks" ? ` (${counts.openTasks})` : ""}
            </button>
          ))}
        </div>
        </div>

        <div className="toolbar-group">
          <select value={sort} onChange={(event) => setSort(event.target.value)} style={{ width: "auto", minWidth: 160 }}>
            {SORTS.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>

          {(search || filter !== "all" || sort !== "attention") ? (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setSearch("");
                setFilter("all");
                setSort("attention");
              }}
            >
              Clear
            </button>
          ) : null}

          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {loading ? "Loading..." : `${filtered.length} customer${filtered.length !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
        {loading ? (
          <div className="card empty-state" style={{ gridColumn: "1 / -1" }}>Loading customers...</div>
        ) : filtered.length === 0 ? (
          <div className="card empty-state" style={{ gridColumn: "1 / -1" }}>No customers match your filters.</div>
        ) : filtered.map((customer) => {
          const tone = healthTone(customer);
          const lastContactAge = daysSince(customer.lastContactAt);
          return (
            <div key={customer.id} className="card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em" }}>{customer.name}</div>
                    <span className={`badge ${toneBadgeClass(tone)}`}>{healthLabel(customer)}</span>
                    {customer.activeJobCount > 1 ? <span className="badge badge-slate">{customer.activeJobCount} active jobs</span> : null}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {[customer.primaryStreet, customer.city, customer.state, customer.postalCode].filter(Boolean).join(", ") || "Address not set"}
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: 12, color: "var(--text-secondary)" }}>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{customer.followUpOwners?.[0] || "Unassigned"}</div>
                  <div>Follow-up owner</div>
                  <Link href={`/customers/${customer.id}`} style={{ display: "inline-block", marginTop: 8, textDecoration: "none", fontWeight: 700, color: "var(--text-primary)" }}>
                    Open customer
                  </Link>
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {customer.phone ? (
                  <a href={`tel:${customer.phone}`} className="btn btn-outline" style={{ minHeight: 32, padding: "6px 10px" }}>
                    <Phone size={12} />
                    {customer.phone}
                  </a>
                ) : null}
                {customer.email ? (
                  <a href={`mailto:${customer.email}`} className="btn btn-outline" style={{ minHeight: 32, padding: "6px 10px" }}>
                    <Mail size={12} />
                    Email
                  </a>
                ) : null}
                {(customer.repNames || []).length > 0 ? (
                  <span className="btn btn-ghost" style={{ minHeight: 32, padding: "6px 10px", cursor: "default" }}>
                    <UserRound size={12} />
                    Rep: {customer.repNames.join(", ")}
                  </span>
                ) : null}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Last contact</div>
                  <div style={{ fontWeight: 700 }}>{formatDate(customer.lastContactAt)}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                    {lastContactAge === null ? "No contact logged" : `${lastContactAge} day${lastContactAge === 1 ? "" : "s"} ago`}
                  </div>
                </div>
                <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: tone === "red" ? "#fff2f0" : tone === "amber" ? "#fff8e8" : "var(--surface-2)" }}>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Next follow-up</div>
                  <div style={{ fontWeight: 700 }}>{formatDate(customer.nextFollowUpAt)}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                    {customer.overdueTaskCount > 0 ? `${customer.overdueTaskCount} overdue task${customer.overdueTaskCount === 1 ? "" : "s"}` : customer.openTaskCount > 0 ? `${customer.openTaskCount} open task${customer.openTaskCount === 1 ? "" : "s"}` : "No open tasks"}
                  </div>
                </div>
                <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Jobs in relationship</div>
                  <div style={{ fontWeight: 700 }}>{customer.totalJobCount}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                    {customer.activeJobCount} active · {customer.closedJobCount} closed
                  </div>
                </div>
                <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>
                    {canSeeFinancials ? "Outstanding" : "Relationship health"}
                  </div>
                  <div style={{ fontWeight: 700 }}>{canSeeFinancials ? formatCurrency((customer.totalOutstandingCents || 0) / 100) : healthLabel(customer)}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                    {customer.atRiskJobCount} at-risk job{customer.atRiskJobCount === 1 ? "" : "s"}
                  </div>
                </div>
              </div>

              <div style={{ paddingTop: 4, borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                  <MessageSquareMore size={13} />
                  Related jobs
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {customer.jobs.slice(0, 4).map((job) => (
                    <Link key={job.id} href={`/jobs/${job.jobNumber}`} style={{ textDecoration: "none" }}>
                      <span className={`badge ${["inspection_failed", "on_hold"].includes(job.currentStatus) ? "badge-red" : "badge-slate"}`}>
                        {job.jobNumber}
                      </span>
                    </Link>
                  ))}
                  {customer.jobs.length > 4 ? (
                    <span className="badge badge-slate">+{customer.jobs.length - 4} more</span>
                  ) : null}
                </div>
              </div>

              {tone === "red" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "#fff2f0", border: "1px solid #f5c4be", fontSize: 12, color: "#8f3529" }}>
                  <AlertTriangle size={14} />
                  This relationship has active risk signals and should be opened soon.
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
