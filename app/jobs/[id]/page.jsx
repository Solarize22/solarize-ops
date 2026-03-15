"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { jobs } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft, Pencil, Save, X, MapPin, Phone, Mail, Zap, Wrench, DollarSign, User, Building, Plus, Check, AlertTriangle } from "lucide-react";

const STATUSES = ["Review","Scheduled","In Progress","Install Complete","Inspection Scheduled","Inspection Passed","Inspection Failed","Service Call","Site Visit"];
const PERMIT_STATUSES = ["Not Submitted","Submitted","In Review","Approved","Utility Redesign Needed"];
const INTERCONNECTION_STATUSES = ["Not submitted","Submitted","Pending redesign","Approved"];
const REPS = ["Tommy","Kyle","Matt"];
const FINANCERS = ["GoodLeap","LightReach","Mosaic","Cash","Sunlight","Dividend","Empower"];
const CONTRACTORS = ["Solarize","Empower","Other"];
const ROOF_TYPES = ["Asphalt shingle","Metal","Tile","Flat/TPO","Cedar shake"];
const INVERTERS = ["Enphase IQ8A","Enphase IQ8M","Enphase IQ8H","SolarEdge HD Wave","SolarEdge Energy Hub"];

const STATUS_COLORS = {
  "Review":               { bg:"#f1f5f9", color:"#334155" },
  "Scheduled":            { bg:"#dbeafe", color:"#1e3a8a" },
  "In Progress":          { bg:"#fef3c7", color:"#78350f" },
  "Install Complete":     { bg:"#d8f3dc", color:"#1b4332" },
  "Inspection Scheduled": { bg:"#dbeafe", color:"#1e3a8a" },
  "Inspection Passed":    { bg:"#d8f3dc", color:"#1b4332" },
  "Inspection Failed":    { bg:"#fee2e2", color:"#7f1d1d" },
  "Service Call":         { bg:"#fee2e2", color:"#7f1d1d" },
  "Site Visit":           { bg:"#fef3c7", color:"#78350f" },
};

const STAGE_MAP = {
  "Review":10,"Scheduled":25,"In Progress":45,"Install Complete":60,
  "Inspection Scheduled":70,"Inspection Passed":90,"Inspection Failed":65,
  "Service Call":60,"Site Visit":15,
};

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize:10, fontWeight:600, color:"var(--text-tertiary)", textTransform:"uppercase", letterSpacing:".05em", marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:13 }}>{value || "—"}</div>
    </div>
  );
}

function EditField({ label, name, value, onChange, type="text", options=null }) {
  return (
    <div>
      <div style={{ fontSize:10, fontWeight:600, color:"var(--text-tertiary)", textTransform:"uppercase", letterSpacing:".05em", marginBottom:4 }}>{label}</div>
      {options ? (
        <select name={name} value={value||""} onChange={onChange} style={{ width:"100%" }}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === "checkbox" ? (
        <div style={{ display:"flex", alignItems:"center", gap:8, paddingTop:4 }}>
          <input type="checkbox" name={name} checked={!!value} onChange={onChange} style={{ width:15, height:15 }} />
          <span style={{ fontSize:12, color:"var(--text-secondary)" }}>Yes</span>
        </div>
      ) : (
        <input type={type} name={name} value={value||""} onChange={onChange} style={{ width:"100%" }} />
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children, columns=4 }) {
  return (
    <div className="card" style={{ padding:"16px 20px", marginBottom:12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, paddingBottom:10, borderBottom:"1px solid var(--border)" }}>
        <Icon size={14} style={{ color:"var(--text-secondary)" }} />
        <span style={{ fontWeight:600, fontSize:13 }}>{title}</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:`repeat(${columns},1fr)`, gap:"14px 20px" }}>
        {children}
      </div>
    </div>
  );
}

// Actions timeline milestone component
function Milestone({ icon, title, subtitle, date, done, failed, picker, onAdd, children }) {
  return (
    <div style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"12px 0", borderBottom:"0.5px solid var(--border)" }}>
      <div style={{
        width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2,
        background: done ? "#d8f3dc" : failed ? "#fee2e2" : "var(--surface-2)",
        border: done || failed ? "none" : "0.5px dashed var(--border-strong)",
      }}>
        {done ? <Check size={13} style={{ color:"#1b4332" }} /> : failed ? <X size={13} style={{ color:"#7f1d1d" }} /> : null}
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:500, fontSize:13 }}>{title}</div>
        <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:2 }}>{subtitle}</div>
        {children}
      </div>
      <div style={{ flexShrink:0 }}>
        {date ? (
          <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background: failed ? "#fee2e2" : "#d8f3dc", color: failed ? "#7f1d1d" : "#1b4332", fontWeight:500 }}>
            {date}
          </span>
        ) : (
          <button
            onClick={onAdd}
            style={{ padding:"5px 12px", borderRadius:20, border:"0.5px solid var(--border-strong)", background:"var(--surface)", color:"var(--text-secondary)", fontSize:11, cursor:"pointer", display:"flex", alignItems:"center", gap:4, fontFamily:"var(--font-body)" }}
          >
            <Plus size={11} /> {picker}
          </button>
        )}
      </div>
    </div>
  );
}

