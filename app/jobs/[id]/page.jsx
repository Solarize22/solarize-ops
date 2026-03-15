"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft, Pencil, Save, X, MapPin, Phone, Mail, Zap, Wrench, DollarSign, User, Building, Plus, Check, AlertTriangle } from "lucide-react";

const STATUSES = [
  "Scheduled",
  "Install Complete",
  "Inspection Scheduled",
  "Inspection Passed",
  "Fully Paid / Closed",
  "Rescheduled / Issue",
];

const PERMIT_STATUSES = ["Not Submitted","Submitted","In Review","Approved","Utility Redesign Needed"];
const INTERCONNECTION_STATUSES = ["Not submitted","Submitted","Pending redesign","Approved"];
const REPS = ["Tommy","Kyle","Matt"];
const FINANCERS = ["GoodLeap","LightReach","Mosaic","Cash","Sunlight","Dividend","Empower"];
const CONTRACTORS = ["Solarize","Empower","Other"];
const ROOF_TYPES = ["Asphalt shingle","Metal","Tile","Flat/TPO","Cedar shake"];
const INVERTERS = ["Enphase IQ8A","Enphase IQ8M","Enphase IQ8H","SolarEdge HD Wave","SolarEdge Energy Hub"];

const STATUS_COLORS = {
  "Scheduled":             { bg: "#dbeafe", color: "#1e3a8a" },
  "Install Complete":      { bg: "#d8f3dc", color: "#1b4332" },
  "Inspection Scheduled":  { bg: "#dbeafe", color: "#1e3a8a" },
  "Inspection Passed":     { bg: "#d8f3dc", color: "#1b4332" },
  "Fully Paid / Closed":   { bg: "#1a1917", color: "#ffffff" },
  "Rescheduled / Issue":   { bg: "#fee2e2", color: "#7f1d1d" },
};

const STAGE_MAP = {
  "Scheduled":             20,
  "Install Complete":      40,
  "Inspection Scheduled":  60,
  "Inspection Passed":     80,
  "Fully Paid / Closed":   100,
  "Rescheduled / Issue":   50,
};

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value || "—"}</div>
    </div>
  );
}

