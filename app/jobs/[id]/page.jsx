"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  ArrowLeft, Pencil, Save, X, MapPin, Phone, Mail,
  Zap, DollarSign, User, Plus, Minus, Check,
  AlertTriangle, Calendar, Users,
} from "lucide-react";

const STATUSES       = ["Scheduled","Install Complete","Inspection Scheduled","Inspection Passed","Fully Paid / Closed","Rescheduled / Issue"];
const PERMIT_STATUSES = ["Not Submitted","Submitted","In Review","Approved","Utility Redesign Needed"];
const INTERCONNECTION_STATUSES = ["Not submitted","Submitted","Pending redesign","Approved"];
const REPS           = ["Tommy","Kyle","Matt"];
const FINANCERS      = ["GoodLeap","LightReach","Mosaic","Cash","Sunlight","Dividend","Empower"];
const CONTRACTORS    = ["Solarize","Empower","Other"];
const ROOF_TYPES     = ["Asphalt shingle","Metal","Tile","Flat/TPO","Cedar shake"];
const INVERTERS      = ["Enphase IQ8A","Enphase IQ8M","Enphase IQ8H","SolarEdge HD Wave","SolarEdge Energy Hub"];
const INSTALL_STATUSES    = ["Scheduled","Complete","Cancelled"];
const INSPECTION_STATUSES = ["Scheduled","Passed","Failed"];

const STATUS_COLORS = {
  "Scheduled":             { bg: "#dbeafe", color: "#1e3a8a" },
  "Install Complete":      { bg: "#d8f3dc", color: "#1b4332" },
  "Inspection Scheduled":  { bg: "#dbeafe", color: "#1e3a8a" },
  "Inspection Passed":     { bg: "#d8f3dc", color: "#1b4332" },
  "Fully Paid / Closed":   { bg: "#1a1917", color: "#ffffff" },
  "Rescheduled / Issue":   { bg: "#fee2e2", color: "#7f1d1d" },
};

const PIPELINE_STEPS = [
  { key: "scheduled",   label: "Scheduled" },
  { key: "install",     label: "Install" },
  { key: "inspection",  label: "Inspection" },
  { key: "passed",      label: "Passed" },
  { key: "closed",      label: "Closed" },
];

function stepDone(key, job) {
  if (key === "scheduled")  return true;
  if (key === "install")    return ["Install Complete","Inspection Scheduled","Inspection Passed","Fully Paid / Closed"].includes(job.status);
  if (key === "inspection") return ["Inspection Scheduled","Inspection Passed","Fully Paid / Closed"].includes(job.status);
  if (key === "passed")     return ["Inspection Passed","Fully Paid / Closed"].includes(job.status);
  if (key === "closed")     return job.status === "Fully Paid / Closed";
  return false;
}

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

