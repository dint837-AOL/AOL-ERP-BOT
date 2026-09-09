'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { LayoutDashboard, Users, Wallet, FileText, Phone, Home, MessageCircle, Zap, Key, Shield, LogIn, LogOut, CheckCircle, Clock } from 'lucide-react';
import Topbar from './components/Topbar';
import { useAuth } from './context/AuthContext';
import Cookies from 'js-cookie';

const ADMIN_MODULES = [
  { href: '/accounts',    icon: Wallet,          title: 'Accounts',        desc: 'Track expenses and billing',               color: '#eab308' },
  { href: '/credentials', icon: Key,             title: 'Credentials',     desc: 'Securely store and share access keys',     color: '#a855f7' },
  { href: '/dashboard',   icon: LayoutDashboard, title: 'Daily Tasks',     desc: 'Manage daily status and assignments',      color: '#4f7eff' },
  { href: '/hr',          icon: Users,           title: 'HR & Attendance',  desc: 'Mark attendance and leave requests',       color: '#22c55e' },
  { href: '/meetings',    icon: Phone,           title: 'Meetings',         desc: 'Schedule and track client calls',          color: '#f97316' },
  { href: '/tenders',     icon: FileText,        title: 'Tenders',          desc: 'Manage tender documents and status',       color: '#0ea5e9' },
  { href: '/admin',       icon: Shield,          title: 'Admin Panel',      desc: 'System settings and member management',   color: '#ef4444' },
  { href: '/chat.html',   icon: MessageCircle,   title: 'ERP Chat',         desc: 'Talk to the automated ERP Bot',           color: '#14b8a6' },
];

const EMPLOYEE_MODULES = [
  { href: '/dashboard',   icon: LayoutDashboard, title: 'Daily Tasks',     desc: 'View your assigned tasks',                 color: '#4f7eff' },
  { href: '/hr',          icon: Users,           title: 'HR & Attendance',  desc: 'Mark attendance and leave requests',       color: '#22c55e' },
  { href: '/chat.html',   icon: MessageCircle,   title: 'ERP Chat',         desc: 'Talk to the automated ERP Bot',           color: '#14b8a6' },
];

function nowDhaka(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Dhaka'
  });
}

function parseTimestamp(ts: string): Date {
  if (!ts) return new Date();
  const s = String(ts).trim();
  if (s.endsWith('Z') || s.includes('+') || (s.includes('-') && s.lastIndexOf('-') > 10)) {
    return new Date(s);
  }
  if (s.includes('T')) return new Date(s + 'Z');
  return new Date(s.replace(' ', 'T') + 'Z');
}

