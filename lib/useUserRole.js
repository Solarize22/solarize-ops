"use client";

import { useState, useEffect, createContext, useContext } from "react";
import { useAuth } from "@clerk/nextjs";

const UserRoleContext = createContext(null);
const localDevAuthBypass = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== "0";

/**
 * Provides the current user's role to the component tree.
 * Wrap your app shell or layout in this provider.
 */
export function UserRoleProvider({ children }) {
  const [user, setUser] = useState(null);   // { id, name, email, role, status }
  const [loading, setLoading] = useState(true);
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!localDevAuthBypass && !isLoaded) return;

    if (!localDevAuthBypass && !isSignedIn) {
      setUser(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch("/api/users/me")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled) setUser(data || null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  return (
    <UserRoleContext.Provider value={{ user, loading }}>
      {children}
    </UserRoleContext.Provider>
  );
}

/**
 * Hook to access the current user's role info.
 * Returns { user, loading, role, isOwner, isAdmin, isInstaller, isSalesperson }
 */
export function useUserRole() {
  const ctx = useContext(UserRoleContext);
  const { user, loading } = ctx || { user: null, loading: true };
  const role = user?.role || "installer";
  return {
    user, loading, role,
    isOwner:          role === "owner",
    isAdmin:          role === "admin",
    isInstaller:      role === "installer",
    isSalesperson:    role === "salesperson" || role === "sales",
    canSeeFinancials: role === "owner" || role === "admin",
  };
}
