'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutDashboard, Users, Wallet, FileText, Phone, Map, MessageCircle, Zap, Key, Shield, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  
  const closeSide = () => {
    if (typeof document !== 'undefined') {
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('side-overlay')?.classList.remove('show');
    }
  };
  
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

        {/* Home */}
        <Link href="/" className={pathname === '/' ? 'on' : ''} onClick={closeSide}>
          <Home size={18} /> Home
        </Link>

        {/* Alphabetical order */}
        <Link href="/accounts" className={pathname === '/accounts' ? 'on' : ''} onClick={closeSide}>
          <Wallet size={18} /> Accounts
        </Link>

        <Link href="/credentials" className={pathname === '/credentials' ? 'on' : ''} onClick={closeSide}>
          <Key size={18} /> Credentials
        </Link>

        <Link href="/dashboard" className={pathname === '/dashboard' ? 'on' : ''} onClick={closeSide}>
          <LayoutDashboard size={18} /> Daily Tasks
        </Link>

        <Link href="/hr" className={pathname === '/hr' ? 'on' : ''} onClick={closeSide}>
          <Users size={18} /> HR & Attendance
        </Link>

        <Link href="/meetings" className={pathname === '/meetings' ? 'on' : ''} onClick={closeSide}>
          <Phone size={18} /> Meetings
        </Link>

        <Link href="/tenders" className={pathname === '/tenders' ? 'on' : ''} onClick={closeSide}>
          <FileText size={18} /> Tenders
        </Link>

        {user?.role === 'Admin' && (
          <Link href="/admin" className={pathname === '/admin' ? 'on' : ''} onClick={closeSide}>
            <Shield size={18} /> Admin Section
          </Link>
        )}

        <a href="#" onClick={closeSide}><Map size={18} /> Roadmap <span className="soon">Soon</span></a>
        
        <div className="nav-section">Bot</div>
        <a href="/chat.html" onClick={closeSide}><MessageCircle size={18} /> ERP Chat</a>
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
