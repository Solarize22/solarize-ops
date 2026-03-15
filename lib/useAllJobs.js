"use client";
import { useEffect, useState } from "react";
import { jobs as staticJobs } from "./data";

/** Merges hardcoded jobs with anything saved via API */
export function useAllJobs() {
  const [allJobs, setAllJobs] = useState(staticJobs);

  useEffect(() => {
    fetch("/api/jobs")
      .then(r => r.json())
      .then(imported => {
        if (!Array.isArray(imported) || imported.length === 0) return;
        const ids = new Set(staticJobs.map(j => j.id));
        const merged = [...staticJobs, ...imported.filter(j => !ids.has(j.id))];
        setAllJobs(merged);
      })
      .catch(() => {});
  }, []);

  return allJobs;
}

/** Derive permit records from the full jobs list */
export function jobsToPermits(jobs) {
  return jobs.map(job => ({
    id:               `PRM-${job.id}`,
    jobId:            job.id,
    customer:         job.customer,
    town:             [job.city, job.state].filter(Boolean).join(", ") || "—",
    ahj:              job.city ? `${job.city} Building Dept` : "—",
    status:           job.permitStatus || "Not Submitted",
    submittedDate:    "",
    approvedDate:     "",
    submissionMethod: "",
    nextAction:       job.nextAction || "",
    notes:            job.notes || "",
  }));
}

/** Derive M1 / M2 invoice records from the full jobs list */
export function jobsToInvoices(jobs) {
  const result = [];
  jobs.forEach(job => {
    const total = job.contractAmount || job.installCost || 0;
    const m1Amount = Math.round(total * 0.8);
    const m2Amount = total - m1Amount;

    if (job.m1Due) {
      result.push({
        id:        job.invoiceNumber || `INV-${job.id}-M1`,
        jobId:     job.id,
        customer:  job.customer,
        type:      "M1",
        financer:  job.financer || "",
        amount:    m1Amount,
        status:    job.m1Received ? "Paid" : "Pending",
        dueDate:   job.installDate || "",
        paidDate:  job.m1Received ? (job.installDate || "") : null,
        notes:     "",
      });
    }
    if (job.m2Due) {
      result.push({
        id:        job.invoiceNumber ? `${job.invoiceNumber}-M2` : `INV-${job.id}-M2`,
        jobId:     job.id,
        customer:  job.customer,
        type:      "M2",
        financer:  job.financer || "",
        amount:    m2Amount,
        status:    job.m2Received ? "Paid" : "Pending",
        dueDate:   job.inspectionDate || "",
        paidDate:  job.m2Received ? (job.inspectionDate || "") : null,
        notes:     "",
      });
    }
  });
  return result;
}

/** Derive schedule events (installs + inspections) from the full jobs list */
export function jobsToSchedule(jobs) {
  const result = [];
  jobs.forEach(job => {
    const site = [job.street, job.city, job.state].filter(Boolean).join(", ");
    if (job.installDate) {
      result.push({
        id:        `${job.id}-INST`,
        jobId:     job.id,
        customer:  job.customer,
        type:      "Install",
        date:      job.installDate,
        site,
        crew:      job.crew || [],
        startTime: "7:00 AM",
        duration:  "Full day",
        status:    "Confirmed",
        notes:     job.nextAction || "",
      });
    }
    if (job.inspectionDate) {
      result.push({
        id:        `${job.id}-INSP`,
        jobId:     job.id,
        customer:  job.customer,
        type:      "Inspection",
        date:      job.inspectionDate,
        site,
        crew:      job.crew || [],
        startTime: "TBD",
        duration:  "1–2 hrs",
        status:    "Confirmed",
        notes:     "",
      });
    }
  });
  return result;
}

/** Derive open service tickets from jobs flagged as Rescheduled / Issue */
export function jobsToService(jobs) {
  return jobs
    .filter(job => job.status === "Rescheduled / Issue")
    .map(job => ({
      id:          `SVC-${job.id}`,
      jobId:       job.id,
      customer:    job.customer,
      site:        [job.street, job.city, job.state].filter(Boolean).join(", "),
      issue:       job.nextAction || "Issue flagged — needs review",
      status:      "Open",
      urgency:     "High",
      assignedTo:  job.crew?.[0] || "Unassigned",
      createdDate: job.updatedAt || job.createdAt || "",
      notes:       job.notes || "",
    }));
}