function NoteEditor({ job, applyUpdate, editing, handleChange }) {
  const [localNotes, setLocalNotes] = useState(job.notes || "");
  const [noteSaved, setNoteSaved]   = useState(false);
  useEffect(() => { setLocalNotes(job.notes || ""); }, [job.notes]);
  function save() {
    applyUpdate({ notes: localNotes });
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  }
  if (editing) {
    return <textarea name="notes" value={job.notes || ""} onChange={handleChange} rows={4} style={{ width: "100%", resize: "vertical" }} />;
  }
  return (
    <div>
      <textarea value={localNotes} onChange={e => setLocalNotes(e.target.value)} onBlur={save} rows={4} placeholder="Add internal notes..." style={{ width: "100%", resize: "vertical" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        <button onClick={save} style={{ padding: "5px 14px", borderRadius: "var(--radius-md)", border: "none", background: "var(--text-primary)", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>Save notes</button>
        {noteSaved && <span style={{ fontSize: 12, color: "var(--green)", display: "flex", alignItems: "center", gap: 4 }}><Check size={12} /> Saved</span>}
      </div>
    </div>
  );
}

export default function JobDetailPage() {
  const { id }       = useParams();
  const [job, setJob]       = useState(null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved]     = useState(false);
  const [payConfirm, setPayConfirm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tl, setTl]           = useState(null);
  const [tlSaved, setTlSaved] = useState(false);
  const savedSnapshot         = useRef(null);

  useEffect(() => {
    fetch("/api/jobs")
      .then(r => r.json())
      .then(all => {
        const found = all.find(j => j.id === id);
        if (found) {
          savedSnapshot.current = { ...found };
          setJob({ ...found });
          const crewStr = Array.isArray(found.crew) ? found.crew.join(", ") : (found.crew || "");
          setTl({
            install1Date:   found.installDate   || "",
            install1Crew:   crewStr,
            install1Status: ["Install Complete","Inspection Scheduled","Inspection Passed","Fully Paid / Closed"].includes(found.status) ? "Complete" : "Scheduled",
            showInstall2:   !!found.installDate2,
            install2Date:   found.installDate2  || "",
            install2Crew:   crewStr,
            install2Status: "Scheduled",
            inspDate:       found.inspectionDate || "",
            inspCrew:       crewStr,
            inspStatus:     ["Inspection Passed","Fully Paid / Closed"].includes(found.status) ? "Passed" : (found.inspectionDate ? "Scheduled" : "Scheduled"),
            serviceDate:    found.serviceDate   || "",
            serviceCrew:    "",
            serviceStatus:  "Scheduled",
          });
        } else {
          setJob(null);
        }
      })
      .catch(() => setJob(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <AppShell><div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-secondary)" }}>Loading...</div></AppShell>;
  if (!job) return (
    <AppShell>
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ color: "var(--text-secondary)", marginBottom: 12 }}>Job not found.</p>
        <Link href="/jobs" style={{ color: "var(--text-primary)", fontSize: 13 }}>← Back to jobs</Link>
      </div>
    </AppShell>
  );

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setJob(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  function handleSave() {
    fetch("/api/jobs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: job.id, updates: job }) }).catch(() => {});
    savedSnapshot.current = { ...job };
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function handleCancel() { setJob({ ...savedSnapshot.current }); setEditing(false); }

  function applyUpdate(updates) {
    const stamped = { ...updates, lastUpdated: new Date().toISOString() };
    setJob(prev => {
      const next = { ...prev, ...stamped };
      fetch("/api/jobs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: next.id, updates: stamped }) }).catch(() => {});
      if (savedSnapshot.current) Object.assign(savedSnapshot.current, stamped);
      return next;
    });
  }

  function saveTimeline() {
    const toArr = s => s ? s.split(",").map(x => x.trim()).filter(Boolean) : [];
    const updates = {
      installDate:    tl.install1Date || "",
      installDate2:   tl.install2Date || "",
      inspectionDate: tl.inspDate     || "",
      serviceDate:    tl.serviceDate  || "",
    };
    if (tl.install1Crew.trim()) updates.crew = toArr(tl.install1Crew);

    // Derive job status from timeline
    const cur = job.status;
    if (tl.inspStatus === "Passed" && tl.inspDate) {
      updates.status = "Inspection Passed"; updates.m2Due = true;
    } else if (tl.inspStatus === "Failed") {
      updates.status = "Rescheduled / Issue";
    } else if (tl.inspDate && tl.inspStatus === "Scheduled" && !["Inspection Passed","Fully Paid / Closed"].includes(cur)) {
      updates.status = "Inspection Scheduled";
    } else if (tl.install1Status === "Complete" && tl.install1Date && !["Inspection Scheduled","Inspection Passed","Fully Paid / Closed"].includes(cur)) {
      updates.status = "Install Complete"; updates.m1Due = true;
    }

    applyUpdate(updates);
    setTlSaved(true);
    setTimeout(() => setTlSaved(false), 3000);
  }

  function toggleM1() {
    if (!job.m1Received) {
      setPayConfirm({ type: "m1" });
    } else {
      // Unmarking M1: revert status if job was closed
      const updates = { m1Received: false };
      if (job.status === "Fully Paid / Closed") updates.status = "Inspection Passed";
      applyUpdate(updates);
    }
  }
  function toggleM2() {
    if (!job.m2Received) {
      setPayConfirm({ type: "m2" });
    } else {
      // Unmarking M2: revert status if job was closed
      const updates = { m2Received: false };
      if (job.status === "Fully Paid / Closed") updates.status = "Inspection Passed";
      applyUpdate(updates);
    }
  }

  function confirmPayment() {
    const { type } = payConfirm;
    const isM1 = type === "m1";
    const updates = isM1
      ? { m1Received: true, m1Due: true }
      : { m2Received: true, m2Due: true };
    const willClose = isM1 ? job.m2Received : job.m1Received;
    if (willClose) {
      updates.status = "Fully Paid / Closed";
      updates.active = false;
    }
    applyUpdate(updates);
    setPayConfirm(null);
  }

  const sc        = STATUS_COLORS[job.status] || { bg: "#f1f5f9", color: "#334155" };
  const isIssue   = job.status === "Rescheduled / Issue";
  // M1/M2 are the source of truth; contractAmount derived from their sum
  const m1Amount  = job.m1Amount || 0;
  const m2Amount  = job.m2Amount || 0;
  const total     = (m1Amount + m2Amount) || job.contractAmount || job.installCost || 0;
  const m1IsDue   = job.m1Due || ["Install Complete","Inspection Scheduled","Inspection Passed","Fully Paid / Closed"].includes(job.status);
  const m2IsDue   = job.m2Due || job.m1Received || ["Inspection Scheduled","Inspection Passed","Fully Paid / Closed"].includes(job.status) || !!job.inspectionDate;
  const willClose = payConfirm && ((payConfirm.type === "m2" && job.m1Received) || (payConfirm.type === "m1" && job.m2Received));
  const fmt$      = v => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(v || 0);

  function TlRow({ label, green, dateKey, crewKey, statusKey, statusOpts, onAdd, onRemove }) {
    return (
      <div style={{
        display: "grid", gridTemplateColumns: "130px 1fr 1fr 110px auto", gap: 8, alignItems: "center",
        padding: "10px 12px", borderRadius: "var(--radius-md)", marginBottom: 8,
        background: green ? "#f0fdf4" : "var(--surface-2)",
        border: `1px solid ${green ? "#bbf7d0" : "var(--border)"}`,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: green ? "#15803d" : "var(--text-primary)" }}>{label}</div>
        <input type="date" value={tl[dateKey]} onChange={e => setTl(p => ({ ...p, [dateKey]: e.target.value }))} style={{ fontSize: 12 }} />
        <input type="text" placeholder="Crew (comma-sep)" value={tl[crewKey]} onChange={e => setTl(p => ({ ...p, [crewKey]: e.target.value }))} style={{ fontSize: 12 }} />
        <select value={tl[statusKey]} onChange={e => setTl(p => ({ ...p, [statusKey]: e.target.value }))} style={{ fontSize: 12 }}>
          {statusOpts.map(o => <option key={o}>{o}</option>)}
        </select>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: green ? "#16a34a" : "var(--text-tertiary)", fontStyle: "italic", whiteSpace: "nowrap" }}>auto-adds to schedule</span>
          {onAdd && <button onClick={onAdd} title="Add Day 2" style={{ padding: "2px 6px", borderRadius: 4, border: "0.5px solid var(--border-strong)", background: "var(--surface)", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 2, fontFamily: "var(--font-body)" }}><Plus size={10} /></button>}
          {onRemove && <button onClick={onRemove} title="Remove" style={{ padding: "2px 6px", borderRadius: 4, border: "0.5px solid #fca5a5", background: "#fff5f5", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", color: "#dc2626", fontFamily: "var(--font-body)" }}><Minus size={10} /></button>}
        </div>
      </div>
    );
  }

  function PayCard({ label, amount, isDue, received, onToggle }) {
    return (
      <div style={{
        borderRadius: "var(--radius-md)", padding: "14px 16px",
        background: isDue ? (received ? "#d8f3dc" : "#fef9c3") : "var(--surface-2)",
        border: `1px solid ${isDue ? (received ? "#bbf7d0" : "#fde68a") : "var(--border)"}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 2 }}>{fmt$(amount)}</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: received ? "#16a34a" : isDue ? "#f59e0b" : "#e2e8f0", color: received || isDue ? "white" : "var(--text-secondary)" }}>
            {received ? "Paid" : isDue ? "Due" : "Pending"}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: isDue ? 10 : 0 }}>
          {isDue ? (received ? "Payment received" : (label === "M1" ? "Triggered by Install Complete" : "Triggered by Inspection Passed")) : (label === "M1" ? "Due when install is marked complete" : "Due when inspection passes")}
        </div>
        {isDue && (
          <button onClick={onToggle} style={{ width: "100%", padding: "6px", borderRadius: "var(--radius-sm)", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", background: received ? "#15803d" : "var(--text-primary)", color: "white" }}>
            {received ? "✓ Received" : "Mark received"}
          </button>
        )}
      </div>
    );
  }

  return (
    <AppShell>
      {/* Payment confirmation modal */}
      {payConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" style={{ width: 380, padding: 28, borderRadius: "var(--radius-lg)" }}>
            <h3 style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Confirm {payConfirm.type === "m1" ? "M1 (80%)" : "M2 (20%)"} received?</h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: willClose ? 10 : 20 }}>
              Mark the {payConfirm.type === "m1" ? "80%" : "20%"} payment of {payConfirm.type === "m1" ? fmt$(m1Amount) : fmt$(m2Amount)} as collected for <strong>{job.customer}</strong>.
            </p>
            {willClose && (
              <div style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: "var(--radius-md)", padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#92400e" }}>
                ⚠️ Both M1 and M2 will be received — this job will automatically be marked <strong>Fully Paid / Closed</strong> and moved to <strong>Inactive</strong>.
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setPayConfirm(null)} style={{ padding: "8px 18px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "var(--surface)", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-body)" }}>Cancel</button>
              <button onClick={confirmPayment} style={{ padding: "8px 18px", borderRadius: "var(--radius-md)", border: "none", background: "var(--text-primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>Yes, confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <Link href="/jobs" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", marginBottom: 10 }}>
          <ArrowLeft size={13} /> Back to jobs
        </Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 5 }}>
              {isIssue && <AlertTriangle size={16} style={{ color: "#dc2626" }} />}
              <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>{job.customer}</h1>
              <span className="mono badge badge-slate">{job.id}</span>
              <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, fontWeight: 500, background: sc.bg, color: sc.color }}>{job.status}</span>
              {job.battery && <span className="badge badge-slate">Battery</span>}
              {job.hoa    && <span className="badge badge-slate">HOA</span>}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <MapPin size={12} />
              {[job.street, job.city, job.state, job.zip].filter(Boolean).join(", ")}
              {job.crew?.length > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Users size={12} /> {Array.isArray(job.crew) ? job.crew.join(", ") : job.crew}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {saved && <span style={{ fontSize: 12, color: "var(--green)" }}>✓ Saved</span>}
            {!isIssue && job.status !== "Fully Paid / Closed" && (
              <button className="btn btn-outline" onClick={() => applyUpdate({ status: "Rescheduled / Issue" })} style={{ fontSize: 12, color: "#dc2626", borderColor: "#fca5a5" }}>
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
      </div>

      {/* Issue banner */}
      {isIssue && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "var(--radius-md)", padding: "10px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={14} style={{ color: "#dc2626" }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: "#7f1d1d" }}>Job flagged — needs attention</span>
            {job.nextAction && <span style={{ fontSize: 12, color: "#991b1b", marginLeft: 10 }}>→ {job.nextAction}</span>}
          </div>
          <button onClick={() => applyUpdate({ status: job.installDate ? "Install Complete" : "Scheduled" })} style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: "#1a1917", color: "white", fontSize: 11, cursor: "pointer", fontFamily: "var(--font-body)" }}>
            Resolve &amp; resume
          </button>
        </div>
      )}

      {/* ── Section 1: Pipeline progress ────────────────────────────────── */}
      <div className="card" style={{ padding: "18px 24px", marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 18 }}>Pipeline progress</div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", position: "relative" }}>
          {/* Connector line */}
          <div style={{ position: "absolute", top: 15, left: "calc(10% + 16px)", right: "calc(10% + 16px)", height: 2, background: "var(--border)", zIndex: 0 }} />
          {PIPELINE_STEPS.map((step, i) => {
            const done    = stepDone(step.key, job);
            const current = !done && i > 0 && stepDone(PIPELINE_STEPS[i - 1].key, job);
            return (
              <div key={step.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, zIndex: 1, flex: 1 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: done ? "#16a34a" : current ? "var(--text-primary)" : "var(--surface)",
                  border: done || current ? "none" : "2px solid var(--border-strong)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: current ? "0 0 0 3px #e2e8f0" : "none",
                }}>
                  {done    && <Check size={14} color="white" />}
                  {current && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "white" }} />}
                </div>
                <span style={{ fontSize: 11, fontWeight: done || current ? 600 : 400, color: done ? "#16a34a" : current ? "var(--text-primary)" : "var(--text-tertiary)", textAlign: "center" }}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 2: Job timeline ──────────────────────────────────────── */}
      <div className="card" style={{ padding: "18px 20px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Calendar size={14} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontWeight: 600, fontSize: 13 }}>Job timeline</span>
          </div>
        </div>

        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: "130px 1fr 1fr 110px auto", gap: 8, padding: "0 12px", marginBottom: 6 }}>
          {["Event","Date","Crew","Status",""].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em" }}>{h}</div>
          ))}
        </div>

        {tl && (
          <>
            <TlRow label="Install — Day 1" green dateKey="install1Date" crewKey="install1Crew" statusKey="install1Status" statusOpts={INSTALL_STATUSES} onAdd={!tl.showInstall2 ? () => setTl(p => ({ ...p, showInstall2: true })) : null} />
            {tl.showInstall2 && (
              <TlRow label="Install — Day 2" green dateKey="install2Date" crewKey="install2Crew" statusKey="install2Status" statusOpts={INSTALL_STATUSES} onRemove={() => setTl(p => ({ ...p, showInstall2: false, install2Date: "", install2Crew: "", install2Status: "Scheduled" }))} />
            )}
            <TlRow label="Inspection" green={false} dateKey="inspDate" crewKey="inspCrew" statusKey="inspStatus" statusOpts={INSPECTION_STATUSES} />
            <TlRow label="Service visit" green={false} dateKey="serviceDate" crewKey="serviceCrew" statusKey="serviceStatus" statusOpts={INSTALL_STATUSES} />

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
              <button onClick={saveTimeline} style={{ padding: "7px 18px", borderRadius: "var(--radius-md)", border: "none", background: "var(--text-primary)", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>
                Save timeline
              </button>
              {tlSaved && <span style={{ fontSize: 12, color: "var(--green)", display: "flex", alignItems: "center", gap: 4 }}><Check size={12} /> Timeline saved — schedule updated</span>}
            </div>
          </>
        )}
      </div>

      {/* ── Section 3: Finance ──────────────────────────────────────────── */}
      <div className="card" style={{ padding: "18px 20px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <DollarSign size={14} style={{ color: "var(--text-secondary)" }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>Finance</span>
        </div>

        {/* Metric cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
          <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Total revenue</div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{formatCurrency(total)}</div>
          </div>
          <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Financer</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{job.financer || "—"}</div>
          </div>
          <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Invoice #</div>
            <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-mono)" }}>{job.invoiceNumber || "—"}</div>
          </div>
        </div>

        {/* M1 / M2 */}
        {/* M1 / M2 amounts — editable when in edit mode */}
        {editing && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
            <EditField label="M1 Amount ($)" name="m1Amount" value={job.m1Amount} onChange={handleChange} type="number" />
            <EditField label="M2 Amount ($)" name="m2Amount" value={job.m2Amount} onChange={handleChange} type="number" />
            <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Contract total</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{fmt$((parseFloat(job.m1Amount) || 0) + (parseFloat(job.m2Amount) || 0))}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>auto-calculated</div>
            </div>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <PayCard label="M1" amount={m1Amount} isDue={m1IsDue} received={job.m1Received} onToggle={toggleM1} />
          <PayCard label="M2" amount={m2Amount} isDue={m2IsDue} received={job.m2Received} onToggle={toggleM2} />
        </div>
      </div>

      {/* ── Section 4: Homeowner + System ───────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {/* Homeowner */}
        <div className="card" style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
            <User size={14} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontWeight: 600, fontSize: 13 }}>Homeowner</span>
          </div>
          {editing ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
              <div style={{ gridColumn: "span 2" }}><EditField label="Name" name="customer" value={job.customer} onChange={handleChange} /></div>
              <EditField label="Phone" name="phone" value={job.phone} onChange={handleChange} type="tel" />
              <div style={{ gridColumn: "span 2" }}><EditField label="Email" name="email" value={job.email} onChange={handleChange} type="email" /></div>
              <div style={{ gridColumn: "span 2" }}><EditField label="Street" name="street" value={job.street} onChange={handleChange} /></div>
              <EditField label="City" name="city" value={job.city} onChange={handleChange} />
              <EditField label="State" name="state" value={job.state} onChange={handleChange} />
              <EditField label="Zip" name="zip" value={job.zip} onChange={handleChange} />
              <EditField label="HOA" name="hoa" value={job.hoa} onChange={handleChange} type="checkbox" />
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Field label="Phone" value={job.phone ? <a href={`tel:${job.phone}`} style={{ color: "inherit", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}><Phone size={11} />{job.phone}</a> : null} />
              <Field label="Email" value={job.email ? <a href={`mailto:${job.email}`} style={{ color: "inherit", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}><Mail size={11} />{job.email}</a> : null} />
              <Field label="Address" value={[job.street, job.city, job.state, job.zip].filter(Boolean).join(", ")} />
              <Field label="HOA" value={job.hoa ? "Yes" : "No"} />
            </div>
          )}
        </div>

        {/* System */}
        <div className="card" style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
            <Zap size={14} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontWeight: 600, fontSize: 13 }}>System</span>
          </div>
          {editing ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
              <EditField label="System size (kW)" name="systemSize" value={job.systemSize} onChange={handleChange} />
              <EditField label="Panel count" name="panelCount" value={job.panelCount} onChange={handleChange} type="number" />
              <EditField label="Watt / panel" name="watt" value={job.watt} onChange={handleChange} type="number" />
              <EditField label="Arrays" name="arrayCount" value={job.arrayCount} onChange={handleChange} type="number" />
              <EditField label="Pitch" name="pitch" value={job.pitch} onChange={handleChange} />
              <EditField label="Inverter" name="inverter" value={job.inverter} onChange={handleChange} options={INVERTERS} />
              <EditField label="Roof type" name="roofType" value={job.roofType} onChange={handleChange} options={ROOF_TYPES} />
              <EditField label="Battery" name="battery" value={job.battery} onChange={handleChange} type="checkbox" />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="System size" value={job.systemSize ? `${job.systemSize} kW` : null} />
              <Field label="Panels" value={job.panelCount || null} />
              <Field label="Watt / panel" value={job.watt ? `${job.watt}W` : null} />
              <Field label="Arrays" value={job.arrayCount || null} />
              <Field label="Pitch" value={job.pitch || null} />
              <Field label="Inverter" value={job.inverter || null} />
              <Field label="Roof type" value={job.roofType || null} />
              <Field label="Battery" value={job.battery ? "Yes" : "No"} />
            </div>
          )}
        </div>
      </div>

      {/* Also show project/ops fields in edit mode */}
      {editing && (
        <div className="card" style={{ padding: "16px 20px", marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>Project details</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px 20px" }}>
            <EditField label="Status" name="status" value={job.status} onChange={handleChange} options={STATUSES} />
            <EditField label="Rep" name="rep" value={job.rep} onChange={handleChange} options={REPS} />
            <EditField label="Financer" name="financer" value={job.financer} onChange={handleChange} options={FINANCERS} />
            <EditField label="Contractor" name="contractor" value={job.contractor} onChange={handleChange} options={CONTRACTORS} />
            <EditField label="Partner" name="partner" value={job.partner} onChange={handleChange} />
            <EditField label="Utility company" name="utilityCompany" value={job.utilityCompany} onChange={handleChange} />
            <EditField label="Permit status" name="permitStatus" value={job.permitStatus} onChange={handleChange} options={PERMIT_STATUSES} />
            <EditField label="Interconnection" name="interconnectionStatus" value={job.interconnectionStatus} onChange={handleChange} options={INTERCONNECTION_STATUSES} />
            <EditField label="Invoice #" name="invoiceNumber" value={job.invoiceNumber} onChange={handleChange} />
            <div style={{ gridColumn: "span 3" }}><EditField label="Next action" name="nextAction" value={job.nextAction} onChange={handleChange} /></div>
          </div>
        </div>
      )}

      {/* ── Section 5: Notes ────────────────────────────────────────────── */}
      <div className="card" style={{ padding: "16px 20px" }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Notes</div>
        <NoteEditor job={job} applyUpdate={applyUpdate} editing={editing} handleChange={handleChange} />
      </div>

      {/* Inline helper: TlRow needs access to tl/setTl */}
    </AppShell>
  );

  function TlRow({ label, green, dateKey, crewKey, statusKey, statusOpts, onAdd, onRemove }) {
    return (
      <div style={{
        display: "grid", gridTemplateColumns: "130px 1fr 1fr 110px auto", gap: 8, alignItems: "center",
        padding: "10px 12px", borderRadius: "var(--radius-md)", marginBottom: 8,
        background: green ? "#f0fdf4" : "var(--surface-2)",
        border: `1px solid ${green ? "#bbf7d0" : "var(--border)"}`,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: green ? "#15803d" : "var(--text-primary)" }}>{label}</div>
        <input type="date" value={tl[dateKey]} onChange={e => setTl(p => ({ ...p, [dateKey]: e.target.value }))} style={{ fontSize: 12 }} />
        <input type="text" placeholder="Crew (comma-sep)" value={tl[crewKey]} onChange={e => setTl(p => ({ ...p, [crewKey]: e.target.value }))} style={{ fontSize: 12 }} />
        <select value={tl[statusKey]} onChange={e => setTl(p => ({ ...p, [statusKey]: e.target.value }))} style={{ fontSize: 12 }}>
          {statusOpts.map(o => <option key={o}>{o}</option>)}
        </select>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: green ? "#16a34a" : "var(--text-tertiary)", fontStyle: "italic", whiteSpace: "nowrap" }}>auto-adds to schedule</span>
          {onAdd    && <button onClick={onAdd}    title="Add Day 2" style={{ padding: "2px 6px", borderRadius: 4, border: "0.5px solid var(--border-strong)", background: "var(--surface)", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", fontFamily: "var(--font-body)" }}><Plus size={10} /></button>}
          {onRemove && <button onClick={onRemove} title="Remove"    style={{ padding: "2px 6px", borderRadius: 4, border: "0.5px solid #fca5a5", background: "#fff5f5", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", color: "#dc2626", fontFamily: "var(--font-body)" }}><Minus size={10} /></button>}
        </div>
      </div>
    );
  }

}
