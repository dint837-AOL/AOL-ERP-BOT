/**
 * Topbar Component
 * 
 * Renders the top header for mobile and desktop views.
 * Displays the dynamic page title based on the active route and supports
 * passing child elements (e.g. Action Buttons) into the header area.
 */
'use client';
import { Menu, Bell } from 'lucide-react';
import { usePathname } from 'next/navigation';
import React, { useState, useEffect, useRef } from 'react';

import { useAuth } from '../context/AuthContext';
import Cookies from 'js-cookie';

export default function Topbar({ title, children }: { title?: string, children?: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  let defaultTitle = 'Dashboard';
  if (pathname === '/hr') defaultTitle = 'HR & Attendance';
  if (pathname === '/accounts') defaultTitle = 'Accounts & Expenses';
  if (pathname === '/credentials') defaultTitle = 'Credentials & Keys';
  if (pathname === '/meetings') defaultTitle = 'Meetings & Contacts';
  if (pathname === '/tenders') defaultTitle = 'Tender Management';

  const displayTitle = title || defaultTitle;
  
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getMemberId = () => {
    if (user?.id) return user.id;
    try {
      const stored = Cookies.get('user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.id) return parsed.id;
      }
    } catch(e) {}
    return typeof window !== 'undefined' ? localStorage.getItem('erp_member_id') : null;
  };

  const fetchNotifs = async () => {
    const memberId = getMemberId();
    if (!memberId) return;
    try {
      const res = await fetch(`/api/notifications?member_id=${memberId}`);
      if (res.ok) setNotifications(await res.json());
    } catch(e) {}
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 10000);
    
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      clearInterval(interval);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [user]);

  const markAllRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const memberId = getMemberId();
    if (!memberId) return;
    try {
      await fetch('/api/notifications/read-all', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId })
      });
      fetchNotifs();
    } catch(e) {}
  };

  const openSide = () => {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('side-overlay')?.classList.add('show');
  };

  const closeSide = () => {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('side-overlay')?.classList.remove('show');
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <>
      <div className="overlay-side" id="side-overlay" onClick={closeSide}></div>
      <div className="top">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="hamburger" onClick={openSide}>
            <Menu size={20} />
          </button>
          <span className="top-title">{displayTitle}</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {children}
          
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <button className="btn btn-sec" style={{ position: 'relative', padding: '8px' }} onClick={() => setShowDropdown(!showDropdown)}>
              <Bell size={18} />
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: -3, right: -3, background: 'var(--red)', color: '#fff', fontSize: '10px', borderRadius: '50%', minWidth: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {showDropdown && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '10px', width: '320px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: 1000, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.1)' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Notifications</span>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>Mark all read</button>
                  )}
                </div>
                <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>No notifications yet.</div>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: n.is_read ? 'transparent' : 'rgba(79,126,255,0.05)', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        {!n.is_read && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, marginTop: '6px' }}></div>}
                        <div style={{ flex: 1, paddingLeft: n.is_read ? '20px' : '0' }}>
                          <div style={{ fontSize: '0.85rem', color: n.is_read ? 'var(--muted)' : 'var(--text)', lineHeight: 1.4 }}>{n.message}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '6px' }}>{new Date(n.created_at).toLocaleString()}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
