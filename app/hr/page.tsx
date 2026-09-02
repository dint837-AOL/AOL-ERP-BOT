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
import { LogIn, LogOut, Plus, ChevronLeft, ChevronRight, X, Calendar, Download, BarChart2, Wifi, Laptop, Image as ImageIcon, Terminal, Copy, Check, ShieldCheck, Zap } from 'lucide-react';
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
  const s = String(ts).trim();
  if (s.endsWith('Z') || s.includes('+') || (s.includes('-') && s.lastIndexOf('-') > 10)) {
    return new Date(s);
  }
  if (s.includes('T')) return new Date(s + 'Z');
  return new Date(s.replace(' ', 'T') + 'Z');
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

function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0] || '').slice(0, 2).toUpperCase();
  const first = parts[0] || '';
  const last = parts[parts.length - 1] || '';
  return ((first[0] || '') + (last[0] || '')).toUpperCase();
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
              {cell.isPresent && !cell.isIncomplete && <span className="cal-dot green-dot" />}
              {cell.isIncomplete && <span className="cal-dot" style={{ background: '#FF8C00', boxShadow: '0 0 5px rgba(255, 140, 0, 0.6)' }} />}
              {isApprovedLeave && <span className="cal-dot" style={{ background: '#2979FF', boxShadow: '0 0 5px rgba(41, 121, 255, 0.5)', marginTop: 2 }} />}
              {cell.isAbsent && <span className="cal-dot red-dot" />}
            </div>
          );
        })}
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

  const [activeTab, setActiveTab] = useState<'att' | 'leave' | 'report'>('att'); // att=Team, report=Individual, leave=Leave Request
  const [attLoading, setAttLoading] = useState(false);

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveData, setLeaveData] = useState({ member_id: '', leave_type: 'SICK', start_datetime: '', end_datetime: '', reason: '' });

  const [reportMemberId, setReportMemberId] = useState('');
  const nowJS = new Date();
  const [calYear, setCalYear] = useState(nowJS.getFullYear());
  const [calMonth, setCalMonth] = useState(nowJS.getMonth());
  const [calDays, setCalDays] = useState<CalDay[]>([]);
  const [calLoading, setCalLoading] = useState(false);

  const [toastMsg, setToastMsg] = useState('');
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupOs, setSetupOs] = useState<'windows' | 'mac'>('windows');
  const [copiedCmd, setCopiedCmd] = useState(false);

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
      if (Array.isArray(mRes) && mRes.length > 0) {
        setReportMemberId(prev => {
          if (prev) return prev;
          const emp = mRes.find((m: any) => m.role !== 'Admin') || mRes[0];
          return emp ? String(emp.id) : '';
        });
      }
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
      } else if (target === 'report' || target === 'individual') {
        setActiveTab('report');
      } else if (target === 'att' || target === 'team') {
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
        const rawTs = r.timestamp;
        const dt = typeof rawTs === 'string' ? parseTimestamp(rawTs) : new Date(rawTs);
        const d = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
        const ex = attMap.get(d) || { hasIn: false, hasOut: false, inTime: '', outTime: '' };
        const t = formatTime(rawTs);
        if (r.action_type === 'IN') { ex.hasIn = true; ex.inTime = t; ex.inDate = dt; }
        if (r.action_type === 'OUT') { ex.hasOut = true; ex.outDate = dt; }
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
              hoursWorked = Math.max(0, (attInfo.outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60));
              // Flexible timing: If they worked less than 4 hours (with a tiny buffer), it's incomplete
              if (hoursWorked < 3.9) {
                isIncomplete = true;
              }
           } else if (ds === todayStr) {
              // Checked in today and currently active: calculate live elapsed hours
              hoursWorked = Math.max(0, (Date.now() - inDate.getTime()) / (1000 * 60 * 60));
           } else if (!isFuture && ds !== todayStr) {
              // If they forgot to check out on a past day, count standard 5h
              hoursWorked = 5;
              isIncomplete = false;
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

  const submitLeave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!leaveData.start_datetime || !leaveData.end_datetime) {
      showToast('Please select From and To date & time.');
      return;
    }
    try {
      await authFetch('/api/leaves', {
        method: 'POST',
        body: JSON.stringify({
          member_id: leaveData.member_id || user?.id,
          leave_type: leaveData.leave_type,
          start_date: leaveData.start_datetime,
          end_date: leaveData.end_datetime,
          reason: leaveData.reason || ''
        }),
      });
      setShowLeaveModal(false);
      setLeaveData({ member_id: '', leave_type: 'SICK', start_datetime: '', end_datetime: '', reason: '' });
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
          {/* Leave Request button - Employee only */}
          {!isAdmin && (
            <button className="btn btn-primary" onClick={() => setShowLeaveModal(true)}>
              <Plus size={15} /> Leave Request
            </button>
          )}
        </div>
      </Topbar>

      <div className="scroll">

        {/* Date navigator — below page header */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
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
        </div>

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

        {/* Auto Attendance Setup Modal — Glassmorphism, intuitive OS switcher, copy state */}
        {showSetupModal && (() => {
          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          const winCmd = `Set-ExecutionPolicy Bypass -Scope Process -Force; $d="$env:LOCALAPPDATA\\AlliedOneERP"; if(!(Test-Path $d)){New-Item -ItemType Directory -Path $d | Out-Null}; Invoke-WebRequest -Uri "${origin}/api/attendance/download-script?os=ps1&token=${token || ''}" -OutFile "$d\\aol-attendance.ps1"; $vs='Set WshShell = CreateObject("WScript.Shell"):WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File """&WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")&"\\AlliedOneERP\\aol-attendance.ps1""", 0, False'; $vs | Out-File "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\AlliedOneAttendance.vbs"; Start-Process wscript "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\AlliedOneAttendance.vbs"; Write-Host 'Done!' -ForegroundColor Green`;
          
          const macCmd = `curl -s "${origin}/api/attendance/download-script?os=mac&token=${token || ''}" -o ~/AlliedOne-Attendance.sh && chmod +x ~/AlliedOne-Attendance.sh && ~/AlliedOne-Attendance.sh`;

          const activeCmd = setupOs === 'windows' ? winCmd : macCmd;

          const handleCopy = () => {
            navigator.clipboard.writeText(activeCmd).then(() => {
              setCopiedCmd(true);
              showToast('Copied setup command to clipboard!');
              setTimeout(() => setCopiedCmd(false), 3000);
            });
          };

          return (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(5, 7, 13, 0.8)',
                backdropFilter: 'blur(8px)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                padding: '0'
              }}
              onClick={() => { setShowSetupModal(false); setCopiedCmd(false); }}
            >
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '24px 24px 0 0',
                  padding: '24px 20px 32px',
                  width: '100%',
                  maxWidth: '520px',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  boxShadow: '0 -12px 48px rgba(0,0,0,0.6)'
                }}
                onClick={e => e.stopPropagation()}
              >
                {/* Top Drag Handle */}
                <div style={{ width: 44, height: 4, background: 'var(--border)', borderRadius: 4, margin: '0 auto 20px', opacity: 0.8 }} />

                {/* Modal Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      background: 'linear-gradient(135deg, rgba(79, 126, 255, 0.25), rgba(79, 126, 255, 0.05))',
                      border: '1px solid rgba(79, 126, 255, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--primary)',
                      boxShadow: '0 4px 16px rgba(79, 126, 255, 0.15)'
                    }}>
                      <Laptop size={22} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        Auto Attendance Setup
                        <span style={{ fontSize: '.62rem', background: 'rgba(38,196,134,0.15)', color: 'var(--green)', border: '1px solid rgba(38,196,134,0.3)', padding: '2px 8px', borderRadius: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                          Self-updating
                        </span>
                      </div>
                      <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 2 }}>
                        One-time background setup for your laptop
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowSetupModal(false); setCopiedCmd(false); }}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border)',
                      color: 'var(--muted)',
                      borderRadius: '50%',
                      width: 32,
                      height: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* OS Switcher Segmented Control */}
                <div style={{
                  display: 'flex',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 3,
                  marginBottom: 20
                }}>
                  <button
                    onClick={() => { setSetupOs('windows'); setCopiedCmd(false); }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 9,
                      fontSize: '.82rem',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      transition: 'all 0.2s',
                      background: setupOs === 'windows' ? 'var(--primary)' : 'transparent',
                      color: setupOs === 'windows' ? '#fff' : 'var(--muted)',
                      boxShadow: setupOs === 'windows' ? '0 2px 8px rgba(79,126,255,0.3)' : 'none'
                    }}
                  >
                    <Laptop size={15} /> Windows (PowerShell)
                  </button>
                  <button
                    onClick={() => { setSetupOs('mac'); setCopiedCmd(false); }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 9,
                      fontSize: '.82rem',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      transition: 'all 0.2s',
                      background: setupOs === 'mac' ? 'var(--primary)' : 'transparent',
                      color: setupOs === 'mac' ? '#fff' : 'var(--muted)',
                      boxShadow: setupOs === 'mac' ? '0 2px 8px rgba(79,126,255,0.3)' : 'none'
                    }}
                  >
                    <Terminal size={15} /> Mac / Linux (.sh)
                  </button>
                </div>

                {/* OS Step-by-Step Instructions */}
                {setupOs === 'windows' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                    {/* Step 1 */}
                    <div style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      padding: '12px 14px'
                    }}>
                      <div style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'rgba(79,126,255,0.15)',
                        border: '1px solid rgba(79,126,255,0.3)',
                        color: 'var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '.75rem',
                        fontWeight: 700,
                        flexShrink: 0
                      }}>
                        1
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text)' }}>
                          Open Terminal as Administrator
                        </div>
                        <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 2, lineHeight: 1.45 }}>
                          Press <kbd style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--border)', padding: '1px 5px', borderRadius: 4, fontSize: '.7rem', color: 'var(--text)' }}>Win + X</kbd> on keyboard and select <strong>Terminal (Admin)</strong> or <strong>PowerShell (Admin)</strong>.
                        </div>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      padding: '12px 14px'
                    }}>
                      <div style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'rgba(79,126,255,0.15)',
                        border: '1px solid rgba(79,126,255,0.3)',
                        color: 'var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '.75rem',
                        fontWeight: 700,
                        flexShrink: 0
                      }}>
                        2
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text)' }}>
                          Copy One-Liner Command
                        </div>
                        <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 2, lineHeight: 1.45 }}>
                          Click the main button below to copy the setup script.
                        </div>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      padding: '12px 14px'
                    }}>
                      <div style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'rgba(38,196,134,0.15)',
                        border: '1px solid rgba(38,196,134,0.3)',
                        color: 'var(--green)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '.75rem',
                        fontWeight: 700,
                        flexShrink: 0
                      }}>
                        3
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text)' }}>
                          Paste & Press Enter
                        </div>
                        <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 2, lineHeight: 1.45 }}>
                          Right-click in PowerShell window to paste, press <kbd style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--border)', padding: '1px 5px', borderRadius: 4, fontSize: '.7rem', color: 'var(--text)' }}>Enter</kbd>. Done!
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                    {/* Mac Step 1 */}
                    <div style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      padding: '12px 14px'
                    }}>
                      <div style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'rgba(79,126,255,0.15)',
                        border: '1px solid rgba(79,126,255,0.3)',
                        color: 'var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '.75rem',
                        fontWeight: 700,
                        flexShrink: 0
                      }}>
                        1
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text)' }}>
                          Open Mac Terminal
                        </div>
                        <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 2, lineHeight: 1.45 }}>
                          Press <kbd style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--border)', padding: '1px 5px', borderRadius: 4, fontSize: '.7rem', color: 'var(--text)' }}>Cmd + Space</kbd>, type <strong>Terminal</strong>, and press Enter.
                        </div>
                      </div>
                    </div>

                    {/* Mac Step 2 */}
                    <div style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      padding: '12px 14px'
                    }}>
                      <div style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'rgba(79,126,255,0.15)',
                        border: '1px solid rgba(79,126,255,0.3)',
                        color: 'var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '.75rem',
                        fontWeight: 700,
                        flexShrink: 0
                      }}>
                        2
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text)' }}>
                          Run Terminal Setup Command
                        </div>
                        <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 2, lineHeight: 1.45 }}>
                          Copy the terminal curl command below and paste it into Terminal.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Code Preview snippet */}
                <div style={{
                  background: '#090b12',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '10px 12px',
                  marginBottom: 16,
                  fontFamily: 'monospace',
                  fontSize: '.72rem',
                  color: 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10
                }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85 }}>
                    {activeCmd}
                  </div>
                  <button
                    onClick={handleCopy}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      borderRadius: 6,
                      padding: '4px 8px',
                      fontSize: '.7rem',
                      cursor: 'pointer',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    {copiedCmd ? <Check size={12} color="var(--green)" /> : <Copy size={12} />}
                    {copiedCmd ? 'Copied' : 'Copy'}
                  </button>
                </div>

                {/* Big Copy Button */}
                <button
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    gap: 10,
                    padding: '14px 20px',
                    fontSize: '.95rem',
                    fontWeight: 700,
                    borderRadius: 14,
                    background: copiedCmd ? 'var(--green)' : 'var(--primary)',
                    color: copiedCmd ? '#0d0f18' : '#fff',
                    boxShadow: copiedCmd ? '0 4px 20px rgba(38,196,134,0.4)' : '0 4px 20px rgba(79,126,255,0.4)',
                    transition: 'all 0.2s'
                  }}
                  onClick={handleCopy}
                >
                  {copiedCmd ? (
                    <>
                      <Check size={18} /> Copied to Clipboard!
                    </>
                  ) : (
                    <>
                      <Copy size={18} /> Copy Setup Command
                    </>
                  )}
                </button>

                {/* Additional Direct File Download Link for Mac */}
                {setupOs === 'mac' && (
                  <a
                    href={`/api/attendance/download-script?os=mac&token=${token || ''}`}
                    download={`AlliedOne-Attendance-${(user?.name || 'Employee').replace(/[^a-zA-Z0-9]/g, '_')}.sh`}
                    className="btn btn-ghost"
                    style={{
                      width: '100%',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '10px 20px',
                      fontSize: '.82rem',
                      marginTop: 10,
                      borderRadius: 12,
                      textDecoration: 'none'
                    }}
                  >
                    <Download size={14} /> Download Direct .sh File
                  </a>
                )}

                {/* Security badges */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 16,
                  marginTop: 18,
                  fontSize: '.68rem',
                  color: 'var(--muted)',
                  borderTop: '1px solid var(--border)',
                  paddingTop: 14
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ShieldCheck size={13} color="var(--green)" /> Safe & Tokenized
                  </span>
                  <span>•</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Zap size={13} color="var(--orange)" /> Zero CPU process
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Tabs: Team | Individual | Leave Request */}
        <div className="tabs">
          <div className={'tab ' + (activeTab === 'att' ? 'on' : '')} onClick={() => setActiveTab('att')}>
            Team
          </div>
          {isAdmin && (
            <div className={'tab ' + (activeTab === 'report' ? 'on' : '')} onClick={() => setActiveTab('report')}>
              Individual
            </div>
          )}
          <div className={'tab ' + (activeTab === 'leave' ? 'on' : '')} onClick={() => setActiveTab('leave')}>
            Leave Request
            {pendingLeaves > 0 && (
              <span style={{ marginLeft: 6, background: 'var(--orange)', color: '#0d0f18', fontSize: '.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 10, verticalAlign: 'middle' }}>
                {pendingLeaves}
              </span>
            )}
          </div>
        </div>

        {/* Team tab — cumulative attendance table */}
        {activeTab === 'att' && (
          <div className="card">
            <div className="card-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
              <h3>Team Attendance</h3>

              {(() => {
                const now = new Date(curDate + 'T00:00:00');
                const year = now.getFullYear();
                const month = now.getMonth();

                // Elapsed working days up to and including curDate
                let elapsedWorkingDays = 0;
                const totalDays = daysInMonth(year, month);
                const curDay = now.getDate();
                for (let i = 1; i <= Math.min(curDay, totalDays); i++) {
                  const dow = new Date(year, month, i).getDay();
                  if (dow !== 5 && dow !== 6) elapsedWorkingDays++;
                }
                // Required hours so far (5h per working day elapsed)
                const elapsedRequiredHours = elapsedWorkingDays * 5;

                // Process monthly cumulative stats per member (up to curDate)
                const monthlyStats = new Map<number, { daysPresent: number; totalHours: number }>();
                const mGroups = new Map<string, any>();
                const todayStr = todayDhaka();

                // Merge monthly summary with today's live attendance
                const allAttRecords = [...monthSum];
                att.forEach(a => {
                  if (!allAttRecords.some(m => m.id === a.id)) {
                    allAttRecords.push(a);
                  }
                });

                allAttRecords.forEach(m => {
                  if (!isAdmin && String(m.member_id) !== String(user?.id)) return;
                  const rawTs = m.timestamp;
                  const dt = typeof rawTs === 'string' ? parseTimestamp(rawTs) : new Date(rawTs);
                  const d = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
                  // Only count up to curDate
                  if (d > curDate) return;
                  const key = `${m.member_id}_${d}`;
                  const ex = mGroups.get(key) || { inRaw: null, outRaw: null };
                  if (m.action_type === 'IN') ex.inRaw = dt;
                  if (m.action_type === 'OUT') ex.outRaw = dt;
                  mGroups.set(key, ex);
                });

                mGroups.forEach((val, key) => {
                  const parts = key.split('_');
                  const mId = parseInt(parts[0] || '0', 10);
                  const d = parts[1] || '';
                  const s = monthlyStats.get(mId) || { daysPresent: 0, totalHours: 0 };
                  if (val.inRaw) s.daysPresent++;
                  if (val.inRaw && val.outRaw) {
                    s.totalHours += Math.max(0, (val.outRaw.getTime() - val.inRaw.getTime()) / (1000 * 60 * 60));
                  } else if (val.inRaw && !val.outRaw) {
                    if (d === todayStr) {
                      // Active check-in today: calculate live elapsed hours worked
                      const elapsedHrs = (Date.now() - val.inRaw.getTime()) / (1000 * 60 * 60);
                      s.totalHours += Math.max(0, elapsedHrs);
                    } else if (d < todayStr) {
                      // Past day missing checkout: credit standard 5h
                      s.totalHours += 5;
                    }
                  }
                  monthlyStats.set(mId, s);
                });

                // Process today's attendance records for leave lookup
                const agg = new Map<number, any>();
                att.forEach(a => {
                  if (!isAdmin && String(a.member_id) !== String(user?.id)) return;
                  const ex = agg.get(a.member_id) || { member_id: a.member_id, name: a.member_name || 'Unknown', color: a.avatar_color, inRaw: null, outRaw: null, leave: null };
                  const dt = parseTimestamp(a.timestamp);
                  if (a.action_type === 'IN') ex.inRaw = dt;
                  if (a.action_type === 'OUT') ex.outRaw = dt;
                  agg.set(a.member_id, ex);
                });

                // Also include members who have monthly history but no today entry
                monthlyStats.forEach((_, mId) => {
                  if (!agg.has(mId)) {
                    const memberObj = members.find(m => String(m.id) === String(mId));
                    if (memberObj && memberObj.role !== 'Admin') {
                      agg.set(mId, { member_id: mId, name: memberObj.name, color: memberObj.avatar_color, inRaw: null, outRaw: null, leave: null });
                    }
                  }
                });

                agg.forEach((ex, mId) => {
                  const leave = leaves.find(l =>
                    String(l.member_id) === String(mId) &&
                    new Date(l.start_date + 'T00:00:00') <= new Date(curDate + 'T00:00:00') &&
                    new Date(l.end_date + 'T00:00:00') >= new Date(curDate + 'T00:00:00')
                  );
                  if (leave) ex.leave = `${leave.leave_type} (${leave.status})`;
                });

                const list = Array.from(agg.values()).filter(i => {
                  const memberObj = members.find(m => String(m.id) === String(i.member_id));
                  if (memberObj) return memberObj.role !== 'Admin';
                  if (i.name && i.name.toLowerCase().includes('ahsan')) return false;
                  return true;
                });

                return (
                  <div style={{ width: '100%', overflowX: 'hidden' }}>
                    <table className="hr-compact-table" style={{ width: '100%', minWidth: '0px', maxWidth: '100%', fontSize: '.75rem', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                      <colgroup>
                        <col style={{ width: '16%' }} />
                        <col style={{ width: '32%' }} />
                        <col style={{ width: '28%' }} />
                        <col style={{ width: '24%' }} />
                      </colgroup>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={{ padding: '6px 2px', textAlign: 'center', fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Emp</th>
                          <th style={{ padding: '6px 2px', textAlign: 'center', fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Hours</th>
                          <th style={{ padding: '6px 2px', textAlign: 'center', fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Day</th>
                          <th style={{ padding: '6px 2px', textAlign: 'center', fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Leave</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.length === 0 ? (
                          <tr className="empty-r"><td colSpan={4}>No records for this date.</td></tr>
                        ) : (
                          list.map((l, idx) => {
                            const stats = monthlyStats.get(l.member_id) || { daysPresent: 0, totalHours: 0 };
                            return (
                              <tr key={idx}>
                                {/* Emp Initials Avatar */}
                                <td style={{ padding: '6px 2px', textAlign: 'center' }}>
                                  <div
                                    style={{
                                      background: l.color || '#4f7eff',
                                      width: '26px',
                                      height: '26px',
                                      borderRadius: '6px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '.7rem',
                                      fontWeight: 700,
                                      color: '#fff',
                                      letterSpacing: '0.5px',
                                      boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                                      cursor: 'default',
                                    }}
                                    title={l.name}
                                  >
                                    {getInitials(l.name)}
                                  </div>
                                </td>
                                {/* Hours: cumulative worked / elapsed required (5h/day) */}
                                <td style={{ padding: '6px 2px', textAlign: 'center', fontSize: '.72rem', whiteSpace: 'nowrap' }}>
                                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                                    {stats.totalHours >= 10 ? Math.round(stats.totalHours) : Number(stats.totalHours.toFixed(1))}
                                  </span>
                                  <span style={{ color: 'var(--muted)', fontSize: '.64rem' }}>/{elapsedRequiredHours}h</span>
                                </td>
                                {/* Day: cumulative present / elapsed working days */}
                                <td style={{ padding: '6px 2px', textAlign: 'center', fontSize: '.72rem', whiteSpace: 'nowrap' }}>
                                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                                    {stats.daysPresent}
                                  </span>
                                  <span style={{ color: 'var(--muted)', fontSize: '.64rem' }}>/{elapsedWorkingDays}</span>
                                </td>
                                {/* Leave badge */}
                                <td style={{ padding: '6px 2px', textAlign: 'center' }}>
                                  {l.leave ? (
                                    <span
                                      className="badge"
                                      style={{
                                        background: l.leave.includes('APPROVED') ? 'rgba(38,196,134,0.15)' : 'rgba(255,140,0,0.15)',
                                        color: l.leave.includes('APPROVED') ? 'var(--green)' : '#FF8C00',
                                        border: `1px solid ${l.leave.includes('APPROVED') ? 'rgba(38,196,134,0.3)' : 'rgba(255,140,0,0.3)'}`,
                                        fontSize: '.62rem',
                                        padding: '2px 4px',
                                        borderRadius: '4px',
                                        whiteSpace: 'nowrap',
                                        display: 'inline-block'
                                      }}
                                    >
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
                );
              })()}
            </div>
          </div>
        )}

        {/* Leave Request tab */}
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
                        <td style={{ color: 'var(--muted)', fontSize: '.76rem' }}>
                          {(() => {
                            const fmt = (s: string) => {
                              if (!s) return '';
                              if (s.includes('T')) {
                                const parts = s.split('T');
                                const dParts = (parts[0] || '').split('-');
                                return `${dParts[2] || ''}-${dParts[1] || ''}-${dParts[0] || ''} ${parts[1] || ''}`.trim();
                              }
                              if (s.includes('-')) {
                                const dParts = s.split('-');
                                return `${dParts[2] || ''}-${dParts[1] || ''}-${dParts[0] || ''}`;
                              }
                              return s;
                            };
                            return `${fmt(l.start_date)} to ${fmt(l.end_date)}`;
                          })()}
                        </td>
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

        {/* Individual Monthly Report - Admin only */}
        {activeTab === 'report' && isAdmin && (
          <div className="card">
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
              {reportMemberId && calDays.length > 0 && (() => {
                const totalPresent = calDays.filter(d => d.isPresent).length;
                const totalAbsent = calDays.filter(d => d.isAbsent).length;
                const totalLate = calDays.filter(d => d.isIncomplete).length;
                const totalApprLeave = calDays.filter(d => d.isLeave && d.leaveStatus === 'APPROVED').length;
                const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
                const calMonthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
                // Elapsed working days up to today (or end of month if viewing past month)
                let elapsedWorkingDays = 0;
                const totalMonthDays = daysInMonth(calYear, calMonth);
                const cutoffDay = calMonthStr < todayStr.substring(0, 7)
                  ? totalMonthDays  // past month: all working days
                  : parseInt(todayStr.split('-')[2] || '1', 10); // current month: up to today
                for (let i = 1; i <= Math.min(cutoffDay, totalMonthDays); i++) {
                  const dow = new Date(calYear, calMonth, i).getDay();
                  if (dow !== 5 && dow !== 6) elapsedWorkingDays++;
                }
                const elapsedRequiredHours = elapsedWorkingDays * 5;
                const totalHours = calDays.reduce((sum, d) => sum + (d.hoursWorked || 0), 0);
                const stats = [
                  { label: 'Present',      val: totalPresent,   color: 'var(--green)', dotBg: '#26C486', dotShadow: 'rgba(38,196,134,0.6)' },
                  { label: 'Absent',       val: totalAbsent,    color: 'var(--red)',   dotBg: '#F25C7A', dotShadow: 'rgba(242,92,122,0.6)' },
                  { label: 'Late',         val: totalLate,      color: '#FF8C00',      dotBg: '#FF8C00', dotShadow: 'rgba(255,140,0,0.7)' },
                  { label: 'Appr. Leave', val: totalApprLeave, color: '#2979FF',      dotBg: '#2979FF', dotShadow: 'rgba(41,121,255,0.6)' },
                ];
                return (
                  <div style={{ padding: '0 18px 20px' }}>
                    {/* Days / Hours row — cumulative x/elapsed */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 10 }}
                         className="cal-stats-grid">
                      <div className="s-card" style={{ textAlign: 'center' }}>
                        <div className="s-lbl">Total Days</div>
                        <div className="s-val" style={{ color: 'var(--green)', fontSize: '1.4rem' }}>
                          {totalPresent}<span style={{ fontSize: '.85rem', color: 'var(--muted)', fontWeight: 'normal' }}>/{elapsedWorkingDays}</span>
                        </div>
                      </div>
                      <div className="s-card" style={{ textAlign: 'center' }}>
                        <div className="s-lbl">Total Hours</div>
                        <div className="s-val" style={{ color: 'var(--primary)', fontSize: '1.4rem' }}>
                          {Math.round(totalHours)}<span style={{ fontSize: '.85rem', color: 'var(--muted)', fontWeight: 'normal' }}>/{elapsedRequiredHours}h</span>
                        </div>
                      </div>
                    </div>
                    {/* Breakdown row with colored dots */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}
                         className="cal-stats-grid">
                      {stats.map(({ label, val, color, dotBg, dotShadow }) => (
                        <div key={label} className="s-card" style={{ textAlign: 'center' }}>
                          <div className="s-lbl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                            <span style={{
                              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                              background: dotBg, boxShadow: `0 0 6px ${dotShadow}`, flexShrink: 0
                            }} />
                            {label}
                          </div>
                          <div className="s-val" style={{ color, fontSize: '1.3rem' }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Export as Picture button at the bottom */}
            {reportMemberId && calDays.length > 0 && (
              <div style={{ padding: '10px 18px 20px', display: 'flex', justifyContent: 'center' }}>
                <button
                  className="btn btn-primary"
                  onClick={downloadImage}
                  style={{ width: '100%', maxWidth: '360px', justifyContent: 'center', gap: 8, padding: '12px 18px', fontSize: '.88rem' }}
                >
                  <ImageIcon size={15} /> Export as Picture (PNG)
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* FAB for Leave Request */}
      {(!isAdmin || activeTab === 'leave') && (
        <button
          id="leave-fab"
          onClick={() => {
            const today = todayDhaka();
            setLeaveData({
              member_id: user?.id ? String(user.id) : '',
              leave_type: 'SICK',
              start_datetime: `${today}T09:00`,
              end_datetime: `${today}T18:00`,
              reason: ''
            });
            setShowLeaveModal(true);
          }}
          title="New Leave Request"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 800,
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'var(--primary)',
            color: '#fff',
            border: 'none',
            fontSize: '1.8rem',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(79,126,255,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}
        >
          +
        </button>
      )}

      {/* Leave Request Bottom Sheet / Modal */}
      {showLeaveModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowLeaveModal(false); }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 920,
            background: 'rgba(0,0,0,.7)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '20px 20px 0 0',
              width: '100%',
              maxWidth: 520,
              paddingBottom: 'env(safe-area-inset-bottom, 16px)',
              maxHeight: '90dvh',
              overflowY: 'auto',
              boxShadow: '0 -8px 40px rgba(0,0,0,.5)',
              animation: 'slideSheet .22s ease-out'
            }}
          >
            {/* Top Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
            </div>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 14px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>New Leave Request</h3>
              <button
                onClick={() => setShowLeaveModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1, padding: 4 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={submitLeave} style={{ padding: '0 20px 24px' }}>
              {/* Employee selection (Admin) or current user display */}
              <div className="fg">
                <label>Employee</label>
                {isAdmin ? (
                  <select
                    value={leaveData.member_id || user?.id || ''}
                    onChange={e => setLeaveData({ ...leaveData, member_id: e.target.value })}
                  >
                    <option value={user?.id || ''}>{user?.name} (You)</option>
                    {[...members].sort((a,b) => a.name.localeCompare(b.name)).map(m => (
                      m.id !== user?.id && <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                    ))}
                  </select>
                ) : (
                  <input type="text" value={user?.name || ''} disabled style={{ opacity: 0.8, cursor: 'not-allowed' }} />
                )}
              </div>

              {/* Leave Type */}
              <div className="fg">
                <label>Leave Type</label>
                <select
                  value={leaveData.leave_type}
                  onChange={e => setLeaveData({ ...leaveData, leave_type: e.target.value })}
                  required
                >
                  <option value="SICK">Sick Leave</option>
                  <option value="PERSONAL">Personal Leave</option>
                  <option value="EXAM">Exam / Study Leave</option>
                  <option value="CASUAL">Casual Leave</option>
                  <option value="VACATION">Vacation Leave</option>
                </select>
              </div>

              {/* From & To in the SAME ROW with Date & Time picker */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>From (Date & Time)</label>
                  <input
                    type="datetime-local"
                    value={leaveData.start_datetime}
                    onChange={e => setLeaveData({ ...leaveData, start_datetime: e.target.value })}
                    required
                  />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>To (Date & Time)</label>
                  <input
                    type="datetime-local"
                    value={leaveData.end_datetime}
                    min={leaveData.start_datetime}
                    onChange={e => setLeaveData({ ...leaveData, end_datetime: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Reason / Notes */}
              <div className="fg">
                <label>Reason / Notes <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
                <textarea
                  rows={2}
                  placeholder="Reason or details for leave..."
                  value={leaveData.reason}
                  onChange={e => setLeaveData({ ...leaveData, reason: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: 'rgba(79,126,255,.08)', border: '1px solid rgba(79,126,255,.18)', fontSize: '.76rem', color: 'var(--muted)' }}>
                Your request will be submitted for Admin review.
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: '.95rem', fontWeight: 700, borderRadius: 10 }}
              >
                Submit Leave Request
              </button>
            </form>
          </div>
        </div>
      )}

      {toastMsg && <div className="toast on">{toastMsg}</div>}
    </>
  );
}