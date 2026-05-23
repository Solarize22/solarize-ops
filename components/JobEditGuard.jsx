import React from "react";
import { AlertCircle } from "lucide-react";

// Fields that are safe to edit (never overwritten by Permit sync)
const SYNC_SAFE_FIELDS = {
  installCompletedAt: true,
  notes: true,
  ptoSubmittedAt: true,
  ptoGrantedAt: true,
};

// Fields that come from Permit and should not be edited
const SYNCED_FROM_PERMIT = {
  customerName: "Always synced from Permit",
  customerPhone: "Always synced from Permit",
  customerEmail: "Always synced from Permit",
  address: "Always synced from Permit",
  systemSizeKw: "Always synced from Permit",
  panelCount: "Always synced from Permit",
  module: "Always synced from Permit",
  inverter: "Always synced from Permit",
  battery: "Always synced from Permit",
  roofType: "Always synced from Permit",
  contractSignedAt: "Always synced from Permit",
  siteSurveyAt: "Always synced from Permit",
  installScheduledAt: "May be synced from Permit or Google Calendar",
  inspectionScheduledAt: "May be synced from Permit or Google Calendar",
};

export function isFieldEditable(fieldName) {
  // Safe fields are always editable
  return SYNC_SAFE_FIELDS[fieldName] === true;
}

export function isSyncedFromPermit(fieldName) {
  return SYNCED_FROM_PERMIT[fieldName] !== undefined;
}

export function getFieldLockReason(fieldName) {
  if (!isSyncedFromPermit(fieldName)) {
    return null;
  }

  return {
    locked: true,
    reason: "Synced from Permit",
    detail: SYNCED_FROM_PERMIT[fieldName],
  };
}

export function FieldLockIndicator({ fieldName }) {
  const lockReason = getFieldLockReason(fieldName);

  if (!lockReason) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color: "#b36f10",
        background: "#fff0cd",
        padding: "4px 8px",
        borderRadius: 4,
        marginTop: 4,
      }}
    >
      <AlertCircle size={12} />
      <span>{lockReason.detail}</span>
    </div>
  );
}

export default { isFieldEditable, isSyncedFromPermit, getFieldLockReason, FieldLockIndicator };
