"use client";

import React from "react";
import { useAuth } from "../context/AuthContext";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, token, loading } = useAuth();
  const pathname = usePathname();

  // Intercept all fetch requests to automatically add the Authorization header
  if (typeof window !== "undefined" && !(window as any).__fetchIntercepted) {
    (window as any).__fetchIntercepted = true;
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      let [resource, config] = args;
      if (typeof resource === 'string' && resource.startsWith('/api') && !resource.startsWith('/api/auth/login')) {
        config = config || {};
        config.headers = {
          ...config.headers,
          'Authorization': `Bearer ${token || (document.cookie.match(/(?:^|; )token=([^;]*)/)?.[1])}`
        };
      }
      const response = await originalFetch(resource, config);
      if (response.status === 401 || response.status === 403) {
        // Token expired or invalid
        if (typeof window !== "undefined" && window.location.pathname !== "/login") window.location.href = "/login";
      }
      return response;
    };
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg)', color: 'var(--muted)' }}>
        Loading AlliedOne ERP...
      </div>
    );
  }

  if (!user && pathname !== "/login") {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }
  
  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        {children}
      </div>
    </div>
  );
}