export default function JobDetailPage() {
  const { id } = useParams();

  let allJobs = [...jobs];
  if (typeof window !== "undefined") {
    try {
      const imported = JSON.parse(sessionStorage.getItem("importedJobs") || "[]");
      imported.forEach(j => { if (!allJobs.find(x => x.id === j.id)) allJobs.push(j); });
    } catch(e) {}
  }

  const originalJob = allJobs.find(j => j.id === id);
  const [job, setJob] = useState(originalJob ? { ...originalJob } : null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [openPicker, setOpenPicker] = useState(null);
  const [pickerDate, setPickerDate] = useState("");

  if (!job) {
    return (
      <AppShell>
        <div style={{ textAlign:"center", padding:"60px 20px" }}>
          <p style={{ color:"var(--text-secondary)", marginBottom:12 }}>Job not found.</p>
          <Link href="/jobs" style={{ color:"var(--text-primary)", fontSize:13 }}>← Back to jobs</Link>
        </div>
      </AppShell>
    );
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setJob(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  function handleSave() {
    if (originalJob) Object.assign(originalJob, job);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function handleCancel() {
    setJob({ ...originalJob });
    setEditing(false);
  }

  function confirmMilestone(type) {
    if (!pickerDate && type !== "inspectionPassed" && type !== "inspectionFailed") return;
    const updates = {};
    if (type === "siteSurvey")         { updates.siteSurveyDate = pickerDate; }
    if (type === "install")            { updates.installDate = pickerDate; updates.status = "Scheduled"; }
    if (type === "installComplete")    { updates.installDate = pickerDate || job.installDate; updates.status = "Install Complete"; }
    if (type === "inspectionScheduled"){ updates.inspectionDate = pickerDate; updates.status = "Inspection Scheduled"; }
    if (type === "inspectionPassed")   { updates.status = "Inspection Passed"; }
    if (type === "inspectionFailed")   { updates.status = "Inspection Failed"; }
    if (type === "pto")                { updates.ptoDate = pickerDate; updates.status = "Inspection Passed"; }
    if (type === "serviceCall")        { updates.status = "Service Call"; }
    if (type === "siteVisit")          { updates.status = "Site Visit"; }
    setJob(prev => ({ ...prev, ...updates }));
    if (originalJob) Object.assign(originalJob, updates);
    setOpenPicker(null);
    setPickerDate("");
  }

  const sc = STATUS_COLORS[job.status] || { bg:"#f1f5f9", color:"#334155" };
  const stage = STAGE_MAP[job.status] || 0;

  function DatePicker({ type, label, showPassFail = false }) {
    if (openPicker !== type) return null;
    return (
      <div style={{ marginTop:10, padding:12, background:"var(--surface-2)", borderRadius:"var(--radius-md)" }}>
        <div style={{ fontSize:11, color:"var(--text-secondary)", marginBottom:8 }}>{label}</div>
        {!showPassFail && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom: showPassFail ? 10 : 0 }}>
            <input type="date" value={pickerDate} onChange={e => setPickerDate(e.target.value)} style={{ fontSize:12 }} />
            <button className="btn btn-primary" style={{ fontSize:12, padding:"5px 12px" }} onClick={() => confirmMilestone(type)}>Confirm</button>
            <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => setOpenPicker(null)}>Cancel</button>
          </div>
        )}
        {showPassFail && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
            <input type="date" value={pickerDate} onChange={e => setPickerDate(e.target.value)} style={{ fontSize:12 }} />
            <button className="btn btn-primary" style={{ fontSize:12, padding:"5px 12px" }} onClick={() => confirmMilestone(type)}>Save date</button>
            <button style={{ padding:"5px 12px", borderRadius:8, border:"none", background:"#d8f3dc", color:"#1b4332", fontSize:12, cursor:"pointer", fontFamily:"var(--font-body)" }} onClick={() => confirmMilestone("inspectionPassed")}>✓ Mark passed</button>
            <button style={{ padding:"5px 12px", borderRadius:8, border:"none", background:"#fee2e2", color:"#7f1d1d", fontSize:12, cursor:"pointer", fontFamily:"var(--font-body)" }} onClick={() => confirmMilestone("inspectionFailed")}>✗ Mark failed</button>
            <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => setOpenPicker(null)}>Cancel</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <AppShell>
      {/* Top bar */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <Link href="/jobs" style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:12, color:"var(--text-secondary)", textDecoration:"none", marginBottom:8 }}>
            <ArrowLeft size={13} /> Back to jobs
          </Link>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <h1 style={{ fontSize:22, fontWeight:600, letterSpacing:"-0.02em" }}>{job.customer}</h1>
            <span className="mono badge badge-slate">{job.id}</span>
            <span style={{ fontSize:12, padding:"3px 10px", borderRadius:20, fontWeight:500, background:sc.bg, color:sc.color }}>{job.status}</span>
            {job.contractor && <span className="badge badge-blue">{job.contractor}</span>}
            {job.battery && <span className="badge badge-slate">Battery</span>}
            {job.hoa && <span className="badge badge-slate">HOA</span>}
          </div>
          <div style={{ fontSize:13, color:"var(--text-secondary)", marginTop:4, display:"flex", alignItems:"center", gap:4 }}>
            <MapPin size={12} />{job.street}, {job.city}, {job.state} {job.zip}
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {saved && <span style={{ fontSize:12, color:"var(--green)", display:"flex", alignItems:"center", gap:5 }}>✓ Saved</span>}
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

      {/* Progress */}
      <div className="card" style={{ padding:"14px 20px", marginBottom:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--text-secondary)", marginBottom:6 }}>
          <span style={{ fontWeight:500 }}>Project progress</span>
          <span>{stage}%</span>
        </div>
        <div className="progress-bar" style={{ height:8 }}>
          <div className="progress-fill" style={{ width:`${stage}%` }} />
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, fontSize:11, color:"var(--text-tertiary)" }}>
          {["Review","Scheduled","Install","Inspection","PTO","Done"].map((label, i) => (
            <span key={label} style={{ fontWeight: stage >= (i+1)*16 ? 600:400, color: stage >= (i+1)*16 ? "var(--text-primary)":"var(--text-tertiary)" }}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Actions timeline */}
      <div className="card" style={{ padding:"16px 20px", marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, paddingBottom:10, borderBottom:"1px solid var(--border)" }}>
          <Zap size={14} style={{ color:"var(--text-secondary)" }} />
          <span style={{ fontWeight:600, fontSize:13 }}>Actions & milestones</span>
        </div>

        {/* Site survey */}
        <Milestone
          title="Site survey"
          subtitle="Design review, prints confirmed"
          done={!!job.siteSurveyDate}
          date={job.siteSurveyDate ? formatDate(job.siteSurveyDate) : null}
          picker="Add site survey date"
          onAdd={() => { setOpenPicker("siteSurvey"); setPickerDate(""); }}
        >
          <DatePicker type="siteSurvey" label="When was the site survey done?" />
        </Milestone>

        {/* Install */}
        <Milestone
          title="Install"
          subtitle={job.status === "Install Complete" ? "Complete — M1 triggered" : "Schedule install date"}
          done={job.status === "Install Complete" || ["Inspection Scheduled","Inspection Passed","Inspection Failed"].includes(job.status)}
          date={job.installDate ? formatDate(job.installDate) : null}
          picker="Add install date"
          onAdd={() => { setOpenPicker("installComplete"); setPickerDate(""); }}
        >
          <DatePicker type="installComplete" label="Install date — marks Install Complete and triggers M1" />
        </Milestone>

        {/* Inspection */}
        <Milestone
          title="Inspection"
          subtitle={
            job.status === "Inspection Passed" ? "Passed — M2 triggered" :
            job.status === "Inspection Failed" ? "Failed — needs fix and reschedule" :
            job.status === "Inspection Scheduled" ? "Scheduled with AHJ" :
            "Schedule with AHJ"
          }
          done={job.status === "Inspection Passed"}
          failed={job.status === "Inspection Failed"}
          date={job.inspectionDate ? formatDate(job.inspectionDate) : (job.status === "Inspection Passed" ? "Passed" : job.status === "Inspection Failed" ? "Failed" : null)}
          picker="Schedule inspection"
          onAdd={() => { setOpenPicker("inspectionScheduled"); setPickerDate(""); }}
        >
          <DatePicker type="inspectionScheduled" label="Inspection date with AHJ" showPassFail={true} />
        </Milestone>

        {/* PTO */}
        <Milestone
          title="PTO"
          subtitle={job.ptoDate ? "Permission to operate granted — M2 triggered" : "Awaiting inspection pass"}
          done={!!job.ptoDate}
          date={job.ptoDate ? formatDate(job.ptoDate) : null}
          picker="Add PTO date"
          onAdd={() => { setOpenPicker("pto"); setPickerDate(""); }}
        >
          <DatePicker type="pto" label="PTO date — triggers M2 payment" />
        </Milestone>

        {/* Service call */}
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 0" }}>
          <div style={{ width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, background: job.status === "Service Call" ? "#fee2e2" : "var(--surface-2)", border: job.status === "Service Call" ? "none" : "0.5px dashed var(--border-strong)" }}>
            {job.status === "Service Call" && <AlertTriangle size={12} style={{ color:"#7f1d1d" }} />}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:500, fontSize:13 }}>Service call</div>
            <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:2 }}>Log if something needs troubleshooting</div>
            {openPicker === "serviceCall" && (
              <div style={{ marginTop:10, padding:12, background:"var(--surface-2)", borderRadius:"var(--radius-md)", display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                <button style={{ padding:"5px 12px", borderRadius:8, border:"none", background:"#fee2e2", color:"#7f1d1d", fontSize:12, cursor:"pointer", fontFamily:"var(--font-body)" }} onClick={() => confirmMilestone("serviceCall")}>Log service call</button>
                <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => setOpenPicker(null)}>Cancel</button>
              </div>
            )}
          </div>
          {job.status !== "Service Call" && openPicker !== "serviceCall" && (
            <button onClick={() => setOpenPicker("serviceCall")} style={{ padding:"5px 12px", borderRadius:20, border:"0.5px solid var(--border-strong)", background:"var(--surface)", color:"var(--text-secondary)", fontSize:11, cursor:"pointer", display:"flex", alignItems:"center", gap:4, fontFamily:"var(--font-body)", flexShrink:0 }}>
              <Plus size={11} /> Log service call
            </button>
          )}
          {job.status === "Service Call" && <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"#fee2e2", color:"#7f1d1d", fontWeight:500 }}>Active</span>}
        </div>
      </div>

      {/* Contract & payout */}
      <Section title="Contract & payout" icon={Building} columns={3}>
        {editing ? (
          <>
            <EditField label="Contractor" name="contractor" value={job.contractor} onChange={handleChange} options={CONTRACTORS} />
            <EditField label="Your payout ($)" name="payout" value={job.payout} onChange={handleChange} type="number" />
            <EditField label="Contract amount ($)" name="contractAmount" value={job.contractAmount} onChange={handleChange} type="number" />
          </>
        ) : (
          <>
            <Field label="Contractor" value={job.contractor} />
            <Field label="Your payout" value={formatCurrency(job.payout || 0)} />
            <Field label="Contract amount" value={formatCurrency(job.contractAmount || 0)} />
          </>
        )}
      </Section>

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
            <Field label="Phone" value={job.phone ? <a href={`tel:${job.phone}`} style={{ color:"var(--text-primary)", textDecoration:"none", display:"flex", alignItems:"center", gap:4 }}><Phone size={11}/>{job.phone}</a> : null} />
            <Field label="Email" value={job.email ? <a href={`mailto:${job.email}`} style={{ color:"var(--text-primary)", textDecoration:"none", display:"flex", alignItems:"center", gap:4 }}><Mail size={11}/>{job.email}</a> : null} />
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
            <EditField label="Inverter" name="inverter" value={job.inverter} onChange={handleChange} options={INVERTERS} />
            <EditField label="Roof type" name="roofType" value={job.roofType} onChange={handleChange} options={ROOF_TYPES} />
            <EditField label="Battery" name="battery" value={job.battery} onChange={handleChange} type="checkbox" />
          </>
        ) : (
          <>
            <Field label="System size" value={job.systemSize ? `${job.systemSize} kW` : null} />
            <Field label="Panel count" value={job.panelCount} />
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
            <EditField label="Utility company" name="utilityCompany" value={job.utilityCompany} onChange={handleChange} />
            <EditField label="Permit status" name="permitStatus" value={job.permitStatus} onChange={handleChange} options={PERMIT_STATUSES} />
            <EditField label="Interconnection" name="interconnectionStatus" value={job.interconnectionStatus} onChange={handleChange} options={INTERCONNECTION_STATUSES} />
            <EditField label="Build partner" name="buildPartner" value={job.buildPartner} onChange={handleChange} />
            <div style={{ gridColumn:"span 2" }}>
              <EditField label="Next action" name="nextAction" value={job.nextAction} onChange={handleChange} />
            </div>
          </>
        ) : (
          <>
            <Field label="Rep" value={job.rep} />
            <Field label="Financer" value={job.financer} />
            <Field label="Utility company" value={job.utilityCompany} />
            <Field label="Permit status" value={job.permitStatus} />
            <Field label="Interconnection" value={job.interconnectionStatus} />
            <Field label="Build partner" value={job.buildPartner} />
            <Field label="Next action" value={job.nextAction} />
          </>
        )}
      </Section>

      {/* Notes */}
      <div className="card" style={{ padding:"16px 20px" }}>
        <div style={{ fontWeight:600, fontSize:13, marginBottom:10 }}>Notes</div>
        {editing ? (
          <textarea name="notes" value={job.notes||""} onChange={handleChange} rows={4} style={{ width:"100%", resize:"vertical" }} />
        ) : (
          <p style={{ fontSize:13, color:"var(--text-secondary)", lineHeight:1.7 }}>{job.notes || "No notes yet."}</p>
        )}
      </div>
    </AppShell>
  );
}
