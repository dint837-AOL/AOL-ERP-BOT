"use client";

import React from "react";
import { useAuth } from "../context/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, token, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

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
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
      return response;
    };
  }

  // While auth state is loading from cookies, show spinner — never redirect
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg)', color: 'var(--muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8, color: 'var(--primary)' }}>AlliedOne</div>
          <div style={{ fontSize: '0.85rem' }}>Loading ERP System...</div>
        </div>
      </div>
    );
  }

  // Login page — render without sidebar
  if (pathname === "/login") {
    return <>{children}</>;
  }

  // Not authenticated — redirect to login
  if (!user) {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    return null;
  }

  // Authenticated — render with sidebar
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        {children}
      </div>
    </div>
  );
}
