'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Wallet, Bell, FileText, Phone, Map, MessageCircle, Zap } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  
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
      <nav className="nav">
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
        
        <div className="nav-section">Coming Soon</div>
        <a href="#"><Bell size={18} /> IT Assets <span className="soon">Soon</span></a>
        <a href="#"><FileText size={18} /> Tenders <span className="soon">Soon</span></a>
        <a href="#"><Phone size={18} /> Calls <span className="soon">Soon</span></a>
        <a href="#"><Map size={18} /> Roadmap <span className="soon">Soon</span></a>
        
        <div className="nav-section">Bot</div>
        <a href="/index.html"><MessageCircle size={18} /> ERP Chat</a>
      </nav>
    </aside>
  );
}
