'use client';
import Link from 'next/link';
import { LayoutDashboard, Users, Wallet, FileText, Phone, Home, MessageCircle, Zap, Key, Shield } from 'lucide-react';
import Topbar from './components/Topbar';

const modules = [
  { href: '/accounts',    icon: Wallet,          title: 'Accounts',        desc: 'Track expenses and billing',               color: '#eab308' },
  { href: '/credentials', icon: Key,             title: 'Credentials',     desc: 'Securely store and share access keys',     color: '#a855f7' },
  { href: '/dashboard',   icon: LayoutDashboard, title: 'Daily Tasks',     desc: 'Manage daily status and assignments',      color: '#4f7eff' },
  { href: '/hr',          icon: Users,           title: 'HR & Attendance',  desc: 'Mark attendance and leave requests',       color: '#22c55e' },
  { href: '/meetings',    icon: Phone,           title: 'Meetings',         desc: 'Schedule and track client calls',          color: '#f97316' },
  { href: '/tenders',     icon: FileText,        title: 'Tenders',          desc: 'Manage tender documents and status',      color: '#0ea5e9' },
  { href: '/admin',       icon: Shield,          title: 'Admin Panel',      desc: 'System settings and member management',   color: '#ef4444' },
  { href: '/chat.html',   icon: MessageCircle,   title: 'ERP Chat',         desc: 'Talk to the automated ERP Bot',           color: '#14b8a6' },
];

export default function HomePage() {
  return (
    <>
      <Topbar title="Home" />
      <div className="scroll">
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
            Welcome to AlliedOne ERP
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
    </>
  );
}
