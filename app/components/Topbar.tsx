'use client';
import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';

export default function Topbar() {
  const pathname = usePathname();
  let title = 'Dashboard';
  if (pathname === '/hr') title = 'HR & Attendance';
  if (pathname === '/accounts') title = 'Accounts & Expenses';

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
          <span className="top-title">{title}</span>
        </div>
        {/* We can inject page-specific top right buttons using React Portals or Context later, 
            or keep it simple and just show the title for now */}
      </div>
    </>
  );
}
