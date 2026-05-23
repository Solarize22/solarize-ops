"use client";
import { SignIn } from "@clerk/nextjs";
import { appConfig } from "@/lib/app-config";

export default function SignInPage() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f9fafb",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ marginBottom: 24 }}>
          <img src="/logo-2026.png" alt={appConfig.companyName} style={{ height: 48 }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{appConfig.companyName}</div>
            {appConfig.environmentLabel ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: "#fff3c4",
                  color: "#92400e",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                }}
              >
                {appConfig.environmentLabel}
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{appConfig.signInSubtitle}</div>
        </div>
        <SignIn routing="hash" />
      </div>
    </div>
  );
}
