"use client";

import { useState, useEffect, createContext, useContext } from "react";

const UserRoleContext = createContext(null);

/**
 * Provides the current user's role to the component tree.
 * Wrap your app shell or layout in this provider.
 */
export function UserRoleProvider({ children }) {
  const [user, setUser] = useState(null);   // { id, name, email, role, status }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/users/me")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUser(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
  if (!ctx) {
    // Fallback if used outside provider — fetch independently
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
      fetch("/api/users/me")
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setUser(data); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, []);
    const role = user?.role || "installer";
    return {
      user, loading, role,
      isOwner:       role === "owner",
      isAdmin:       role === "admin",
      isInstaller:   role === "installer",
      isSalesperson: role === "salesperson",
      canSeeFinancials: role === "owner",
    };
  }

  const { user, loading } = ctx;
  const role = user?.role || "installer";
  return {
    user, loading, role,
    isOwner:          role === "owner",
    isAdmin:          role === "admin",
    isInstaller:      role === "installer",
    isSalesperson:    role === "salesperson",
    canSeeFinancials: role === "owner",
  };
}
