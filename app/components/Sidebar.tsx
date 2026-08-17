/**
 * Sidebar Navigation Component
 * 
 * Renders the side navigation menu for the ERP system.
 * Handles active route highlighting and mobile responsive toggling.
 */
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Wallet, Bell, FileText, Phone, Map, MessageCircle, Zap, Key, Shield, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  
  return (
    <aside className="side" id="sidebar">
      <div className="side-logo">
        <div className="logo-icon">
          <Zap color="#fff" size={16} strokeWidth={2.5} />
        </div>
        <div>
          <div className="logo-text">AlliedOne</div>
          <div className="logo-sub">ERP System</div>
        </div>
      </div>
      
      {user && (
        <div style={{ padding: '0 20px 15px', color: 'var(--muted)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ color: 'var(--text)', fontWeight: 600 }}>{user.name}</div>
            <div style={{ fontSize: '0.7rem' }}>{user.role}</div>
          </div>
        </div>
      )}

      <nav className="nav" style={{ flex: 1, overflowY: 'auto' }}>
        <div className="nav-section">Workspace</div>
        <Link href="/dashboard" className={pathname === '/dashboard' || pathname === '/' ? 'on' : ''}>
          <LayoutDashboard size={18} />
          Daily Tasks
        </Link>
        <Link href="/hr" className={pathname === '/hr' ? 'on' : ''}>
          <Users size={18} />
          HR & Attendance
        </Link>
        <Link href="/accounts" className={pathname === '/accounts' ? 'on' : ''}>
          <Wallet size={18} />
          Accounts
        </Link>
        <Link href="/credentials" className={pathname === '/credentials' ? 'on' : ''}>
          <Key size={18} />
          Credentials
        </Link>
        <Link href="/meetings" className={pathname === '/meetings' ? 'on' : ''}>
          <Phone size={18} />
          Meetings
        </Link>
        
        <Link href="/tenders" className={pathname === '/tenders' ? 'on' : ''}>
          <FileText size={18} />
          Tenders
        </Link>
        
        {user?.role === 'Admin' && (
          <Link href="/admin" className={pathname === '/admin' ? 'on' : ''}>
            <Shield size={18} />
            Admin Section
          </Link>
        )}
        <a href="#"><Map size={18} /> Roadmap <span className="soon">Soon</span></a>
        
        <div className="nav-section">Bot</div>
        <a href="/chat.html"><MessageCircle size={18} /> ERP Chat</a>
      </nav>

      {user && (
        <div style={{ padding: '20px' }}>
          <button 
            onClick={logout}
            style={{ 
              width: '100%', padding: '10px', background: 'rgba(255, 77, 106, 0.1)', color: 'var(--red)', 
              border: '1px solid rgba(255, 77, 106, 0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', 
              justifyContent: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500
            }}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      )}
    </aside>
  );
}
