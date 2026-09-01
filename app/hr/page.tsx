/**
 * HR & Attendance Management Module
 *
 * Role-based layout:
 *  - Employee: sees check-in/out widget (own name pre-filled), their own leave requests, leave submit
 *  - Admin: sees full attendance log, all leave requests with approve/reject, monthly attendance calendar
 *
 * Check-in/out is system-recorded (accurate UTC timestamp converted to local time).
 * Monthly calendar uses 4-colour coding: Green=Present, Red=Absent, Orange=Late (<4h), Blue=Approved Leave.
 * Fridays and Saturdays are shaded as weekends/holidays.
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { LogIn, LogOut, Plus, ChevronLeft, ChevronRight, X, Calendar, Download, BarChart2, Wifi, Laptop, Image as ImageIcon } from 'lucide-react';
import Topbar from '../components/Topbar';
import { useAuth } from '../context/AuthContext';
import html2canvas from 'html2canvas';

// --- Helpers ---

function todayDhaka(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
}

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
  if (ts.endsWith('Z')) return new Date(ts);
  if (ts.includes('T')) return new Date(ts + 'Z');
  return new Date(ts.replace(' ', 'T') + 'Z');
}

function formatTime(ts: string): string {
  try {
    const d = parseTimestamp(ts);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Dhaka'
    });
  } catch {
    return ts || '-';
  }
}

function fmtDateLabel(dateStr: string): string {
  const today = todayDhaka();
  const dt = new Date(dateStr + 'T00:00:00');
  const t = new Date(today + 'T00:00:00');
  const diff = Math.round((dt.getTime() - t.getTime()) / 86400000);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const s = `${dd}-${mm}-${yyyy}`;
  if (diff === 0) return 'Today, ' + s;
  if (diff === 1) return 'Tomorrow, ' + s;
  if (diff === -1) return 'Yesterday, ' + s;
  return s;
}

function shiftDateStr(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toLocaleDateString('en-CA');
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function getWorkingDaysInMonth(year: number, month: number): number {
  const totalDays = daysInMonth(year, month);
  let count = 0;
  for (let i = 1; i <= totalDays; i++) {
    const dow = new Date(year, month, i).getDay();
    if (dow !== 5 && dow !== 6) count++;
  }
  return count;
}

// --- Monthly Calendar Component ---

interface CalDay {
  date: string;
  isWeekend: boolean;
  isPresent: boolean;
  isAbsent: boolean;
  isLeave: boolean;
  checkInTime: string | undefined;
  checkOutTime: string | undefined;
  leaveType: string | undefined;
  leaveStatus: string | undefined;
  isIncomplete: boolean;
  hoursWorked: number;
}

interface MonthCalendarProps {
  year: number;
  month: number;
  calDays: CalDay[];
}

function MonthCalendar({ year, month, calDays }: MonthCalendarProps) {
  const dayMap = new Map<string, CalDay>();
  calDays.forEach(d => dayMap.set(d.date, d));

  const total = daysInMonth(year, month);
  const startDow = firstDayOfWeek(year, month);
  const cells: (CalDay | null | 'empty')[] = [];
  for (let i = 0; i < startDow; i++) cells.push('empty');
  for (let d = 1; d <= total; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push(dayMap.get(dateStr) || null);
  }

  const today = todayDhaka();

  // Calculate summary metrics
  const totalDaysWorked = calDays.filter(d => d.isPresent).length;
  const totalHoursWorked = calDays.reduce((sum, d) => sum + (d.hoursWorked || 0), 0).toFixed(1);
  const totalIncomplete = calDays.filter(d => d.isIncomplete).length;
  const totalLeaves = calDays.filter(d => d.isLeave && d.leaveStatus === 'APPROVED').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      <div className="hr-cal-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(dn => (
          <div key={dn} className={'hr-cal-hdr' + (['Fri', 'Sat'].includes(dn) ? ' weekend' : '')}>{dn}</div>
        ))}
        {cells.map((cell, idx) => {
          const col = idx % 7;
          const isWeekendCol = col === 5 || col === 6;
          if (cell === 'empty' || cell === null) {
            return <div key={idx} className={'hr-cal-cell empty' + (isWeekendCol ? ' weekend' : '')} />;
          }
          const isToday = cell.date === today;
          let cls = 'hr-cal-cell';
          if (cell.isWeekend) cls += ' weekend';
          else if (cell.isPresent) cls += ' present';
          else if (cell.isLeave) cls += ' on-leave';
          else if (cell.isAbsent) cls += ' absent';
          if (isToday) cls += ' cal-today';
          if (cell.isIncomplete) cls += ' late-arrival';

          const dayNum = parseInt(cell.date.split('-')[2] || '0');
          let tip = '';
          if (cell.isPresent) tip = `In: ${cell.checkInTime || '-'} Out: ${cell.checkOutTime || '-'}\nHours: ${cell.hoursWorked.toFixed(1)}`;
          else if (cell.isLeave) tip = `Leave: ${cell.leaveType} (${cell.leaveStatus})`;
          else tip = cell.isWeekend ? 'Weekend' : cell.isAbsent ? 'Absent' : '';

          const isApprovedLeave = cell.isLeave && cell.leaveStatus === 'APPROVED';

          return (
            <div key={cell.date} className={cls} title={tip}>
              <span className="cal-day-num">{dayNum}</span>
              {cell.isPresent && <span className="cal-dot green-dot" />}
              {cell.isIncomplete && <span className="cal-dot" style={{ background: '#FF8C00', boxShadow: '0 0 5px rgba(255, 140, 0, 0.6)' }} />}
              {isApprovedLeave && <span className="cal-dot" style={{ background: '#2979FF', boxShadow: '0 0 5px rgba(41, 121, 255, 0.5)', marginTop: 2 }} />}
              {cell.isAbsent && <span className="cal-dot red-dot" />}
            </div>
          );
        })}
      </div>

      {/* Metrics Summary Row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', padding: '12px', background: 'rgba(79, 126, 255, 0.05)', borderRadius: '8px', border: '1px solid rgba(79, 126, 255, 0.15)' }}>
        <div style={{ flex: '1 1 45%', minWidth: '120px' }}>
          <div style={{ fontSize: '.75rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Days</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)' }}>{totalDaysWorked} <span style={{fontSize: '.85rem', color: 'var(--muted)', fontWeight: 'normal'}}>/ {getWorkingDaysInMonth(year, month)}</span></div>
        </div>
        <div style={{ flex: '1 1 45%', minWidth: '120px' }}>
          <div style={{ fontSize: '.75rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Hours</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)' }}>{totalHoursWorked} <span style={{fontSize: '.85rem', color: 'var(--muted)', fontWeight: 'normal'}}>/ {getWorkingDaysInMonth(year, month) * 5}</span></div>
        </div>
        <div style={{ flex: '1 1 45%', minWidth: '120px' }}>
          <div style={{ fontSize: '.75rem', color: '#FF8C00', textTransform: 'uppercase', fontWeight: 600 }}>Late (&lt;4h)</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#FF8C00' }}>{totalIncomplete} <span style={{fontSize: '.85rem', fontWeight: 'normal', color: 'var(--muted)'}}>times</span></div>
        </div>
        <div style={{ flex: '1 1 45%', minWidth: '120px' }}>
          <div style={{ fontSize: '.75rem', color: '#2979FF', textTransform: 'uppercase', fontWeight: 600 }}>Approved Leave</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#2979FF' }}>{totalLeaves} <span style={{fontSize: '.85rem', fontWeight: 'normal', color: 'var(--muted)'}}>days</span></div>
        </div>
      </div>
    </div>
  );
}

// --- Main Page ---

export default function HRPage() {
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const [curDate, setCurDate] = useState(todayDhaka);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const [members, setMembers] = useState<any[]>([]);
  const [att, setAtt] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [monthSum, setMonthSum] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<'att' | 'leave' | 'report'>('att');
  const [attLoading, setAttLoading] = useState(false);

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveData, setLeaveData] = useState({ member_id: '', leave_type: 'SICK', start_date: '', start_time: '', end_date: '', end_time: '', reason: '' });

  const [reportMemberId, setReportMemberId] = useState('');
  const nowJS = new Date();
  const [calYear, setCalYear] = useState(nowJS.getFullYear());
  const [calMonth, setCalMonth] = useState(nowJS.getMonth());
  const [calDays, setCalDays] = useState<CalDay[]>([]);
  const [calLoading, setCalLoading] = useState(false);

  const [toastMsg, setToastMsg] = useState('');
  const [showSetupModal, setShowSetupModal] = useState(false);

  // Wi-Fi automated attendance state
  const [wifiInfo, setWifiInfo] = useState<{
    is_office_wifi: boolean;
    office_wifi_name: string;
    is_auto_enabled: boolean;
    client_ip: string;
  }>({
    is_office_wifi: false,
    office_wifi_name: 'AlliedOne Office Wi-Fi',
    is_auto_enabled: true,
    client_ip: ''
  });

  function showToast(m: string) {
    setToastMsg(m);
    setTimeout(() => setToastMsg(''), 3200);
  }

  const authFetch = useCallback((url: string, opts?: RequestInit) => {
    return fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts?.headers || {}),
      },
    });
  }, [token]);

  const loadAll = useCallback(async () => {
    try {
      const leavesUrl = isAdmin ? '/api/leaves' : `/api/leaves?member_id=${user?.id}`;
      const curMonthStr = curDate.substring(0, 7);
      const [mRes, aRes, lRes, sumRes] = await Promise.all([
        authFetch('/api/members').then(r => r.json()),
        authFetch('/api/attendance?date=' + curDate).then(r => r.json()),
        authFetch(leavesUrl).then(r => r.json()),
        authFetch('/api/attendance/summary?month=' + curMonthStr).then(r => r.json()),
      ]);
      setMembers(Array.isArray(mRes) ? mRes : []);
      setAtt(Array.isArray(aRes) ? aRes : []);
      setLeaves(Array.isArray(lRes) ? lRes : []);
      setMonthSum(Array.isArray(sumRes) ? sumRes : []);
    } catch (e) { console.error(e); }
  }, [curDate, isAdmin, user?.id, authFetch]);

  // Wi-Fi Heartbeat & Auto Check-in Engine
  const sendWifiHeartbeat = useCallback(async () => {
    if (!token || !user?.id) return;
    try {
      const res = await authFetch('/api/attendance/wifi-heartbeat', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setWifiInfo(prev => ({
          ...prev,
          is_office_wifi: data.is_office_wifi,
          is_auto_enabled: data.is_auto_enabled ?? true
        }));
        if (data.auto_checked_in) {
          showToast('Automatically Checked In via Office Wi-Fi');
          await loadAll();
        }
      }
    } catch (e) {
      console.error('Wi-Fi heartbeat error:', e);
    }
  }, [token, user?.id, authFetch, loadAll]);

  const checkWifiStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/attendance/wifi-status');
      if (res.ok) {
        const data = await res.json();
        setWifiInfo(data);
      }
    } catch (e) {
      console.error('Wi-Fi status error:', e);
    }
  }, []);

  useEffect(() => {
    loadAll();
    checkWifiStatus();
    sendWifiHeartbeat();
    const iv = setInterval(loadAll, 30000);
    const hb = setInterval(sendWifiHeartbeat, 60000); // Heartbeat every 1 minute

    const handleTabSwitch = (e?: any) => {
      const target = e?.detail || new URLSearchParams(window.location.search).get('tab');
      if (target === 'leave' || target === 'leaves') {
        setActiveTab('leave');
      } else if (target === 'report') {
        setActiveTab('report');
      } else if (target === 'att') {
        setActiveTab('att');
      }
    };

    handleTabSwitch();
    window.addEventListener('popstate', handleTabSwitch);
    window.addEventListener('change-hr-tab', handleTabSwitch);

    return () => {
      clearInterval(iv);
      clearInterval(hb);
      window.removeEventListener('popstate', handleTabSwitch);
      window.removeEventListener('change-hr-tab', handleTabSwitch);
    };
  }, [loadAll, checkWifiStatus, sendWifiHeartbeat]);

  const loadCalendar = useCallback(async () => {
    if (!reportMemberId || !isAdmin) return;
    setCalLoading(true);
    const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
    try {
      const [attRes, leaveRes] = await Promise.all([
        authFetch(`/api/attendance/monthly?member_id=${reportMemberId}&month=${monthStr}`).then(r => r.json()),
        authFetch(`/api/leaves/monthly?member_id=${reportMemberId}&month=${monthStr}`).then(r => r.json()),
      ]);
      const attRows: any[] = Array.isArray(attRes) ? attRes : [];
      const leaveRows: any[] = Array.isArray(leaveRes) ? leaveRes : [];

      const attMap = new Map<string, { hasIn: boolean; hasOut: boolean; inTime: string; outTime: string, inDate?: Date, outDate?: Date }>();
      attRows.forEach((r: any) => {
        const d = r.att_date as string;
        const ex = attMap.get(d) || { hasIn: false, hasOut: false, inTime: '', outTime: '' };
        const t = formatTime(r.timestamp);
        const dt = parseTimestamp(r.timestamp);
        if (r.action_type === 'IN') { ex.hasIn = true; ex.inTime = t; ex.inDate = dt; }
        if (r.action_type === 'OUT') { ex.hasOut = true; ex.outTime = t; ex.outDate = dt; }
        attMap.set(d, ex);
      });

      const leaveDateMap = new Map<string, { type: string; status: string }>();
      leaveRows.forEach((l: any) => {
        const start = new Date(l.start_date + 'T00:00:00');
        const end = new Date(l.end_date + 'T00:00:00');
        for (const cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
          leaveDateMap.set(cur.toLocaleDateString('en-CA'), { type: l.leave_type, status: l.status });
        }
      });

      const total = daysInMonth(calYear, calMonth);
      const todayStr = todayDhaka();
      const days: CalDay[] = [];
      for (let d = 1; d <= total; d++) {
        const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dow = new Date(ds + 'T00:00:00').getDay();
        const isWeekend = dow === 5 || dow === 6;
        const isLeaveDay = leaveDateMap.has(ds);
        const isPresent = attMap.get(ds)?.hasIn ?? false;
        const isFuture = ds > todayStr;
        const leaveInfo = leaveDateMap.get(ds);
        const attInfo = attMap.get(ds);
        
        let isIncomplete = false;
        let hoursWorked = 0;
        
        if (attInfo?.inDate) {
           const inDate = attInfo.inDate;
           
           if (attInfo.outDate) {
              hoursWorked = (attInfo.outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60);
              // Flexible timing: If they worked less than 4 hours (with a tiny buffer), it's incomplete
              if (hoursWorked < 3.9) {
                isIncomplete = true;
              }
           } else if (!isFuture && ds !== todayStr) {
              // If they forgot to check out on a past day, it's incomplete
              isIncomplete = true;
           }
        }

        days.push({
          date: ds,
          isWeekend,
          isPresent,
          isLeave: isLeaveDay && !isPresent,
          isAbsent: !isWeekend && !isPresent && !isLeaveDay && !isFuture,
          isIncomplete,
          hoursWorked,
          checkInTime: attInfo?.inTime,
          checkOutTime: attInfo?.outTime,
          leaveType: leaveInfo?.type,
          leaveStatus: leaveInfo?.status,
        });
      }
      setCalDays(days);
    } catch (e) { console.error(e); }
    finally { setCalLoading(false); }
  }, [reportMemberId, calYear, calMonth, isAdmin, authFetch]);

  useEffect(() => { loadCalendar(); }, [loadCalendar]);

  const markAttendance = async (type: 'IN' | 'OUT') => {
    if (!user?.id) { showToast('Not logged in.'); return; }
    setAttLoading(true);
    try {
      await authFetch('/api/attendance', {
        method: 'POST',
        body: JSON.stringify({ member_id: user.id, action_type: type }),
      });
      showToast(`${type === 'IN' ? 'Checked In' : 'Checked Out'} at ${nowDhaka()}`);
      await loadAll();
    } catch { showToast('Cannot reach server.'); }
    finally { setAttLoading(false); }
  };

  const submitLeave = async () => {
    if (!leaveData.start_date || !leaveData.end_date) {
      showToast('Please select start and end dates.');
      return;
    }
    try {
      await authFetch('/api/leaves', {
        method: 'POST',
        body: JSON.stringify({ ...leaveData, member_id: leaveData.member_id || user?.id }),
      });
      setShowLeaveModal(false);
      setLeaveData({ member_id: '', leave_type: 'SICK', start_date: '', start_time: '', end_date: '', end_time: '', reason: '' });
      showToast('Leave request submitted. Awaiting admin approval.');
      await loadAll();
    } catch { showToast('Cannot reach server.'); }
  };

  const reviewLeave = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await authFetch('/api/leaves/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      showToast(status === 'APPROVED' ? 'Leave approved' : 'Leave cancelled');
      await loadAll();
    } catch { showToast('Cannot reach server.'); }
  };

  const reportRef = useRef<HTMLDivElement>(null);

  const downloadImage = async () => {
    if (!reportRef.current) return;
    const emp = members.find(m => String(m.id) === String(reportMemberId));
    const empName = emp?.name || 'Employee';
    try {
      showToast('Generating picture...');
      const canvas = await html2canvas(reportRef.current, { 
        backgroundColor: '#ffffff',
        onclone: (doc) => {
          const el = doc.getElementById('monthly-calendar-report');
          if (el) {
            el.style.setProperty('--card', '#ffffff');
            el.style.setProperty('--text', '#000000');
            el.style.setProperty('--muted', '#555555');
            el.style.setProperty('--border', '#dddddd');
            el.style.setProperty('--gs', '#eeeeee');
            el.style.color = '#000000';

            // Increase opacity for calendar cells
            el.querySelectorAll('.present').forEach(c => {
              (c as HTMLElement).style.backgroundColor = 'rgba(38,196,134,0.3)';
              (c as HTMLElement).style.borderColor = 'rgba(38,196,134,1)';
            });
            el.querySelectorAll('.absent').forEach(c => {
              (c as HTMLElement).style.backgroundColor = 'rgba(242,92,122,0.3)';
              (c as HTMLElement).style.borderColor = 'rgba(242,92,122,1)';
            });
            el.querySelectorAll('.on-leave').forEach(c => {
              (c as HTMLElement).style.backgroundColor = 'rgba(245,166,35,0.3)';
              (c as HTMLElement).style.borderColor = 'rgba(245,166,35,1)';
            });

            // Make dots solid and highly vibrant without box-shadow 
            el.querySelectorAll('.green-dot').forEach(d => {
              (d as HTMLElement).style.backgroundColor = '#00C853';
              (d as HTMLElement).style.boxShadow = 'none';
            });
            el.querySelectorAll('.red-dot').forEach(d => {
              (d as HTMLElement).style.backgroundColor = '#D50000';
              (d as HTMLElement).style.boxShadow = 'none';
            });
            el.querySelectorAll('.yellow-dot').forEach(d => {
              (d as HTMLElement).style.backgroundColor = '#FFD600';
              (d as HTMLElement).style.boxShadow = 'none';
            });
          }
        }
      });
      const imgData = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = imgData;
      a.download = `${empName.replace(/\s+/g, '_')}_${calYear}-${String(calMonth + 1).padStart(2, '0')}_Attendance.png`;
      a.click();
      showToast('Picture downloaded.');
    } catch (e) {
      console.error(e);
      showToast('Failed to generate picture.');
    }
  };

  const presentCount = new Set(att.filter(a => a.action_type === 'IN').map((a: any) => a.member_id)).size;
  const pendingLeaves = leaves.filter(l => l.status === 'PENDING').length;
  const myTodayAtt = att.filter(a => String(a.member_id) === String(user?.id));
  const alreadyCheckedIn = myTodayAtt.some(a => a.action_type === 'IN');
  const alreadyCheckedOut = myTodayAtt.some(a => a.action_type === 'OUT');

  return (
    <>
      <Topbar title="HR & Attendance">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Date navigator */}
          <div className="dnav" style={{ position: 'relative' }}>
            <button onClick={() => setCurDate(s => shiftDateStr(s, -1))} aria-label="Previous day">
              <ChevronLeft size={16} />
            </button>
            <div
              className={'dchip' + (curDate === todayDhaka() ? ' today' : '')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              onClick={() => {
                const inp = dateInputRef.current;
                if (inp) {
                  try { inp.showPicker(); } catch { inp.click(); }
                }
              }}
            >
              <Calendar size={13} style={{ opacity: 0.6, flexShrink: 0 }} />
              {fmtDateLabel(curDate)}
              <input
                ref={dateInputRef}
                type="date"
                value={curDate}
                onChange={e => { if (e.target.value) setCurDate(e.target.value); }}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                tabIndex={-1}
              />
            </div>
            <button onClick={() => setCurDate(s => shiftDateStr(s, 1))} aria-label="Next day">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Wi-Fi Network Status Pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: '20px',
              background: wifiInfo.is_office_wifi ? 'rgba(38, 196, 134, 0.12)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${wifiInfo.is_office_wifi ? 'rgba(38, 196, 134, 0.35)' : 'var(--border)'}`,
              fontSize: '.74rem',
              fontWeight: 600,
              color: wifiInfo.is_office_wifi ? 'var(--green)' : 'var(--muted)',
            }}
            title={wifiInfo.is_office_wifi ? `Connected to ${wifiInfo.office_wifi_name} (Auto Check-In Active)` : 'Connected via Remote / Mobile Network'}
          >
            <Wifi size={13} style={{ color: wifiInfo.is_office_wifi ? 'var(--green)' : 'var(--muted)' }} />
            <span>{wifiInfo.is_office_wifi ? (wifiInfo.office_wifi_name || 'Office Wi-Fi') : 'Remote Network'}</span>
          </div>

          {/* Leave Request button - Employee only */}
          {!isAdmin && (
            <button className="btn btn-primary" onClick={() => setShowLeaveModal(true)}>
              <Plus size={15} /> Leave Request
            </button>
          )}
        </div>
      </Topbar>

      <div className="scroll">

        {/* Employee check-in/out widget */}
        {!isAdmin && (
          <div className="checkin-widget">
            <div className="cw-title">Mark Your Attendance</div>
            
            {/* Wi-Fi Presence Banner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
              marginBottom: 12,
              padding: '8px 12px',
              borderRadius: '8px',
              background: wifiInfo.is_office_wifi ? 'rgba(38, 196, 134, 0.08)' : 'rgba(255, 255, 255, 0.03)',
              border: `1px solid ${wifiInfo.is_office_wifi ? 'rgba(38, 196, 134, 0.25)' : 'var(--border)'}`,
              fontSize: '.78rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Wifi size={14} style={{ color: wifiInfo.is_office_wifi ? 'var(--green)' : 'var(--muted)' }} />
                <span style={{ color: wifiInfo.is_office_wifi ? 'var(--green)' : 'var(--muted)', fontWeight: 600 }}>
                  {wifiInfo.is_office_wifi ? `${wifiInfo.office_wifi_name || 'Office Wi-Fi'} Connected` : 'Remote Network (Manual Check-In)'}
                </span>
              </div>
              {wifiInfo.is_office_wifi && wifiInfo.is_auto_enabled && (
                <span style={{ fontSize: '.72rem', color: 'var(--green)', opacity: 0.9 }}>
                  ⚡ Auto Check-In Active
                </span>
              )}
            </div>

            <div style={{ marginBottom: 12, fontSize: '.83rem', color: 'var(--muted)' }}>
              Logged in as <strong style={{ color: 'var(--text)' }}>{user?.name}</strong>
              <span style={{ margin: '0 8px', opacity: 0.5 }}>|</span>
              <span style={{ color: 'var(--muted)', fontSize: '.78rem' }}>Time recorded automatically</span>
            </div>
            <div className="cw-btns" style={{ gap: 12 }}>
              <button
                className="btn btn-green"
                disabled={attLoading || alreadyCheckedIn}
                onClick={() => markAttendance('IN')}
                style={{ flex: 1, justifyContent: 'center', fontSize: '.95rem', padding: '13px 20px', opacity: alreadyCheckedIn ? 0.45 : 1, transition: 'opacity .2s' }}
              >
                <LogIn size={18} /> Check In
              </button>
              <button
                className="btn btn-red"
                disabled={attLoading || !alreadyCheckedIn || alreadyCheckedOut}
                onClick={() => markAttendance('OUT')}
                style={{ flex: 1, justifyContent: 'center', fontSize: '.95rem', padding: '13px 20px', opacity: (!alreadyCheckedIn || alreadyCheckedOut) ? 0.45 : 1, transition: 'opacity .2s' }}
              >
                <LogOut size={18} /> Check Out
              </button>
            </div>
            {alreadyCheckedIn && (
              <div style={{ marginTop: 10, fontSize: '.78rem', color: 'var(--green)', fontWeight: 600 }}>
                You are checked in{alreadyCheckedOut ? ' and checked out' : ''} today
              </div>
            )}
          </div>
        )}

        {/* Zero-Browser Laptop Auto-Attendance Setup Card */}
        {!isAdmin && (
          <div className="card" style={{ marginBottom: '20px', background: 'linear-gradient(145deg, rgba(79, 126, 255, 0.06), rgba(0, 0, 0, 0.25))', border: '1px solid rgba(79, 126, 255, 0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ padding: '10px', background: 'rgba(79, 126, 255, 0.15)', borderRadius: '10px', color: 'var(--primary)' }}>
                  <Laptop size={22} />
                </div>
                <div>
                  <div style={{ fontSize: '.95rem', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Zero-Browser Laptop Auto-Attendance
                    <span style={{ fontSize: '.68rem', background: 'var(--gs)', color: 'var(--green)', padding: '2px 7px', borderRadius: '4px', fontWeight: 600 }}>
                      RECOMMENDED
                    </span>
                  </div>
                  <p style={{ fontSize: '.78rem', color: 'var(--muted)', margin: '4px 0 0', maxWidth: '540px', lineHeight: 1.45 }}>
                    Open your laptop at the office: <strong>Auto Check-In</strong>. Turn off your laptop: <strong>Auto Check-Out</strong>. No browser needed!
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowSetupModal(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Laptop size={14} /> Windows Setup
                </button>
                <a
                  href={`/api/attendance/download-script?os=mac&token=${token || ''}`}
                  download={`AlliedOne-Attendance-${(user?.name || 'Employee').replace(/[^a-zA-Z0-9]/g, '_')}.sh`}
                  className="btn btn-ghost btn-sm"
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Download size={14} /> Mac / Linux (.sh)
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Windows Setup Modal - PowerShell one-liner (bypasses Smart App Control) */}
        {showSetupModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={() => setShowSetupModal(false)}>
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px', maxWidth: '600px', width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Laptop size={18} style={{ color: 'var(--primary)' }} />
                  Windows Auto-Attendance Setup
                </div>
                <button onClick={() => setShowSetupModal(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>✕</button>
              </div>

              {/* Step 1 */}
              <div style={{ marginBottom: '16px', padding: '14px', background: 'rgba(255,165,0,0.07)', border: '1px solid rgba(255,165,0,0.2)', borderRadius: '10px' }}>
                <div style={{ fontWeight: 700, fontSize: '.85rem', color: '#f5a623', marginBottom: '6px' }}>⚠️ Why not a .bat file?</div>
                <div style={{ fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.55 }}>
                  Windows Smart App Control blocks downloaded <code>.bat</code> files from the internet. Instead, paste the command below directly into PowerShell — this is never blocked.
                </div>
              </div>

              {/* Steps */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                  <strong style={{ color: 'var(--text)' }}>Step 1:</strong> Press <kbd style={{ background: 'var(--gs)', border: '1px solid var(--border)', borderRadius: '4px', padding: '1px 6px', fontFamily: 'monospace', fontSize: '.8rem' }}>Win + X</kbd> → click <strong style={{ color: 'var(--text)' }}>"Terminal (Admin)"</strong> or <strong style={{ color: 'var(--text)' }}>"Windows PowerShell (Admin)"</strong>
                </div>
                <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                  <strong style={{ color: 'var(--text)' }}>Step 2:</strong> Click the button below to copy the command, then paste it in the PowerShell window and press Enter.
                </div>
                <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                  <strong style={{ color: 'var(--text)' }}>Step 3:</strong> Done! Laptop will auto check-in every time you open it at the office.
                </div>
              </div>

              {/* Command box */}
              <div style={{ position: 'relative', background: '#0d1117', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', marginBottom: '14px' }}>
                <code style={{ fontSize: '.72rem', color: '#58a6ff', wordBreak: 'break-all', lineHeight: 1.6, display: 'block', whiteSpace: 'pre-wrap' }}>
                  {`Set-ExecutionPolicy Bypass -Scope Process -Force; $d="$env:LOCALAPPDATA\\AlliedOneERP"; if(!(Test-Path $d)){New-Item -ItemType Directory -Path $d | Out-Null}; Invoke-WebRequest -Uri "${typeof window !== 'undefined' ? window.location.origin : ''}/api/attendance/download-script?os=ps1&token=${token || ''}" -OutFile "$d\\aol-attendance.ps1"; $vs='Set WshShell = CreateObject("WScript.Shell"):WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File """&WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")&"\\AlliedOneERP\\aol-attendance.ps1""", 0, False'; $vs | Out-File "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\AlliedOneAttendance.vbs"; Start-Process wscript "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\AlliedOneAttendance.vbs"; Write-Host "SUCCESS! Auto-attendance is now active." -ForegroundColor Green`}
                </code>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', gap: '8px' }}
                onClick={() => {
                  const cmd = `Set-ExecutionPolicy Bypass -Scope Process -Force; $d="$env:LOCALAPPDATA\\AlliedOneERP"; if(!(Test-Path $d)){New-Item -ItemType Directory -Path $d | Out-Null}; Invoke-WebRequest -Uri "${typeof window !== 'undefined' ? window.location.origin : ''}/api/attendance/download-script?os=ps1&token=${token || ''}" -OutFile "$d\\aol-attendance.ps1"; $vs='Set WshShell = CreateObject("WScript.Shell"):WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File """&WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")&"\\AlliedOneERP\\aol-attendance.ps1""", 0, False'; $vs | Out-File "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\AlliedOneAttendance.vbs"; Start-Process wscript "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\AlliedOneAttendance.vbs"; Write-Host 'SUCCESS! Auto-attendance is now active.' -ForegroundColor Green`;
                  navigator.clipboard.writeText(cmd).then(() => showToast('Command copied! Paste it in Admin PowerShell.'));
                }}
              >
                📋 Copy PowerShell Command
              </button>

              <div style={{ marginTop: '10px', fontSize: '.72rem', color: 'var(--muted)', textAlign: 'center' }}>
                This command downloads and installs the attendance agent. It is safe and specific to your account.
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="tabs">
          <div className={'tab ' + (activeTab === 'att' ? 'on' : '')} onClick={() => setActiveTab('att')}>
            Attendance Log
          </div>
          <div className={'tab ' + (activeTab === 'leave' ? 'on' : '')} onClick={() => setActiveTab('leave')}>
            Leave Requests
            {pendingLeaves > 0 && (
              <span style={{ marginLeft: 6, background: 'var(--orange)', color: '#0d0f18', fontSize: '.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 10, verticalAlign: 'middle' }}>
                {pendingLeaves}
              </span>
            )}
          </div>
          {isAdmin && (
            <div className={'tab ' + (activeTab === 'report' ? 'on' : '')} onClick={() => setActiveTab('report')}>
              Monthly Report
            </div>
          )}
        </div>

        {/* Attendance log */}
        {activeTab === 'att' && (
          <div className="card">
            <div className="card-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <h3>Daily Attendance Log</h3>
                <span style={{ fontSize: '.8rem', color: 'var(--muted)', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: 20 }}>
                  {fmtDateLabel(curDate)}
                </span>
              </div>
              
              {/* Daily Summary */}
              {(() => {
                const totalWorkingDays = getWorkingDaysInMonth(new Date(curDate).getFullYear(), new Date(curDate).getMonth());
                const totalRequiredHours = totalWorkingDays * 5;

                // Process monthly stats per member
                const monthlyStats = new Map<number, { daysPresent: number; totalHours: number }>();
                const mGroups = new Map<string, any>();
                monthSum.forEach(m => {
                   if (!isAdmin && String(m.member_id) !== String(user?.id)) return;
                   const key = `${m.member_id}_${m.att_date}`;
                   const ex = mGroups.get(key) || { inRaw: null, outRaw: null };
                   const dt = parseTimestamp(m.timestamp);
                   if (m.action_type === 'IN') ex.inRaw = dt;
                   if (m.action_type === 'OUT') ex.outRaw = dt;
                   mGroups.set(key, ex);
                });
                mGroups.forEach((val, key) => {
                   const mId = parseInt(key.split('_')[0] || '0');
                   const s = monthlyStats.get(mId) || { daysPresent: 0, totalHours: 0 };
                   if (val.inRaw) s.daysPresent++;
                   if (val.inRaw && val.outRaw) {
                      s.totalHours += (val.outRaw.getTime() - val.inRaw.getTime()) / (1000 * 60 * 60);
                   }
                   monthlyStats.set(mId, s);
                });

                // Process daily stats
                const agg = new Map<number, any>();
                att.forEach(a => {
                  if (!isAdmin && String(a.member_id) !== String(user?.id)) return;
                  const ex = agg.get(a.member_id) || { member_id: a.member_id, name: a.member_name || 'Unknown', color: a.avatar_color, inRaw: null, outRaw: null, hours: 0, leave: null };
                  const dt = parseTimestamp(a.timestamp);
                  if (a.action_type === 'IN') ex.inRaw = dt;
                  if (a.action_type === 'OUT') ex.outRaw = dt;
                  agg.set(a.member_id, ex);
                });

                agg.forEach((ex, mId) => {
                  if (ex.inRaw && ex.outRaw) {
                    ex.hours = (ex.outRaw.getTime() - ex.inRaw.getTime()) / (1000 * 60 * 60);
                  }
                  const leave = leaves.find(l => 
                    String(l.member_id) === String(mId) &&
                    new Date(l.start_date + 'T00:00:00') <= new Date(curDate + 'T00:00:00') &&
                    new Date(l.end_date + 'T00:00:00') >= new Date(curDate + 'T00:00:00')
                  );
                  if (leave) {
                    ex.leave = `${leave.leave_type} (${leave.status})`;
                  }
                });

                const list = Array.from(agg.values());
                const totalHours = list.reduce((s, i) => s + i.hours, 0);
                const totalLeaves = list.filter(i => i.leave).length;
                const totalPresent = list.filter(i => i.inRaw).length;

                return (
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'space-between', padding: '10px', background: 'var(--gs)', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: 12 }}>
                      <div style={{ flex: '1 1 30%', minWidth: '60px' }}>
                        <div style={{ fontSize: '.65rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Present</div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>{totalPresent}</div>
                      </div>
                      <div style={{ flex: '1 1 30%', minWidth: '60px' }}>
                        <div style={{ fontSize: '.65rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Hours</div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>{totalHours.toFixed(1)} <span style={{fontSize: '.7rem', fontWeight: 'normal'}}>hrs</span></div>
                      </div>
                      <div style={{ flex: '1 1 30%', minWidth: '60px' }}>
                        <div style={{ fontSize: '.65rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>On Leave</div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>{totalLeaves}</div>
                      </div>
                    </div>

                    <div style={{ overflowX: 'hidden' }}>
                      <table style={{ width: '100%', fontSize: '.75rem', tableLayout: 'fixed' }}>
                        <colgroup>
                          <col style={{ width: '42%' }} />
                          <col style={{ width: '35%' }} />
                          <col style={{ width: '23%' }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th style={{ padding: '6px 4px', textAlign: 'left', fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Name</th>
                            <th style={{ padding: '6px 4px', textAlign: 'left', fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Hrs / Days</th>
                            <th style={{ padding: '6px 4px', textAlign: 'left', fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Leave</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.length === 0 ? (
                            <tr className="empty-r"><td colSpan={3}>No records for this date.</td></tr>
                          ) : (
                            list.map((l, idx) => {
                              const stats = monthlyStats.get(l.member_id) || { daysPresent: 0, totalHours: 0 };
                              return (
                                <tr key={idx}>
                                  {/* Name + avatar */}
                                  <td style={{ padding: '6px 4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      <div className="av" style={{ background: l.color || '#4f7eff', width: '22px', height: '22px', fontSize: '.68rem', flexShrink: 0 }}>
                                        {l.name[0].toUpperCase()}
                                      </div>
                                      <div style={{ fontWeight: 600, fontSize: '.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                                    </div>
                                  </td>
                                  {/* Hours & Days stacked */}
                                  <td style={{ padding: '6px 4px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <div style={{ fontSize: '.7rem' }}>
                                        <span style={{ fontWeight: 700, color: 'var(--text)' }}>{stats.totalHours.toFixed(1)}</span>
                                        <span style={{ color: 'var(--muted)', fontSize: '.65rem' }}>/{totalRequiredHours}h</span>
                                      </div>
                                      <div style={{ fontSize: '.7rem' }}>
                                        <span style={{ fontWeight: 700, color: 'var(--text)' }}>{stats.daysPresent}</span>
                                        <span style={{ color: 'var(--muted)', fontSize: '.65rem' }}>/{totalWorkingDays}d</span>
                                      </div>
                                    </div>
                                  </td>
                                  {/* Leave badge */}
                                  <td style={{ padding: '6px 4px' }}>
                                    {l.leave ? (
                                      <span className="badge" style={{ background: l.leave.includes('APPROVED') ? 'rgba(38,196,134,0.15)' : 'rgba(255,140,0,0.15)', color: l.leave.includes('APPROVED') ? 'var(--green)' : '#FF8C00', border: `1px solid ${l.leave.includes('APPROVED') ? 'rgba(38,196,134,0.3)' : 'rgba(255,140,0,0.3)'}`, fontSize: '.6rem', padding: '2px 5px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                                        {l.leave.split(' ')[0]}
                                      </span>
                                    ) : (
                                      <span style={{ color: 'var(--muted)', fontSize: '.7rem' }}>—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Leave requests */}
        {activeTab === 'leave' && (
          <div className="card">
            <div className="card-head">
              <h3>{isAdmin ? 'All Leave Requests' : 'My Leave Requests'}</h3>
              {!isAdmin && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowLeaveModal(true)}>
                  <Plus size={13} /> New
                </button>
              )}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {isAdmin && <th>Employee</th>}
                    <th>Type</th>
                    <th>Period</th>
                    <th>Reason</th>
                    <th>Status</th>
                    {isAdmin && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {leaves.length === 0 ? (
                    <tr className="empty-r"><td colSpan={isAdmin ? 6 : 4}>No leave requests found.</td></tr>
                  ) : (
                    leaves.map((l: any) => (
                      <tr key={l.id}>
                        {isAdmin && (
                          <td>
                            <div className="av-cell">
                              <div className="av" style={{ background: l.avatar_color || '#4f7eff' }}>
                                {(l.member_name || '?')[0]}
                              </div>
                              {l.member_name || '?'}
                            </div>
                          </td>
                        )}
                        <td><span className={'badge ' + l.leave_type}>{l.leave_type}</span></td>
                        <td style={{ color: 'var(--muted)', fontSize: '.76rem' }}>{l.start_date} to {l.end_date}</td>
                        <td style={{ color: 'var(--muted)', fontSize: '.76rem', maxWidth: 130 }}>{l.reason || '-'}</td>
                        <td>
                          <span className={'badge ' + (l.status === 'APPROVED' ? 'APPROVED' : l.status === 'REJECTED' || l.status === 'CANCELLED' ? 'REJECTED' : 'PENDING')}>
                            {l.status === 'REJECTED' ? 'CANCELLED' : l.status}
                          </span>
                        </td>
                        {isAdmin && (
                          <td>
                            {l.status === 'PENDING' ? (
                              <>
                                <button className="btn btn-green btn-sm" style={{ marginRight: 4 }} onClick={() => reviewLeave(l.id, 'APPROVED')}>Approve</button>
                                <button className="btn btn-red btn-sm" onClick={() => reviewLeave(l.id, 'REJECTED')}>Cancel</button>
                              </>
                            ) : (
                              <span style={{ color: 'var(--muted)', fontSize: '.76rem' }}>Reviewed</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Summary cards removed per user request */}

        {/* Monthly Report - Admin only */}
        {activeTab === 'report' && isAdmin && (
          <div className="card">
            <div className="card-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart2 size={17} style={{ color: 'var(--primary)' }} />
                <h3>Monthly Attendance Report</h3>
              </div>
              {reportMemberId && calDays.length > 0 && (
                <button className="btn btn-primary btn-sm" onClick={downloadImage}>
                  <ImageIcon size={13} /> Export as Picture
                </button>
              )}
            </div>

            {/* Controls row */}
            <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>Employee</div>
                <select
                  className="cw-select"
                  style={{ minWidth: 210 }}
                  value={reportMemberId}
                  onChange={e => setReportMemberId(e.target.value)}
                >
                  <option value="">Select employee...</option>
                  {members.filter(m => m.role !== 'Admin').sort((a,b) => a.name.localeCompare(b.name)).map(m => (
                    <option key={m.id} value={m.id}>{m.name} - {m.role}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>Month</div>
                <div className="dnav">
                  <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}>
                    <ChevronLeft size={14} />
                  </button>
                  <div className="dchip" style={{ minWidth: 150, fontSize: '.84rem' }}>{monthLabel(calYear, calMonth)}</div>
                  <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* The exportable area */}
            <div id="monthly-calendar-report" ref={reportRef} style={{ background: 'var(--card)' }}>
              
              {/* Employee info header for report */}
              {reportMemberId && (
                <div style={{ padding: '20px 18px 0', textAlign: 'center' }}>
                  <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text)' }}>
                    {members.find(m => String(m.id) === String(reportMemberId))?.name || 'Employee'}
                  </h2>
                  <div style={{ fontSize: '.85rem', color: 'var(--muted)', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
                    {members.find(m => String(m.id) === String(reportMemberId))?.role || ''} • {monthLabel(calYear, calMonth)}
                  </div>
                </div>
              )}

              {/* Calendar grid */}
              <div style={{ padding: '18px' }}>
                {!reportMemberId ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', fontSize: '.84rem' }}>
                    Select an employee above to view their monthly attendance calendar.
                  </div>
                ) : calLoading ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>Loading calendar...</div>
                ) : (
                  <MonthCalendar year={calYear} month={calMonth} calDays={calDays} />
                )}
              </div>

              {/* Month stats */}
              {reportMemberId && calDays.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, padding: '0 18px 20px' }}
                     className="cal-stats-grid">
                  {[
                    { label: 'Present',        val: calDays.filter(d => d.isPresent).length,                       color: 'var(--green)', dot: { background: 'var(--green)', boxShadow: '0 0 5px rgba(38,196,134,0.5)' } },
                    { label: 'Absent',         val: calDays.filter(d => d.isAbsent).length,                        color: 'var(--red)',   dot: { background: 'var(--red)',   boxShadow: '0 0 5px rgba(255,77,79,0.5)' } },
                    { label: 'Late',           val: calDays.filter(d => d.isIncomplete).length,                    color: '#FF8C00',      dot: { background: '#FF8C00',      boxShadow: '0 0 5px rgba(255,140,0,0.6)' } },
                    { label: 'Appr. Leave',    val: calDays.filter(d => d.isLeave && d.leaveStatus === 'APPROVED').length, color: '#2979FF', dot: { background: '#2979FF', boxShadow: '0 0 5px rgba(41,121,255,0.5)' } },
                  ].map(({ label, val, color, dot }) => (
                    <div key={label} className="s-card" style={{ textAlign: 'center' }}>
                      <div className="s-lbl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <span className="cal-dot" style={{ position: 'static', ...dot }} />
                        {label}
                      </div>
                      <div className="s-val" style={{ color, fontSize: '1.4rem' }}>{val}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Leave request modal */}
      {showLeaveModal && (
        <div className="veil on" onClick={e => { if (e.target === e.currentTarget) setShowLeaveModal(false); }}>
          <div className="modal">
            <div className="mhead">
              <h3>Leave Request</h3>
              <button className="xbtn" onClick={() => setShowLeaveModal(false)}><X size={16} /></button>
            </div>
            <div className="fg">
              <label>Employee</label>
              {isAdmin ? (
                <select value={leaveData.member_id || user?.id || ''} onChange={e => setLeaveData({ ...leaveData, member_id: e.target.value })}>
                  <option value={user?.id || ''}>{user?.name}</option>
                  {[...members].sort((a,b) => a.name.localeCompare(b.name)).map(m => (
                    m.id !== user?.id && <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              ) : (
                <input type="text" value={user?.name || ''} disabled style={{ opacity: 0.7 }} />
              )}
            </div>
            <div className="fg">
              <label>Reason</label>
              <select value={leaveData.leave_type} onChange={e => setLeaveData({ ...leaveData, leave_type: e.target.value })}>
                <option value="SICK">Sick</option>
                <option value="PERSONAL">Personal</option>
                <option value="EXAM">Exam</option>
              </select>
            </div>
            <div className="drow">
              <div className="fg" style={{ flex: 1 }}>
                <label>From Date</label>
                <input type="date" value={leaveData.start_date} onChange={e => setLeaveData({ ...leaveData, start_date: e.target.value })} />
              </div>
              <div className="fg" style={{ flex: 1 }}>
                <label>From Time</label>
                <input type="time" value={leaveData.start_time} onChange={e => setLeaveData({ ...leaveData, start_time: e.target.value })} />
              </div>
            </div>
            <div className="drow">
              <div className="fg" style={{ flex: 1 }}>
                <label>To Date</label>
                <input type="date" value={leaveData.end_date} min={leaveData.start_date} onChange={e => setLeaveData({ ...leaveData, end_date: e.target.value })} />
              </div>
              <div className="fg" style={{ flex: 1 }}>
                <label>To Time</label>
                <input type="time" value={leaveData.end_time} onChange={e => setLeaveData({ ...leaveData, end_time: e.target.value })} />
              </div>
            </div>
            <div className="fg">
              <label>Notes</label>
              <textarea placeholder="Optional notes..." value={leaveData.reason} onChange={e => setLeaveData({ ...leaveData, reason: e.target.value })} />
            </div>
            <div style={{ marginBottom: 8, padding: '8px 10px', borderRadius: 7, background: 'rgba(79,126,255,.08)', fontSize: '.76rem', color: 'var(--muted)' }}>
              Note: Your request will be sent to Admin for approval.
            </div>
            <div className="mfooter">
              <button className="btn btn-ghost" onClick={() => setShowLeaveModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitLeave}>Submit Request</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="toast on">{toastMsg}</div>}
    </>
  );
}