function EditField({ label, name, value, onChange, type = "text", options = null }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>{label}</div>
      {options ? (
        <select name={name} value={value || ""} onChange={onChange} style={{ width: "100%" }}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === "checkbox" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4 }}>
          <input type="checkbox" name={name} checked={!!value} onChange={onChange} style={{ width: 15, height: 15 }} />
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Yes</span>
        </div>
      ) : (
        <input type={type} name={name} value={value || ""} onChange={onChange} style={{ width: "100%" }} />
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children, columns = 4 }) {
  return (
    <div className="card" style={{ padding: "16px 20px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
        <Icon size={14} style={{ color: "var(--text-secondary)" }} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns},1fr)`, gap: "14px 20px" }}>
        {children}
      </div>
    </div>
  );
}

function Milestone({ icon, title, subtitle, date, done, failed, picker, onAdd, children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", borderBottom: "0.5px solid var(--border)" }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2,
        background: done ? "#d8f3dc" : failed ? "#fee2e2" : "var(--surface-2)",
        border: done || failed ? "none" : "0.5px dashed var(--border-strong)",
      }}>
        {done ? <Check size={13} style={{ color: "#1b4332" }} /> : failed ? <X size={13} style={{ color: "#7f1d1d" }} /> : null}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{title}</div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{subtitle}</div>
        {children}
      </div>
      <div style={{ flexShrink: 0 }}>
        {date ? (
          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: failed ? "#fee2e2" : "#d8f3dc", color: failed ? "#7f1d1d" : "#1b4332", fontWeight: 500 }}>
            {date}
          </span>
        ) : onAdd ? (
          <button
            onClick={onAdd}
            style={{ padding: "5px 12px", borderRadius: 20, border: "0.5px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-secondary)", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-body)" }}
          >
            <Plus size={11} /> {picker}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function JobDetailPage() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [openPicker, setOpenPicker] = useState(null);
  const [pickerDate, setPickerDate] = useState("");
  const [payConfirm, setPayConfirm] = useState(null); // { type: "m1"|"m2" }
  const [loading, setLoading] = useState(true);
  const savedSnapshot = useRef(null);

  useEffect(() => {
    fetch("/api/jobs")
      .then(r => r.json())
      .then(all => {
        const found = all.find(j => j.id === id);
        if (found) { savedSnapshot.current = { ...found }; setJob({ ...found }); }
        else setJob(null);
      })
      .catch(() => setJob(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <AppShell><div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-secondary)" }}>Loading...</div></AppShell>;
  }

  if (!job) {
    return (
      <AppShell>
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: 12 }}>Job not found.</p>
          <Link href="/jobs" style={{ color: "var(--text-primary)", fontSize: 13 }}>← Back to jobs</Link>
        </div>
      </AppShell>
    );
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setJob(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  function handleSave() {
    fetch("/api/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: job.id, updates: job }),
    }).catch(() => {});
    savedSnapshot.current = { ...job };
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function handleCancel() {
    setJob({ ...savedSnapshot.current });
    setEditing(false);
  }

  function applyUpdate(updates) {
    const stamped = { ...updates, lastUpdated: new Date().toISOString() };
    setJob(prev => {
      const next = { ...prev, ...stamped };
      fetch("/api/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: next.id, updates: stamped }),
      }).catch(() => {});
      if (savedSnapshot.current) Object.assign(savedSnapshot.current, stamped);
      return next;
    });
    setOpenPicker(null);
    setPickerDate("");
  }

  function confirmMilestone(type) {
    if (type === "installComplete") {
      applyUpdate({ installDate: pickerDate || job.installDate, status: "Install Complete", m1Due: true });
    } else if (type === "inspectionScheduled") {
      if (!pickerDate) return;
      applyUpdate({ inspectionDate: pickerDate, status: "Inspection Scheduled" });
    } else if (type === "inspectionPassed") {
      applyUpdate({ status: "Inspection Passed", m2Due: true, inspectionDate: job.inspectionDate || pickerDate });
    } else if (type === "inspectionFailed") {
      applyUpdate({ status: "Rescheduled / Issue", inspectionDate: job.inspectionDate || pickerDate });
    } else if (type === "closedOut") {
      applyUpdate({ status: "Fully Paid / Closed" });
    } else if (type === "flagIssue") {
      applyUpdate({ status: "Rescheduled / Issue" });
    }
  }

  function toggleM1Received() {
    if (!job.m1Received) {
      setPayConfirm({ type: "m1" });
    } else {
      applyUpdate({ m1Received: false });
    }
  }

  function toggleM2Received() {
    if (!job.m2Received) {
      setPayConfirm({ type: "m2" });
    } else {
      applyUpdate({ m2Received: false });
    }
  }

  function confirmPayment() {
    const { type } = payConfirm;
    const updates = { [type === "m1" ? "m1Received" : "m2Received"]: true };
    const willClose =
      (type === "m2" && job.m1Received) || (type === "m1" && job.m2Received);
    if (willClose) {
      updates.status = "Fully Paid / Closed";
      updates.active = false;
    }
    applyUpdate(updates);
    setPayConfirm(null);
  }

  const sc = STATUS_COLORS[job.status] || { bg: "#f1f5f9", color: "#334155" };
  const stage = STAGE_MAP[job.status] || 0;
  const isIssue = job.status === "Rescheduled / Issue";
  const m1Amount = Math.round((job.installCost || job.contractAmount || 0) * 0.8);
  const m2Amount = Math.round((job.installCost || job.contractAmount || 0) * 0.2);
  const m1IsDue = job.m1Due || ["Install Complete","Inspection Scheduled","Inspection Passed","Fully Paid / Closed"].includes(job.status);
  const m2IsDue = job.m2Due || ["Inspection Passed","Fully Paid / Closed"].includes(job.status);
  const addersTotal = (job.adders || []).reduce((s, a) => s + Number(a.cost || 0), 0);

  function DatePicker({ type, label, showPassFail = false }) {
    if (openPicker !== type) return null;
    return (
      <div style={{ marginTop: 10, padding: 12, background: "var(--surface-2)", borderRadius: "var(--radius-md)" }}>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>{label}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input type="date" value={pickerDate} onChange={e => setPickerDate(e.target.value)} style={{ fontSize: 12 }} />
          {!showPassFail && (
            <button className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => confirmMilestone(type)}>Confirm</button>
          )}
          {showPassFail && (
            <>
              <button style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#d8f3dc", color: "#1b4332", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-body)" }} onClick={() => confirmMilestone("inspectionPassed")}>✓ Mark passed</button>
              <button style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#fee2e2", color: "#7f1d1d", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-body)" }} onClick={() => confirmMilestone("inspectionFailed")}>✗ Mark failed</button>
            </>
          )}
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setOpenPicker(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  const willAutoClose =
    payConfirm &&
    ((payConfirm.type === "m2" && job.m1Received) ||
     (payConfirm.type === "m1" && job.m2Received));

  return (
    <AppShell>
      {/* Payment confirmation modal */}
      {payConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" style={{ width: 380, padding: 28, borderRadius: "var(--radius-lg)" }}>
            <h3 style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>
              Confirm {payConfirm.type === "m1" ? "M1 (80%)" : "M2 (20%)"} received?
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: willAutoClose ? 10 : 20 }}>
              {payConfirm.type === "m1" ? "Mark the 80% milestone payment" : "Mark the 20% final payment"}
              {m1Amount && payConfirm.type === "m1" ? ` of ${new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(m1Amount)}` : ""}
              {m2Amount && payConfirm.type === "m2" ? ` of ${new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(m2Amount)}` : ""}
              {" "}as collected for <strong>{job.customer}</strong>.
            </p>
            {willAutoClose && (
              <div style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: "var(--radius-md)", padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#92400e" }}>
                ⚠️ Both M1 and M2 will be received — this job will automatically be marked <strong>Fully Paid / Closed</strong> and moved to <strong>Inactive</strong>.
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setPayConfirm(null)} style={{ padding: "8px 18px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "var(--surface)", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-body)" }}>
                Cancel
              </button>
              <button onClick={confirmPayment} style={{ padding: "8px 18px", borderRadius: "var(--radius-md)", border: "none", background: "var(--text-primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>
                Yes, confirm
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Link href="/jobs" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", marginBottom: 8 }}>
            <ArrowLeft size={13} /> Back to jobs
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {isIssue && <AlertTriangle size={16} style={{ color: "#dc2626" }} />}
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>{job.customer}</h1>
            <span className="mono badge badge-slate">{job.id}</span>
            <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, fontWeight: 500, background: sc.bg, color: sc.color }}>{job.status}</span>
            {job.battery && <span className="badge badge-slate">Battery</span>}
            {job.hoa && <span className="badge badge-slate">HOA</span>}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
            <MapPin size={12} />{job.street}, {job.city}, {job.state} {job.zip}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saved && <span style={{ fontSize: 12, color: "var(--green)", display: "flex", alignItems: "center", gap: 5 }}>✓ Saved</span>}
          {/* Flag as issue */}
          {!isIssue && job.status !== "Fully Paid / Closed" && (
            <button
              className="btn btn-outline"
              onClick={() => confirmMilestone("flagIssue")}
              style={{ fontSize: 12, color: "#dc2626", borderColor: "#fca5a5" }}
            >
              <AlertTriangle size={12} /> Flag issue
            </button>
          )}
          {editing ? (
            <>
              <button className="btn btn-outline" onClick={handleCancel}><X size={13} /> Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}><Save size={13} /> Save changes</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => setEditing(true)}><Pencil size={13} /> Edit job</button>
          )}
        </div>
      </div>

      {/* Issue banner */}
      {isIssue && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "var(--radius-md)", padding: "10px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={14} style={{ color: "#dc2626", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: "#7f1d1d" }}>Job flagged — needs attention</span>
            {job.nextAction && <span style={{ fontSize: 12, color: "#991b1b", marginLeft: 10 }}>→ {job.nextAction}</span>}
          </div>
          {job.status === "Rescheduled / Issue" && (
            <button
              onClick={() => applyUpdate({ status: job.installDate ? "Install Complete" : "Scheduled" })}
              style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: "#1a1917", color: "white", fontSize: 11, cursor: "pointer", fontFamily: "var(--font-body)" }}
            >
              Resolve &amp; resume
            </button>
          )}
        </div>
      )}

      {/* Progress */}
      <div className="card" style={{ padding: "14px 20px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
          <span style={{ fontWeight: 500 }}>Project progress</span>
          <span>{stage}%</span>
        </div>
        <div className="progress-bar" style={{ height: 8 }}>
          <div className="progress-fill" style={{ width: `${stage}%`, background: isIssue ? "#dc2626" : undefined }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: "var(--text-tertiary)" }}>
          {["Scheduled","Install","Inspection","Passed","Closed"].map((label, i) => (
            <span key={label} style={{ fontWeight: stage >= (i + 1) * 20 ? 600 : 400, color: stage >= (i + 1) * 20 ? "var(--text-primary)" : "var(--text-tertiary)" }}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Milestones */}
      <div className="card" style={{ padding: "16px 20px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
          <Zap size={14} style={{ color: "var(--text-secondary)" }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>Pipeline milestones</span>
        </div>

        {/* 1. Scheduled */}
        <Milestone
          title="Scheduled"
          subtitle="Install date confirmed, crew assigned"
          done={!!job.installDate || ["Install Complete","Inspection Scheduled","Inspection Passed","Fully Paid / Closed"].includes(job.status)}
          date={job.installDate ? formatDate(job.installDate) : null}
          picker="Set install date"
          onAdd={job.status === "Scheduled" ? () => { setOpenPicker("installScheduled"); setPickerDate(""); } : null}
        >
          {openPicker === "installScheduled" && (
            <div style={{ marginTop: 10, padding: 12, background: "var(--surface-2)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>Confirm install date</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="date" value={pickerDate} onChange={e => setPickerDate(e.target.value)} style={{ fontSize: 12 }} />
                <button className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => applyUpdate({ installDate: pickerDate })}>Save</button>
                <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setOpenPicker(null)}>Cancel</button>
              </div>
            </div>
          )}
        </Milestone>

        {/* 2. Install Complete → triggers M1 */}
        <Milestone
          title="Install complete"
          subtitle={m1IsDue ? "✓ M1 triggered — $" + m1Amount.toLocaleString() + " due" : "Mark when panels are installed — triggers M1"}
          done={["Install Complete","Inspection Scheduled","Inspection Passed","Fully Paid / Closed"].includes(job.status)}
          date={["Install Complete","Inspection Scheduled","Inspection Passed","Fully Paid / Closed"].includes(job.status) ? (job.installDate ? formatDate(job.installDate) : "Done") : null}
          picker="Mark install complete"
          onAdd={job.status === "Scheduled" ? () => { setOpenPicker("installComplete"); setPickerDate(""); } : null}
        >
          <DatePicker type="installComplete" label="Install date — marks Install Complete and triggers M1" />
        </Milestone>

        {/* 3. Inspection Scheduled */}
        <Milestone
          title="Inspection scheduled"
          subtitle="Booked with municipality / AHJ"
          done={["Inspection Scheduled","Inspection Passed","Fully Paid / Closed"].includes(job.status)}
          date={job.inspectionDate ? formatDate(job.inspectionDate) : (["Inspection Scheduled","Inspection Passed"].includes(job.status) ? "Scheduled" : null)}
          picker="Schedule inspection"
          onAdd={job.status === "Install Complete" ? () => { setOpenPicker("inspectionScheduled"); setPickerDate(""); } : null}
        >
          <DatePicker type="inspectionScheduled" label="Inspection date with AHJ" />
        </Milestone>

        {/* 4. Inspection Passed → triggers M2 */}
        <Milestone
          title="Inspection result"
          subtitle={m2IsDue ? "✓ Passed — M2 triggered — $" + m2Amount.toLocaleString() + " due" : "Mark outcome after inspection"}
          done={["Inspection Passed","Fully Paid / Closed"].includes(job.status)}
          failed={job.status === "Rescheduled / Issue" && !!job.inspectionDate}
          date={["Inspection Passed","Fully Paid / Closed"].includes(job.status) ? "Passed" : null}
          picker="Record inspection result"
          onAdd={job.status === "Inspection Scheduled" ? () => { setOpenPicker("inspectionResult"); setPickerDate(""); } : null}
        >
          <DatePicker type="inspectionResult" label="Inspection outcome" showPassFail={true} />
        </Milestone>

        {/* 5. Fully Paid / Closed */}
        <Milestone
          title="Fully paid / closed"
          subtitle="Both M1 and M2 received — job complete"
          done={job.status === "Fully Paid / Closed"}
          date={job.status === "Fully Paid / Closed" ? "Closed" : null}
          picker="Mark as closed"
          onAdd={job.status === "Inspection Passed" && job.m1Received && job.m2Received ? () => confirmMilestone("closedOut") : null}
        >
          {job.status === "Inspection Passed" && !(job.m1Received && job.m2Received) && (
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
              Collect M1 and M2 payments below to close out
            </div>
          )}
        </Milestone>
      </div>

      {/* Payments */}
      <div className="card" style={{ padding: "16px 20px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
          <DollarSign size={14} style={{ color: "var(--text-secondary)" }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>Payments</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>Install cost</div>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>{formatCurrency(job.installCost || job.contractAmount)}</div>
          </div>
          {addersTotal > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>Adders total</div>
              <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-secondary)" }}>+{formatCurrency(addersTotal)}</div>
            </div>
          )}
        </div>

        {/* M1 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "var(--radius-md)", marginBottom: 8, background: m1IsDue ? (job.m1Received ? "#d8f3dc" : "#fef3c7") : "var(--surface-2)" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>M1 — 80% — {formatCurrency(m1Amount)}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
              {m1IsDue ? (job.m1Received ? "Received" : "Due — triggered by Install Complete") : "Due when install is marked complete"}
            </div>
          </div>
          {m1IsDue && (
            <button
              onClick={toggleM1Received}
              style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", border: "none",
                background: job.m1Received ? "#1b4332" : "var(--text-primary)",
                color: "white",
              }}
            >
              {job.m1Received ? "✓ Received" : "Mark received"}
            </button>
          )}
        </div>

        {/* M2 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "var(--radius-md)", background: m2IsDue ? (job.m2Received ? "#d8f3dc" : "#fef3c7") : "var(--surface-2)" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>M2 — 20% — {formatCurrency(m2Amount)}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
              {m2IsDue ? (job.m2Received ? "Received" : "Due — triggered by Inspection Passed") : "Due when inspection passes"}
            </div>
          </div>
          {m2IsDue && (
            <button
              onClick={toggleM2Received}
              style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", border: "none",
                background: job.m2Received ? "#1b4332" : "var(--text-primary)",
                color: "white",
              }}
            >
              {job.m2Received ? "✓ Received" : "Mark received"}
            </button>
          )}
        </div>

        {/* Adders */}
        {(job.adders || []).length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Adders</div>
            {job.adders.map((a, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "0.5px solid var(--border)" }}>
                <span style={{ color: "var(--text-secondary)" }}>{a.description}</span>
                <span style={{ fontWeight: 500 }}>+{formatCurrency(a.cost)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Homeowner */}
      <Section title="Homeowner" icon={User} columns={4}>
        {editing ? (
          <>
            <EditField label="Customer name" name="customer" value={job.customer} onChange={handleChange} />
            <EditField label="Phone" name="phone" value={job.phone} onChange={handleChange} type="tel" />
            <EditField label="Email" name="email" value={job.email} onChange={handleChange} type="email" />
            <EditField label="Street" name="street" value={job.street} onChange={handleChange} />
            <EditField label="City" name="city" value={job.city} onChange={handleChange} />
            <EditField label="State" name="state" value={job.state} onChange={handleChange} />
            <EditField label="Zip" name="zip" value={job.zip} onChange={handleChange} />
            <EditField label="HOA" name="hoa" value={job.hoa} onChange={handleChange} type="checkbox" />
          </>
        ) : (
          <>
            <Field label="Customer name" value={job.customer} />
            <Field label="Phone" value={job.phone ? <a href={`tel:${job.phone}`} style={{ color: "var(--text-primary)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}><Phone size={11} />{job.phone}</a> : null} />
            <Field label="Email" value={job.email ? <a href={`mailto:${job.email}`} style={{ color: "var(--text-primary)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}><Mail size={11} />{job.email}</a> : null} />
            <Field label="Address" value={`${job.street}, ${job.city}, ${job.state} ${job.zip}`} />
            <Field label="HOA" value={job.hoa ? "Yes" : "No"} />
          </>
        )}
      </Section>

      {/* System */}
      <Section title="System" icon={Zap} columns={5}>
        {editing ? (
          <>
            <EditField label="System size (kW)" name="systemSize" value={job.systemSize} onChange={handleChange} />
            <EditField label="Panel count" name="panelCount" value={job.panelCount} onChange={handleChange} type="number" />
            <EditField label="Watt / panel" name="watt" value={job.watt} onChange={handleChange} type="number" />
            <EditField label="Inverter" name="inverter" value={job.inverter} onChange={handleChange} options={INVERTERS} />
            <EditField label="Roof type" name="roofType" value={job.roofType} onChange={handleChange} options={ROOF_TYPES} />
            <EditField label="Battery" name="battery" value={job.battery} onChange={handleChange} type="checkbox" />
          </>
        ) : (
          <>
            <Field label="System size" value={job.systemSize ? `${job.systemSize} kW` : null} />
            <Field label="Panel count" value={job.panelCount} />
            <Field label="Watt / panel" value={job.watt ? `${job.watt}W` : null} />
            <Field label="Inverter" value={job.inverter} />
            <Field label="Roof type" value={job.roofType} />
            <Field label="Battery" value={job.battery ? "Yes" : "No"} />
          </>
        )}
      </Section>

      {/* Project */}
      <Section title="Project" icon={Wrench} columns={4}>
        {editing ? (
          <>
            <EditField label="Status" name="status" value={job.status} onChange={handleChange} options={STATUSES} />
            <EditField label="Rep" name="rep" value={job.rep} onChange={handleChange} options={REPS} />
            <EditField label="Financer" name="financer" value={job.financer} onChange={handleChange} options={FINANCERS} />
            <EditField label="Contractor" name="contractor" value={job.contractor} onChange={handleChange} options={CONTRACTORS} />
            <EditField label="Partner" name="partner" value={job.partner} onChange={handleChange} />
            <EditField label="Utility company" name="utilityCompany" value={job.utilityCompany} onChange={handleChange} />
            <EditField label="Permit status" name="permitStatus" value={job.permitStatus} onChange={handleChange} options={PERMIT_STATUSES} />
            <EditField label="Interconnection" name="interconnectionStatus" value={job.interconnectionStatus} onChange={handleChange} options={INTERCONNECTION_STATUSES} />
            <div style={{ gridColumn: "span 2" }}>
              <EditField label="Next action / notes for issue" name="nextAction" value={job.nextAction} onChange={handleChange} />
            </div>
            <EditField label="Invoice #" name="invoiceNumber" value={job.invoiceNumber} onChange={handleChange} />
            <EditField label="Install date" name="installDate" value={job.installDate} onChange={handleChange} type="date" />
            <EditField label="Inspection date" name="inspectionDate" value={job.inspectionDate} onChange={handleChange} type="date" />
          </>
        ) : (
          <>
            <Field label="Rep" value={job.rep} />
            <Field label="Financer" value={job.financer} />
            <Field label="Contractor" value={job.contractor} />
            <Field label="Partner" value={job.partner} />
            <Field label="Crew" value={Array.isArray(job.crew) ? job.crew.join(", ") : job.crew} />
            <Field label="Utility company" value={job.utilityCompany} />
            <Field label="Permit status" value={job.permitStatus} />
            <Field label="Interconnection" value={job.interconnectionStatus} />
            <Field label="Invoice #" value={job.invoiceNumber} />
            <Field label="Install date" value={job.installDate ? formatDate(job.installDate) : ""} />
            <Field label="Inspection date" value={job.inspectionDate ? formatDate(job.inspectionDate) : ""} />
            <Field label="Next action" value={job.nextAction} />
          </>
        )}
      </Section>

      {/* Notes */}
      <div className="card" style={{ padding: "16px 20px" }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Notes</div>
        {editing ? (
          <textarea name="notes" value={job.notes || ""} onChange={handleChange} rows={4} style={{ width: "100%", resize: "vertical" }} />
        ) : (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>{job.notes || "No notes yet."}</p>
        )}
      </div>
    </AppShell>
  );
}