export default function HomePage() {
  const { user, token: ctxToken } = useAuth();
  const modules = user?.role === 'Admin' ? ADMIN_MODULES : EMPLOYEE_MODULES;

  const getAuthToken = useCallback(() => {
    return ctxToken || Cookies.get('token') || (typeof window !== 'undefined' ? (localStorage.getItem('erp_token') || localStorage.getItem('token')) : '') || '';
  }, [ctxToken]);

  const [attStatus, setAttStatus] = useState<{ checkedIn: boolean; checkedOut: boolean; inTime?: string | undefined; outTime?: string | undefined }>({
    checkedIn: false,
    checkedOut: false
  });

  const [attLoading, setAttLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const loadAttendance = useCallback(async () => {
    if (!user?.id) return;
    try {
      const token = getAuthToken();
      const res = await fetch('/api/attendance', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        const myAtt = data.filter((a: any) => String(a.member_id) === String(user.id));
        const inRec = myAtt.find((a: any) => a.action_type === 'IN');
        const outRec = myAtt.find((a: any) => a.action_type === 'OUT');
        
        const inTimeStr = inRec ? parseTimestamp(inRec.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Dhaka' }) : undefined;
        const outTimeStr = outRec ? parseTimestamp(outRec.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Dhaka' }) : undefined;

        setAttStatus({
          checkedIn: !!inRec,
          checkedOut: !!outRec,
          inTime: inTimeStr,
          outTime: outTimeStr
        });
      }
    } catch (e) {
      console.error(e);
    }
  }, [user?.id, getAuthToken]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const markAttendance = async (type: 'IN' | 'OUT') => {
    if (!user?.id) {
      showToast('Not logged in.');
      return;
    }
    setAttLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ member_id: user.id, action_type: type })
      });
      if (res.ok) {
        showToast(`✅ ${type === 'IN' ? 'Checked In' : 'Checked Out'} at ${nowDhaka()}`);
        await loadAttendance();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('❌ ' + (err.error || 'Failed to record attendance'));
      }
    } catch (e) {
      showToast('Failed to reach server.');
    } finally {
      setAttLoading(false);
    }
  };

  const todayStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' });

  return (
    <>
      <Topbar title="Home" />
      <div className="scroll">

        {/* ── Check-In & Check-Out Widget (Before welcoming message) ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'linear-gradient(135deg, rgba(22, 27, 46, 0.95), rgba(15, 20, 36, 0.95))',
          border: '1px solid rgba(79, 126, 255, 0.22)',
          borderRadius: '16px',
          padding: '14px 18px',
          marginBottom: '24px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: attStatus.checkedIn && !attStatus.checkedOut ? 'rgba(34, 197, 94, 0.15)' : 'rgba(79, 126, 255, 0.12)',
              border: `1px solid ${attStatus.checkedIn && !attStatus.checkedOut ? 'rgba(34, 197, 94, 0.3)' : 'rgba(79, 126, 255, 0.25)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: attStatus.checkedIn && !attStatus.checkedOut ? 'var(--green)' : 'var(--primary)'
            }}>
              <Clock size={20} />
            </div>
            <div>
              <div style={{ fontSize: '.76rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {todayStr} • Attendance
              </div>
              <div style={{ fontSize: '.92rem', fontWeight: 700, color: 'var(--text)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {attStatus.checkedIn && attStatus.checkedOut ? (
                  <span style={{ color: 'var(--muted)' }}>Checked Out ({attStatus.outTime})</span>
                ) : attStatus.checkedIn ? (
                  <span style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                    Active • In at {attStatus.inTime}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text)' }}>Not checked in today</span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Check-In and Check-Out Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn btn-green btn-sm"
              disabled={attLoading || attStatus.checkedIn}
              onClick={() => markAttendance('IN')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                fontSize: '.85rem',
                fontWeight: 700,
                borderRadius: '9px',
                opacity: attStatus.checkedIn ? 0.45 : 1,
                cursor: attStatus.checkedIn ? 'not-allowed' : 'pointer',
                transition: 'all .2s ease'
              }}
            >
              <LogIn size={15} /> Check In
            </button>

            <button
              className="btn btn-red btn-sm"
              disabled={attLoading || !attStatus.checkedIn || attStatus.checkedOut}
              onClick={() => markAttendance('OUT')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                fontSize: '.85rem',
                fontWeight: 700,
                borderRadius: '9px',
                opacity: (!attStatus.checkedIn || attStatus.checkedOut) ? 0.45 : 1,
                cursor: (!attStatus.checkedIn || attStatus.checkedOut) ? 'not-allowed' : 'pointer',
                transition: 'all .2s ease'
              }}
            >
              <LogOut size={15} /> Check Out
            </button>
          </div>
        </div>

        {/* Welcome Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px', paddingTop: '8px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, borderRadius: '16px',
            background: 'rgba(79,126,255,0.15)', marginBottom: 16
          }}>
            <Zap size={28} color="#4f7eff" />
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text)', marginBottom: 8, margin: '0 0 8px' }}>
            Welcome{user?.name ? `, ${user.name}` : ' to AlliedOne ERP'}
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
            Select a module below to navigate
          </p>
        </div>


        {/* Module Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '14px',
        }}>
          {modules.map(({ href, icon: Icon, title, desc, color }) => (
            <Link key={href} href={href} style={{ textDecoration: 'none' }}>
              <div
                className="card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
                  border: `1px solid ${color}33`,
                  background: `linear-gradient(135deg, ${color}0d 0%, var(--card) 60%)`,
                  marginBottom: 0,
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.transform = 'translateY(-3px)';
                  el.style.boxShadow = `0 8px 24px ${color}30`;
                  el.style.borderColor = `${color}77`;
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.transform = 'translateY(0)';
                  el.style.boxShadow = 'none';
                  el.style.borderColor = `${color}33`;
                }}
              >
                <div style={{
                  background: `${color}22`,
                  color: color,
                  padding: '14px',
                  borderRadius: '10px',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Icon size={22} />
                </div>
                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                    {title}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                    {desc}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
      {toastMsg && <div className="toast on">{toastMsg}</div>}
    </>
  );
}
