"use client";
import { SignIn } from "@clerk/nextjs";

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
          <img src="/logo.jpg" alt="Solarize Home Energy" style={{ height: 48, borderRadius: 8 }} />
          <div style={{ fontWeight: 700, fontSize: 18, marginTop: 10 }}>Solarize Home Energy</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Operations Dashboard</div>
        </div>
        <SignIn routing="hash" />
      </div>
    </div>
  );
}
