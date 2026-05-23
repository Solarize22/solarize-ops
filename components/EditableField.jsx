import React, { useState } from "react";
import { Edit2, Check, X } from "lucide-react";
import { isFieldEditable, FieldLockIndicator } from "./JobEditGuard";

export function EditableField({
  label,
  value,
  fieldName,
  onSave,
  type = "text",
  readOnly = false,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || "");
  const [isSaving, setIsSaving] = useState(false);

  const canEdit = !readOnly && isFieldEditable(fieldName);

  async function handleSave() {
    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editValue);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }

  if (isEditing && canEdit) {
    return (
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "#8092a5", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
          {label}
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          {type === "textarea" ? (
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              style={{
                flex: 1,
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 14,
                fontFamily: "var(--font-body)",
                minHeight: 80,
              }}
              disabled={isSaving}
            />
          ) : (
            <input
              type={type}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              style={{
                flex: 1,
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 14,
                fontFamily: "var(--font-body)",
              }}
              disabled={isSaving}
            />
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: "8px 12px",
              background: "var(--green)",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: isSaving ? "not-allowed" : "pointer",
              opacity: isSaving ? 0.6 : 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              setEditValue(value || "");
              setIsEditing(false);
            }}
            disabled={isSaving}
            style={{
              padding: "8px 12px",
              background: "var(--surface-2)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              cursor: isSaving ? "not-allowed" : "pointer",
              opacity: isSaving ? 0.6 : 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "#8092a5", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
        {label}
      </label>
      <div
        style={{
          padding: "8px 12px",
          borderRadius: 6,
          background: canEdit ? "var(--surface-2)" : "#f1f5f9",
          border: "1px solid var(--border)",
          fontSize: 14,
          color: canEdit ? "var(--text-primary)" : "#8092a5",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 36,
        }}
      >
        <span style={{ whiteSpace: "pre-wrap" }}>{value || "—"}</span>
        {canEdit && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: "4px 8px",
              marginLeft: 8,
              display: "flex",
              alignItems: "center",
            }}
            title="Edit this field"
          >
            <Edit2 size={14} />
          </button>
        )}
      </div>
      <FieldLockIndicator fieldName={fieldName} />
    </div>
  );
}

export default EditableField;
