'use client';
import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import React from 'react';

export default function Topbar({ title, children }: { title?: string, children?: React.ReactNode }) {
  const pathname = usePathname();
  let defaultTitle = 'Dashboard';
  if (pathname === '/hr') defaultTitle = 'HR & Attendance';
  if (pathname === '/accounts') defaultTitle = 'Accounts & Expenses';
  if (pathname === '/credentials') defaultTitle = 'Credentials & Keys';
  if (pathname === '/meetings') defaultTitle = 'Meetings & Contacts';
  if (pathname === '/tenders') defaultTitle = 'Tender Management';

  const displayTitle = title || defaultTitle;

  const openSide = () => {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('side-overlay')?.classList.add('show');
  };

  const closeSide = () => {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('side-overlay')?.classList.remove('show');
  };

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
        {children}
      </div>
    </>
  );
}
