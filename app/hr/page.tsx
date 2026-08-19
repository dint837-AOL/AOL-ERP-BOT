/**
 * HR & Attendance Management Module
 *
 * Role-based layout:
 *  - Employee: sees check-in/out widget (own name pre-filled), their own leave requests, leave submit
 *  - Admin: sees full attendance log, all leave requests with approve/reject, monthly attendance calendar
 *
 * Check-in/out is system-recorded (accurate UTC timestamp converted to local time).
 * Monthly calendar uses traffic-light coloring: Green=Present, Red=Absent, Yellow=On Leave.
 * Fridays and Saturdays are shaded as weekends/holidays.
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { LogIn, LogOut, Plus, ChevronLeft, ChevronRight, X, Calendar, Download, BarChart2 } from 'lucide-react';
import Topbar from '../components/Topbar';
import { useAuth } from '../context/AuthContext';

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
  const s = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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

  return (
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

        const dayNum = parseInt(cell.date.split('-')[2] || '0');
        const tip = cell.isPresent
          ? `Present - In: ${cell.checkInTime || '-'}  Out: ${cell.checkOutTime || '-'}`
          : cell.isLeave
            ? `Leave: ${cell.leaveType} (${cell.leaveStatus})`
            : cell.isWeekend ? 'Weekend' : cell.isAbsent ? 'Absent' : '';

        return (
          <div key={cell.date} className={cls} title={tip}>
            <span className="cal-day-num">{dayNum}</span>
            {cell.isPresent && <span className="cal-dot green-dot" />}
            {cell.isLeave && <span className="cal-dot yellow-dot" />}
            {cell.isAbsent && <span className="cal-dot red-dot" />}
          </div>
        );
      })}
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

  const [activeTab, setActiveTab] = useState<'att' | 'leave'>('att');
  const [attLoading, setAttLoading] = useState(false);

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveData, setLeaveData] = useState({ leave_type: 'SICK', start_date: '', end_date: '', reason: '' });

  const [reportMemberId, setReportMemberId] = useState('');
  const nowJS = new Date();
  const [calYear, setCalYear] = useState(nowJS.getFullYear());
  const [calMonth, setCalMonth] = useState(nowJS.getMonth());
  const [calDays, setCalDays] = useState<CalDay[]>([]);
  const [calLoading, setCalLoading] = useState(false);

  const [toastMsg, setToastMsg] = useState('');

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
      const [mRes, aRes, lRes] = await Promise.all([
        authFetch('/api/members').then(r => r.json()),
        authFetch('/api/attendance?date=' + curDate).then(r => r.json()),
        authFetch(leavesUrl).then(r => r.json()),
      ]);
      setMembers(Array.isArray(mRes) ? mRes : []);
      setAtt(Array.isArray(aRes) ? aRes : []);
      setLeaves(Array.isArray(lRes) ? lRes : []);
    } catch (e) { console.error(e); }
  }, [curDate, isAdmin, user?.id, authFetch]);

  useEffect(() => {
    loadAll();
    const iv = setInterval(loadAll, 30000);
    return () => clearInterval(iv);
  }, [loadAll]);

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

      const attMap = new Map<string, { hasIn: boolean; hasOut: boolean; inTime: string; outTime: string }>();
      attRows.forEach((r: any) => {
        const d = r.att_date as string;
        const ex = attMap.get(d) || { hasIn: false, hasOut: false, inTime: '', outTime: '' };
        const t = formatTime(r.timestamp);
        if (r.action_type === 'IN') { ex.hasIn = true; ex.inTime = t; }
        if (r.action_type === 'OUT') { ex.hasOut = true; ex.outTime = t; }
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
        days.push({
          date: ds,
          isWeekend,
          isPresent,
          isLeave: isLeaveDay && !isPresent,
          isAbsent: !isWeekend && !isPresent && !isLeaveDay && !isFuture,
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
        body: JSON.stringify({ ...leaveData, member_id: user?.id }),
      });
      setShowLeaveModal(false);
      setLeaveData({ leave_type: 'SICK', start_date: '', end_date: '', reason: '' });
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
      showToast(status === 'APPROVED' ? 'Leave approved' : 'Leave rejected');
      await loadAll();
    } catch { showToast('Cannot reach server.'); }
  };

  const downloadReport = () => {
    const emp = members.find(m => String(m.id) === String(reportMemberId));
    const empName = emp?.name || 'Employee';
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const header = ['Date', 'Day', 'Status', 'Check-In', 'Check-Out'];
    const rows = calDays.map(d => {
      const dow = new Date(d.date + 'T00:00:00').getDay();
      const dayName = DAYS[dow] ?? '';
      const status = d.isWeekend
        ? 'Weekend'
        : d.isPresent
          ? 'Present'
          : d.isLeave
            ? `Leave (${d.leaveType}-${d.leaveStatus})`
            : d.isAbsent
              ? 'Absent'
              : 'N/A';
      return [`"=${d.date}"`, dayName, status, d.checkInTime || '', d.checkOutTime || ''];
    });
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${empName.replace(/\s+/g, '_')}_${calYear}-${String(calMonth + 1).padStart(2, '0')}_Attendance.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Report downloaded.');
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
        </div>

        {/* Attendance log */}
        {activeTab === 'att' && (
          <div className="card">
            <div className="card-head">
              <h3>Check-In / Check-Out Log</h3>
              <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>{fmtDateLabel(curDate)}</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Action</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {att.filter(a => isAdmin || String(a.member_id) === String(user?.id)).length === 0 ? (
                    <tr className="empty-r"><td colSpan={3}>No records for this date.</td></tr>
                  ) : (
                    att
                      .filter(a => isAdmin || String(a.member_id) === String(user?.id))
                      .map((a: any) => (
                        <tr key={a.id}>
                          <td>
                            <div className="av-cell">
                              <div className="av" style={{ background: a.avatar_color || '#4f7eff' }}>
                                {(a.member_name || '?')[0].toUpperCase()}
                              </div>
                              <div>{a.member_name || 'Unknown'}</div>
                            </div>
                          </td>
                          <td><span className={'badge ' + a.action_type}>{a.action_type}</span></td>
                          <td style={{ color: 'var(--muted)' }}>
                            {formatTime(a.timestamp)}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
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
                          <span className={'badge ' + (l.status === 'APPROVED' ? 'APPROVED' : l.status === 'REJECTED' ? 'REJECTED' : 'PENDING')}>
                            {l.status}
                          </span>
                        </td>
                        {isAdmin && (
                          <td>
                            {l.status === 'PENDING' ? (
                              <>
                                <button className="btn btn-green btn-sm" style={{ marginRight: 4 }} onClick={() => reviewLeave(l.id, 'APPROVED')}>Approve</button>
                                <button className="btn btn-red btn-sm" onClick={() => reviewLeave(l.id, 'REJECTED')}>Reject</button>
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

        {/* Summary cards - bottom */}
        <div className="stats" style={{ marginTop: 4 }}>
          <div className="s-card">
            <div className="s-lbl">Present Today</div>
            <div className="s-val" style={{ color: 'var(--green)' }}>{presentCount}</div>
          </div>
          <div className="s-card">
            <div className="s-lbl">Pending Leaves</div>
            <div className="s-val" style={{ color: 'var(--orange)' }}>{pendingLeaves}</div>
          </div>
          <div className="s-card">
            <div className="s-lbl">Total Members</div>
            <div className="s-val" style={{ color: 'var(--primary)' }}>{members.length}</div>
          </div>
        </div>

        {/* Monthly Report - Admin only */}
        {isAdmin && (
          <div className="card" style={{ marginTop: 8 }}>
            <div className="card-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart2 size={17} style={{ color: 'var(--primary)' }} />
                <h3>Monthly Attendance Report</h3>
              </div>
              {reportMemberId && calDays.length > 0 && (
                <button className="btn btn-primary btn-sm" onClick={downloadReport}>
                  <Download size={13} /> Download CSV
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
                  {members.filter(m => m.role !== 'Admin').map(m => (
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

            {/* Legend */}
            <div style={{ padding: '10px 18px', display: 'flex', gap: 20, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,.08)' }}>
              {[
                { cls: 'cal-dot green-dot', label: 'Present' },
                { cls: 'cal-dot red-dot', label: 'Absent' },
                { cls: 'cal-dot yellow-dot', label: 'On Leave' },
              ].map(({ cls, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '.76rem', color: 'var(--muted)' }}>
                  <span className={cls} style={{ flexShrink: 0 }} />{label}
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '.76rem', color: 'var(--muted)' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(255,255,255,.035)', border: '1px solid var(--border)', display: 'inline-block', flexShrink: 0 }} />
                Weekend (Fri/Sat)
              </div>
            </div>

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
                  { label: 'Present', val: calDays.filter(d => d.isPresent).length, color: 'var(--green)' },
                  { label: 'Absent', val: calDays.filter(d => d.isAbsent).length, color: 'var(--red)' },
                  { label: 'On Leave', val: calDays.filter(d => d.isLeave).length, color: 'var(--orange)' },
                  { label: 'Weekends', val: calDays.filter(d => d.isWeekend).length, color: 'var(--muted)' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="s-card" style={{ textAlign: 'center' }}>
                    <div className="s-lbl">{label}</div>
                    <div className="s-val" style={{ color, fontSize: '1.4rem' }}>{val}</div>
                  </div>
                ))}
              </div>
            )}
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
            <div style={{ marginBottom: 14, padding: '9px 12px', background: 'var(--card)', borderRadius: 8, fontSize: '.82rem', color: 'var(--muted)' }}>
              Submitting as: <strong style={{ color: 'var(--text)' }}>{user?.name}</strong>
            </div>
            <div className="fg">
              <label>Leave Type</label>
              <select value={leaveData.leave_type} onChange={e => setLeaveData({ ...leaveData, leave_type: e.target.value })}>
                <option value="SICK">Sick Leave</option>
                <option value="CASUAL">Casual Leave</option>
                <option value="ANNUAL">Annual Leave</option>
              </select>
            </div>
            <div className="drow">
              <div className="fg">
                <label>From</label>
                <input type="date" value={leaveData.start_date} onChange={e => setLeaveData({ ...leaveData, start_date: e.target.value })} />
              </div>
              <div className="fg">
                <label>To</label>
                <input type="date" value={leaveData.end_date} min={leaveData.start_date} onChange={e => setLeaveData({ ...leaveData, end_date: e.target.value })} />
              </div>
            </div>
            <div className="fg">
              <label>Reason</label>
              <textarea placeholder="Optional reason..." value={leaveData.reason} onChange={e => setLeaveData({ ...leaveData, reason: e.target.value })} />
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