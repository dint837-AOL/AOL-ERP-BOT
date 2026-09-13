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
import { LogIn, LogOut, Plus, ChevronLeft, ChevronRight, X, Calendar, Download, BarChart2, Wifi, Laptop, Image as ImageIcon, Terminal, Copy, Check, ShieldCheck, Zap, Bell, BellOff } from 'lucide-react';
import Topbar from '../components/Topbar';
import { useAuth } from '../context/AuthContext';
import html2canvas from 'html2canvas';

const WHITE = '#ffffff';
const MUTED_LABEL = 'rgba(255,255,255,0.55)';
const BLUE = '#4f7eff';
const BLUE_BG = 'rgba(79,126,255,0.15)';
const BLUE_GRAD = 'linear-gradient(135deg, #4f7eff, #6c4fe3)';
const GREEN = '#26c486';
const GREEN_BG = 'rgba(38,196,134,0.15)';
const RED = '#ef4444';
const RED_BG = 'rgba(239,68,68,0.12)';
const AMBER = '#eab308';
const AMBER_BG = 'rgba(234,179,8,0.15)';

const LEAVE_REASONS = [
  { value: 'SICK', label: 'Sick' },
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'EXAM', label: 'Exam / Study' },
  { value: 'CASUAL', label: 'Casual' },
  { value: 'VACATION', label: 'Vacation' },
] as const;

const leaveFieldInputSt: React.CSSProperties = {
  background: '#131722',
  border: '1px solid #2a3050',
  borderRadius: 7,
  color: WHITE,
  fontSize: '0.78rem',
  padding: '6px 9px',
  width: '100%',
  outline: 'none',
  fontFamily: 'inherit',
};
const leaveFieldEditSt: React.CSSProperties = { ...leaveFieldInputSt, border: '1px solid #3a4568' };
const leaveLabelSt: React.CSSProperties = {
  fontSize: '0.62rem',
  color: MUTED_LABEL,
  textTransform: 'uppercase',
  marginBottom: 2,
  fontWeight: 600,
  letterSpacing: '0.04em',
};
const leaveValueSt: React.CSSProperties = {
  color: WHITE,
  fontWeight: 500,
  fontSize: '0.82rem',
  lineHeight: 1.25,
};

type LeaveForm = {
  member_id: string;
  leave_type: string;
  start_datetime: string;
  end_datetime: string;
  reason: string;
  reminder_days: string;
  reminder_hours: string;
  reminder_minutes: string;
};

const BLANK_LEAVE: LeaveForm = {
  member_id: '',
  leave_type: 'SICK',
  start_datetime: '',
  end_datetime: '',
  reason: '',
  reminder_days: '',
  reminder_hours: '',
  reminder_minutes: '',
};

function leaveReasonLabel(type?: string): string {
  const found = LEAVE_REASONS.find(r => r.value === type);
  if (found) return found.label;
  if (!type) return '—';
  return String(type).replace(/\s*leave\s*/gi, '').trim() || type;
}

function dateOnly(s?: string): string {
  if (!s) return '';
  return String(s).split('T')[0].split(' ')[0];
}

function toLeaveLocalInput(raw?: string): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (s.includes('T') && s.length >= 16) return s.slice(0, 16);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T09:00`;
  try {
    const d = new Date(s.includes('T') || s.includes('Z') || s.includes('+') ? s : s + 'Z');
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

function fmtLeaveDateTime(raw?: string): string {
  if (!raw) return '—';
  const local = toLeaveLocalInput(raw);
  if (!local) return String(raw);
  try {
    const [d, t] = local.split('T');
    const [y, m, day] = (d || '').split('-');
    return `${day}/${m}/${y} ${t || ''}`.trim();
  } catch {
    return String(raw);
  }
}

function getLeaveCountdownShort(deadline?: string): string {
  if (!deadline) return '—';
  let s = String(deadline).trim();
  if (!s.includes('T')) s = `${s}T09:00:00+06:00`;
  else if (!s.includes('Z') && !/[+-]\d{2}(:?\d{2})?$/.test(s)) s += '+06:00';
  const diff = new Date(s).getTime() - Date.now();
  if (isNaN(diff) || diff < 0) return '0M';
  const days = Math.floor(diff / 86400000);
  if (days >= 1) return `${days}D`;
  const hours = Math.floor(diff / 3600000);
  if (hours >= 1) return `${hours}H`;
  const mins = Math.max(1, Math.floor(diff / 60000));
  return `${mins}M`;
}

function leaveToForm(l: any): LeaveForm {
  return {
    member_id: String(l.member_id || ''),
    leave_type: l.leave_type || 'SICK',
    start_datetime: toLeaveLocalInput(l.start_date),
    end_datetime: toLeaveLocalInput(l.end_date) || toLeaveLocalInput(l.start_date),
    reason: l.reason || '',
    reminder_days: l.reminder_days != null && Number(l.reminder_days) > 0 ? String(l.reminder_days) : '',
    reminder_hours: l.reminder_hours != null && Number(l.reminder_hours) > 0 ? String(l.reminder_hours) : '',
    reminder_minutes: l.reminder_minutes != null && Number(l.reminder_minutes) > 0 ? String(l.reminder_minutes) : '',
  };
}

function buildLeavePayload(form: LeaveForm) {
  const remDays = form.reminder_days.trim() === '' ? null : Number(form.reminder_days);
  const remHours = form.reminder_hours.trim() === '' ? null : Number(form.reminder_hours);
  const remMins = form.reminder_minutes.trim() === '' ? null : Number(form.reminder_minutes);
  const hasReminder =
    (remDays != null && remDays > 0) ||
    (remHours != null && remHours > 0) ||
    (remMins != null && remMins > 0);
  return {
    member_id: form.member_id,
    leave_type: form.leave_type,
    start_date: form.start_datetime,
    end_date: form.end_datetime,
    reason: form.reason || '',
    reminder_days: remDays,
    reminder_hours: remHours,
    reminder_minutes: remMins,
    notify_email: hasReminder ? 1 : 0,
  };
}

function LeaveFieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <div style={leaveLabelSt}>
      {children}
      {optional ? ' (optional)' : ''}
    </div>
  );
}

function LeaveReminderBoxes({
  form,
  editMode,
  onChange,
}: {
  form: LeaveForm;
  editMode: boolean;
  onChange: (field: keyof LeaveForm, val: string) => void;
}) {
  const box = (label: string, field: 'reminder_days' | 'reminder_hours' | 'reminder_minutes', ph: string) => (
    <div style={{ flex: 1 }}>
      <div style={{ ...leaveLabelSt, marginBottom: 2 }}>{label}</div>
      {editMode ? (
        <input
          type="number"
          min={0}
          placeholder={ph}
          value={form[field]}
          onChange={e => onChange(field, e.target.value)}
          style={{ ...leaveFieldEditSt, textAlign: 'center', padding: '5px 6px' }}
        />
      ) : (
        <div
          style={{
            background: '#131722',
            border: '1px solid #2a3050',
            borderRadius: 7,
            padding: '5px 6px',
            textAlign: 'center',
            color: WHITE,
            fontWeight: 600,
            fontSize: '0.8rem',
          }}
        >
          {form[field] || '—'}
        </div>
      )}
    </div>
  );
  return (
    <div>
      <LeaveFieldLabel optional>Reminder</LeaveFieldLabel>
      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
        {box('Day', 'reminder_days', '2')}
        {box('Hour', 'reminder_hours', '10')}
        {box('Minute', 'reminder_minutes', '30')}
      </div>
    </div>
  );
}

function CompactLeaveCard({ leave, onClick }: { leave: any; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: '#161926',
        border: '1px solid #2a3050',
        borderRadius: 12,
        padding: '13px 16px',
        marginBottom: 10,
        cursor: 'pointer',
        transition: 'all 0.15s',
        userSelect: 'none',
      }}
      onMouseOver={e => {
        e.currentTarget.style.borderColor = '#4f7eff';
        e.currentTarget.style.background = 'rgba(79,126,255,0.04)';
      }}
      onMouseOut={e => {
        e.currentTarget.style.borderColor = '#2a3050';
        e.currentTarget.style.background = '#161926';
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontSize: '0.92rem',
          color: WHITE,
          fontWeight: 600,
        }}
      >
        {leave.member_name || 'Employee'}
      </div>
      <div
        style={{
          maxWidth: '34%',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontSize: '0.82rem',
          color: WHITE,
          flexShrink: 1,
          marginLeft: 'auto',
        }}
      >
        {leaveReasonLabel(leave.leave_type)}
      </div>
      <div style={{ fontSize: '0.82rem', color: WHITE, whiteSpace: 'nowrap', fontWeight: 600, flexShrink: 0, marginLeft: 40 }}>
        {getLeaveCountdownShort(leave.start_date)}
      </div>
    </div>
  );
}

function LeaveFields({
  form,
  editMode,
  onChange,
  viewSource,
  members,
  isAdmin,
  currentUser,
}: {
  form: LeaveForm;
  editMode: boolean;
  onChange: (field: keyof LeaveForm, val: string) => void;
  viewSource?: any;
  members: any[];
  isAdmin: boolean;
  currentUser?: { id?: string | number; name?: string } | null;
}) {
  const empName =
    viewSource?.member_name ||
    members.find(m => String(m.id) === String(form.member_id))?.name ||
    currentUser?.name ||
    '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <LeaveFieldLabel>Emp</LeaveFieldLabel>
        {editMode && isAdmin ? (
          <select
            value={form.member_id || String(currentUser?.id || '')}
            onChange={e => onChange('member_id', e.target.value)}
            style={leaveFieldEditSt}
          >
            <option value={String(currentUser?.id || '')}>{currentUser?.name || 'You'} (You)</option>
            {[...members]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(m =>
                String(m.id) !== String(currentUser?.id) ? (
                  <option key={m.id} value={String(m.id)}>
                    {m.name}
                  </option>
                ) : null
              )}
          </select>
        ) : (
          <div style={{ ...leaveValueSt, fontWeight: 600, fontSize: '0.95rem', paddingRight: 120 }}>{empName}</div>
        )}
      </div>

      <div>
        <LeaveFieldLabel>Reason</LeaveFieldLabel>
        {editMode ? (
          <select
            value={form.leave_type}
            onChange={e => onChange('leave_type', e.target.value)}
            style={leaveFieldEditSt}
          >
            {LEAVE_REASONS.map(r => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        ) : (
          <div style={leaveValueSt}>{leaveReasonLabel(viewSource?.leave_type || form.leave_type)}</div>
        )}
      </div>

      <div>
        <LeaveFieldLabel>From</LeaveFieldLabel>
        {editMode ? (
          <input
            type="datetime-local"
            value={form.start_datetime}
            onClick={e => {
              try {
                (e.target as HTMLInputElement).showPicker?.();
              } catch {}
            }}
            onChange={e => onChange('start_datetime', e.target.value)}
            style={{ ...leaveFieldEditSt, colorScheme: 'dark' }}
          />
        ) : (
          <div style={leaveValueSt}>{fmtLeaveDateTime(viewSource?.start_date || form.start_datetime)}</div>
        )}
      </div>

      <div>
        <LeaveFieldLabel>To</LeaveFieldLabel>
        {editMode ? (
          <input
            type="datetime-local"
            value={form.end_datetime}
            min={form.start_datetime}
            onClick={e => {
              try {
                (e.target as HTMLInputElement).showPicker?.();
              } catch {}
            }}
            onChange={e => onChange('end_datetime', e.target.value)}
            style={{ ...leaveFieldEditSt, colorScheme: 'dark' }}
          />
        ) : (
          <div style={leaveValueSt}>{fmtLeaveDateTime(viewSource?.end_date || form.end_datetime)}</div>
        )}
      </div>

      <div>
        <LeaveFieldLabel optional>Remarks</LeaveFieldLabel>
        {editMode ? (
          <textarea
            rows={2}
            value={form.reason}
            onChange={e => onChange('reason', e.target.value)}
            placeholder="Optional remarks..."
            style={{ ...leaveFieldEditSt, resize: 'vertical' }}
          />
        ) : (
          <div style={leaveValueSt}>{viewSource?.reason || form.reason || '—'}</div>
        )}
      </div>

      {!editMode && viewSource?.status && (
        <div>
          <LeaveFieldLabel>Status</LeaveFieldLabel>
          <div style={leaveValueSt}>
            {viewSource.status === 'APPROVED'
              ? 'Approved'
              : viewSource.status === 'REJECTED' || viewSource.status === 'CANCELLED'
                ? 'Declined'
                : 'Pending'}
          </div>
        </div>
      )}

      <LeaveReminderBoxes form={form} editMode={editMode} onChange={onChange} />
    </div>
  );
}

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

function fmtHoursMinutes(hours: number): string {
  if (!hours || hours < 0) return '0:00';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
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
  const n = name.trim().toLowerCase();
  if (n.includes('ahsan') || n.includes('kabir')) return 'AK';
  if (n.includes('kamrul') || n.includes('islam')) return 'KI';
  if (n.includes('rafi') || n.includes('tajimur')) return 'TR';
  if (n.includes('orko')) return 'AO';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0] || '').slice(0, 1).toUpperCase();
  const first = parts[0] || '';
  const last = parts[parts.length - 1] || '';
  return ((first[0] || '') + (last[0] || '')).toUpperCase();
}

function fmtLeavePeriod(startDate: string, endDate: string): string {
  const fmt = (s: string) => {
    if (!s) return '';
    const dStr = s.split('T')[0] || '';
    const parts = dStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
    return s;
  };
  const d1 = fmt(startDate);
  const d2 = fmt(endDate);
  return d1 === d2 ? d1 : `${d1}-${d2}`;
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
          let mark: string | null = null;
          let markClass = '';
          if (!cell.isWeekend) {
            if (cell.isPresent && !cell.isIncomplete) { mark = '✓'; markClass = 'present-mark'; }
            else if (cell.isIncomplete) { mark = '○'; markClass = 'late-mark'; }
            else if (cell.isAbsent) { mark = '✕'; markClass = 'absent-mark'; }
            else if (isApprovedLeave && !cell.isPresent) { mark = 'L'; markClass = 'leave-mark'; }
          }

          return (
            <div key={cell.date} className={cls} title={tip}>
              <span className="cal-day-wrap">
                <span className={'cal-day-num' + (mark ? ' has-mark' : '')}>{dayNum}</span>
                {mark && <span className={'cal-mark on-date ' + markClass} aria-hidden>{mark}</span>}
              </span>
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
  const [todayAtt, setTodayAtt] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [monthSum, setMonthSum] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<'att' | 'leave' | 'report'>('att'); // att=Team, report=Individual, leave=Leave Request
  const [attLoading, setAttLoading] = useState(false);

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveData, setLeaveData] = useState<LeaveForm>({ ...BLANK_LEAVE });
  const [selectedLeave, setSelectedLeave] = useState<any | null>(null);
  const [leaveDraft, setLeaveDraft] = useState<LeaveForm>({ ...BLANK_LEAVE });
  const [leaveEditMode, setLeaveEditMode] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);

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
      const today = todayDhaka();
      const [mRes, aRes, lRes, sumRes, todayAttRes] = await Promise.all([
        authFetch('/api/members').then(r => r.json()),
        authFetch('/api/attendance?date=' + curDate).then(r => r.json()),
        authFetch(leavesUrl).then(r => r.json()),
        authFetch('/api/attendance/summary?month=' + curMonthStr).then(r => r.json()),
        authFetch('/api/attendance?date=' + today).then(r => r.json()),
      ]);
      setMembers(Array.isArray(mRes) ? mRes : []);
      if (Array.isArray(mRes) && mRes.length > 0) {
        setReportMemberId(prev => {
          if (prev) return prev;
          const emp = mRes.find((m: any) => String(m.id) === String(user?.id)) || mRes.find((m: any) => m.role === 'Admin') || mRes[0];
          return emp ? String(emp.id) : '';
        });
      }
      setAtt(Array.isArray(aRes) ? aRes : []);
      setTodayAtt(Array.isArray(todayAttRes) ? todayAttRes : (today === curDate && Array.isArray(aRes) ? aRes : []));
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
      } else if (target === 'report' || target === 'individual' || target === 'employee') {
        setActiveTab('report');
      } else {
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
    if (!reportMemberId) return;
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
        const start = new Date(dateOnly(l.start_date) + 'T00:00:00');
        const end = new Date(dateOnly(l.end_date) + 'T00:00:00');
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
        for (const cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
          const dow = cur.getDay();
          if (dow !== 5 && dow !== 6) { // Skip Fri & Sat — not counted as leave days
            leaveDateMap.set(cur.toLocaleDateString('en-CA'), { type: l.leave_type, status: l.status });
          }
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

  const markAttendance = async (type: 'IN' | 'OUT', targetMemberId?: string | number) => {
    const mid = targetMemberId != null && String(targetMemberId) !== ''
      ? Number(targetMemberId)
      : Number(user?.id);
    if (!mid) { showToast('Select an employee first.'); return; }

    const todayRows = todayAtt.filter(a => String(a.member_id) === String(mid));
    const hasIn = todayRows.some(a => a.action_type === 'IN');
    const hasOut = todayRows.some(a => a.action_type === 'OUT');
    if (type === 'IN' && hasIn) {
      showToast('Already checked in today.');
      return;
    }
    if (type === 'OUT' && hasOut) {
      showToast('Already checked out today.');
      return;
    }
    if (type === 'OUT' && !hasIn) {
      showToast('Cannot check out before check-in.');
      return;
    }

    setAttLoading(true);
    try {
      const res = await authFetch('/api/attendance', {
        method: 'POST',
        body: JSON.stringify({ member_id: mid, action_type: type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data?.error || (type === 'IN' ? 'Already checked in.' : 'Already checked out.'));
        return;
      }
      const who = members.find(m => String(m.id) === String(mid))?.name || user?.name || 'Employee';
      showToast(`${who}: ${type === 'IN' ? 'Checked In' : 'Checked Out'} at ${nowDhaka()}`);
      await loadAll();
      if (activeTab === 'report') await loadCalendar();
    } catch { showToast('Cannot reach server.'); }
    finally { setAttLoading(false); }
  };

  const openLeaveDetail = (l: any) => {
    setSelectedLeave(l);
    setLeaveDraft(leaveToForm(l));
    setLeaveEditMode(false);
  };

  const closeLeaveDetail = () => {
    setSelectedLeave(null);
    setLeaveEditMode(false);
  };

  const submitLeave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!leaveData.start_datetime || !leaveData.end_datetime) {
      showToast('Please select From and To date & time.');
      return;
    }
    setLeaveSaving(true);
    try {
      const payload = buildLeavePayload({
        ...leaveData,
        member_id: leaveData.member_id || String(user?.id || ''),
      });
      await authFetch('/api/leaves', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showToast('Leave request submitted.');
      setShowLeaveModal(false);
      setLeaveData({ ...BLANK_LEAVE });
      await loadAll();
    } catch { showToast('Cannot reach server.'); }
    finally { setLeaveSaving(false); }
  };

  const saveLeaveDraft = async () => {
    if (!selectedLeave) return;
    if (!leaveDraft.start_datetime || !leaveDraft.end_datetime) {
      showToast('Please select From and To date & time.');
      return;
    }
    setLeaveSaving(true);
    try {
      const payload = buildLeavePayload(leaveDraft);
      const res = await authFetch('/api/leaves/' + selectedLeave.id, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json();
      showToast('Leave request updated.');
      setLeaveEditMode(false);
      await loadAll();
      setSelectedLeave(updated);
      setLeaveDraft(leaveToForm(updated));
    } catch { showToast('Cannot reach server.'); }
    finally { setLeaveSaving(false); }
  };

  const reviewLeave = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      const res = await authFetch('/api/leaves/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed');
      showToast(status === 'APPROVED' ? 'Leave approved' : 'Leave declined');
      setSelectedLeave(null);
      setLeaveEditMode(false);
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
  // Approved / declined requests leave the Leave Requests list entirely
  const openLeaveRequests = leaves.filter(l => l.status === 'PENDING');
  const myTodayAtt = todayAtt.filter(a => String(a.member_id) === String(user?.id));
  const alreadyCheckedIn = myTodayAtt.some(a => a.action_type === 'IN');
  const alreadyCheckedOut = myTodayAtt.some(a => a.action_type === 'OUT');

  return (
    <>
      <Topbar title="HR & Attendance" />

      <div className="scroll" style={{ overflowX: 'hidden', maxWidth: '100vw' }}>

        {/* Date navigator — centered */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px 8px 6px', gap: 8, maxWidth: '100%', boxSizing: 'border-box' }}>
          <div className="dnav" style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setCurDate(s => shiftDateStr(s, -1))} aria-label="Previous day" style={{ padding: '4px 6px' }}>
              <ChevronLeft size={15} />
            </button>
            <div
              className={'dchip' + (curDate === todayDhaka() ? ' today' : '')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '5px 10px', fontSize: '.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}
              onClick={() => {
                const inp = dateInputRef.current;
                if (inp) {
                  try { inp.showPicker(); } catch { inp.click(); }
                }
              }}
            >
              <Calendar size={13} style={{ opacity: 0.7, flexShrink: 0 }} />
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
            <button onClick={() => setCurDate(s => shiftDateStr(s, 1))} aria-label="Next day" style={{ padding: '4px 6px' }}>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>



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

        {/* Tabs: Summary (all), Employee (all), Leave Apply (all) */}
        <div className="tabs no-print">
          <div className={'tab ' + (activeTab === 'att' ? 'on' : '')} onClick={() => setActiveTab('att')}>
            Summary
          </div>
          <div className={'tab ' + (activeTab === 'report' ? 'on' : '')} onClick={() => setActiveTab('report')}>
            Employee
          </div>
          <div className={'tab ' + (activeTab === 'leave' ? 'on' : '')} onClick={() => setActiveTab('leave')}>
            Leave Apply
            {pendingLeaves > 0 && isAdmin && (
              <span style={{ marginLeft: 6, background: 'var(--orange)', color: '#0d0f18', fontSize: '.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 10, verticalAlign: 'middle' }}>
                {pendingLeaves}
              </span>
            )}
          </div>
        </div>

        {/* Summary tab — cumulative attendance table */}
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
                    if (memberObj) {
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

                // Compute monthly leave counts per member
                const monthLeaveCounts = new Map<number, number>();
                const curMonthPrefix = curDate.substring(0, 7);
                leaves.forEach((lv: any) => {
                  if (!lv.start_date || lv.status !== 'APPROVED') return;
                  if (!lv.start_date.startsWith(curMonthPrefix) && !lv.end_date?.startsWith(curMonthPrefix)) return;
                  const start = new Date(lv.start_date + 'T00:00:00');
                  const end = new Date((lv.end_date || lv.start_date) + 'T00:00:00');
                  let cnt = 0;
                  for (const cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
                    const ds = cur.toLocaleDateString('en-CA');
                    if (!ds.startsWith(curMonthPrefix)) continue;
                    const dow = cur.getDay();
                    if (dow !== 5 && dow !== 6) cnt++;
                  }
                  const prev = monthLeaveCounts.get(lv.member_id) || 0;
                  monthLeaveCounts.set(lv.member_id, prev + cnt);
                });

                const list = Array.from(agg.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

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
                            const leaveCount = monthLeaveCounts.get(l.member_id) || 0;
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
                                    {fmtHoursMinutes(stats.totalHours)}
                                  </span>
                                  <span style={{ color: 'var(--muted)', fontSize: '.64rem' }}>/{fmtHoursMinutes(elapsedRequiredHours)}</span>
                                </td>
                                {/* Day: cumulative present / elapsed working days */}
                                <td style={{ padding: '6px 2px', textAlign: 'center', fontSize: '.72rem', whiteSpace: 'nowrap' }}>
                                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                                    {stats.daysPresent}
                                  </span>
                                  <span style={{ color: 'var(--muted)', fontSize: '.64rem' }}>/{elapsedWorkingDays}</span>
                                </td>
                                {/* Leave: monthly approved leave day count */}
                                <td style={{ padding: '6px 2px', textAlign: 'center', fontSize: '.72rem' }}>
                                  {leaveCount > 0 ? (
                                    <span style={{ fontWeight: 700, color: '#2979FF' }}>{leaveCount}</span>
                                  ) : (
                                    <span style={{ color: 'var(--muted)' }}>—</span>
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

        {/* Leave Request tab — Emp | Reason | deadline cards (pending only) */}
        {activeTab === 'leave' && (
          <div style={{ paddingBottom: 24 }}>
            <div style={{ fontSize: '0.72rem', color: MUTED_LABEL, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginBottom: 12 }}>
              {isAdmin ? 'All Leave Requests' : 'My Leave Requests'}
            </div>
            {openLeaveRequests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: WHITE, opacity: 0.55, fontSize: '0.85rem' }}>
                No leave requests yet. Tap + to apply.
              </div>
            ) : (
              openLeaveRequests.map((l: any) => (
                <CompactLeaveCard key={l.id} leave={l} onClick={() => openLeaveDetail(l)} />
              ))
            )}
          </div>
        )}

        {/* Summary cards removed per user request */}

        {/* Individual Monthly Report & Check In/Out */}
        {activeTab === 'report' && (
          <div className="card">
            {/* Controls row — hidden when printing */}
            <div className="no-print" style={{ padding: '14px 18px', display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
              {isAdmin ? (
                <div>
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>Employee</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <select
                      className="cw-select"
                      style={{ minWidth: 160, maxWidth: 200 }}
                      value={reportMemberId}
                      onChange={e => setReportMemberId(e.target.value)}
                    >
                      <option value="">Select employee...</option>
                      {members
                        .sort((a,b) => a.name.localeCompare(b.name)).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>Employee</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="dchip" style={{ fontWeight: 600, fontSize: '.84rem' }}>{user?.name}</div>
                  </div>
                </div>
              )}
              <div>
                <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>Month</div>
                <div className="dnav">
                  <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}>
                    <ChevronLeft size={14} />
                  </button>
                  <div className="dchip" style={{ minWidth: 140, fontSize: '.82rem' }}>{monthLabel(calYear, calMonth)}</div>
                  <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {isAdmin && (() => {
                const punchId = reportMemberId || '';
                const punchRows = todayAtt.filter(a => String(a.member_id) === String(punchId));
                const hasIn = punchRows.some(a => a.action_type === 'IN');
                const hasOut = punchRows.some(a => a.action_type === 'OUT');
                return (
                  <div style={{ flex: '1 1 100%', marginTop: 4 }}>
                    <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>Check In / Out</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        disabled={attLoading || !punchId || hasIn}
                        onClick={() => markAttendance('IN', punchId)}
                        title={hasIn ? 'Already checked in' : 'Check in'}
                        style={{
                          opacity: hasIn ? 0.55 : 1,
                          gap: 6,
                          flex: 1,
                          minWidth: 120,
                          justifyContent: 'center',
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: 'none',
                          background: hasIn ? 'rgba(38,196,134,0.35)' : '#26c486',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '.84rem',
                          cursor: hasIn || attLoading || !punchId ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <LogIn size={15} /> {hasIn ? 'Checked In' : 'Check In'}
                      </button>
                      <button
                        type="button"
                        disabled={attLoading || !punchId || hasOut || !hasIn}
                        onClick={() => markAttendance('OUT', punchId)}
                        title={hasOut ? 'Already checked out' : 'Check out'}
                        style={{
                          opacity: hasOut ? 0.55 : 1,
                          gap: 6,
                          flex: 1,
                          minWidth: 120,
                          justifyContent: 'center',
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: 'none',
                          background: hasOut ? 'rgba(242,92,122,0.35)' : '#f25c7a',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '.84rem',
                          cursor: hasOut || !hasIn || attLoading || !punchId ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <LogOut size={15} /> {hasOut ? 'Checked Out' : 'Check Out'}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* The exportable area */}
            <div id="monthly-calendar-report" ref={reportRef} style={{ background: 'var(--card)' }}>
              
              {/* Employee info header for report */}
              {reportMemberId && (
                <div style={{ padding: '20px 18px 0', textAlign: 'center' }}>
                  <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text)' }}>
                    {members.find(m => String(m.id) === String(reportMemberId))?.name || user?.name || 'Employee'}
                  </h2>
                  <div style={{ fontSize: '.85rem', color: 'var(--muted)', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }} className="print-month">
                    {monthLabel(calYear, calMonth)}
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

              {/* Month stats — screen only (not printed) */}
              {reportMemberId && calDays.length > 0 && (() => {
                const totalPresent = calDays.filter(d => d.isPresent).length;
                const totalAbsent = calDays.filter(d => d.isAbsent).length;
                const totalLate = calDays.filter(d => d.isIncomplete).length;
                const totalApprLeave = calDays.filter(d => d.isLeave && d.leaveStatus === 'APPROVED').length;
                const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
                const calMonthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
                let elapsedWorkingDays = 0;
                const totalMonthDays = daysInMonth(calYear, calMonth);
                const cutoffDay = calMonthStr < todayStr.substring(0, 7)
                  ? totalMonthDays
                  : parseInt(todayStr.split('-')[2] || '1', 10);
                for (let i = 1; i <= Math.min(cutoffDay, totalMonthDays); i++) {
                  const dow = new Date(calYear, calMonth, i).getDay();
                  if (dow !== 5 && dow !== 6) elapsedWorkingDays++;
                }
                const elapsedRequiredHours = elapsedWorkingDays * 5;
                const totalHours = calDays.reduce((sum, d) => sum + (d.hoursWorked || 0), 0);
                const stats = [
                  { label: 'Present', val: totalPresent,   color: 'var(--green)', dotBg: '#26C486', dotShadow: 'rgba(38,196,134,0.6)' },
                  { label: 'Absent',  val: totalAbsent,    color: 'var(--red)',   dotBg: '#F25C7A', dotShadow: 'rgba(242,92,122,0.6)' },
                  { label: 'Late',    val: totalLate,      color: '#FF8C00',      dotBg: '#FF8C00', dotShadow: 'rgba(255,140,0,0.7)' },
                  { label: 'Leave',   val: totalApprLeave, color: '#2979FF',      dotBg: '#2979FF', dotShadow: 'rgba(41,121,255,0.6)' },
                ];
                return (
                  <div className="no-print" style={{ padding: '0 18px 20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 10 }}
                         className="cal-stats-grid">
                      <div className="s-card" style={{ textAlign: 'center' }}>
                        <div className="s-lbl">Total Days</div>
                        <div className="s-val" style={{ color: 'var(--text)', fontSize: '1.4rem' }}>
                          {totalPresent}<span style={{ fontSize: '.85rem', color: 'var(--muted)', fontWeight: 'normal' }}>/{elapsedWorkingDays}</span>
                        </div>
                      </div>
                      <div className="s-card" style={{ textAlign: 'center' }}>
                        <div className="s-lbl">Total Hours</div>
                        <div className="s-val" style={{ color: 'var(--text)', fontSize: '1.4rem' }}>
                          {fmtHoursMinutes(totalHours)}<span style={{ fontSize: '.85rem', color: 'var(--muted)', fontWeight: 'normal' }}>/{fmtHoursMinutes(elapsedRequiredHours)}</span>
                        </div>
                      </div>
                    </div>
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

            {/* Print button at the bottom */}
            {reportMemberId && calDays.length > 0 && (
              <div className="no-print" style={{ padding: '10px 18px 20px', display: 'flex', justifyContent: 'center' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => window.print()}
                  style={{ width: '100%', maxWidth: '360px', justifyContent: 'center', gap: 8, padding: '12px 18px', fontSize: '.88rem' }}
                >
                  <ImageIcon size={15} /> Print
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* FAB for Leave Request */}
      {activeTab === 'leave' && (
        <button
          id="leave-fab"
          onClick={() => {
            const today = todayDhaka();
            setLeaveData({
              ...BLANK_LEAVE,
              member_id: user?.id ? String(user.id) : '',
              start_datetime: `${today}T09:00`,
              end_datetime: `${today}T18:00`,
            });
            setShowLeaveModal(true);
          }}
          title="New Leave Request"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 20,
            zIndex: 700,
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: BLUE_GRAD,
            border: 'none',
            color: WHITE,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 22px rgba(79,126,255,0.45)',
          }}
        >
          <Plus size={24} />
        </button>
      )}

      {/* Leave detail sheet — App / Dec / Rev / X (same for admin & employee; App/Dec admin-only) */}
      {selectedLeave && (() => {
        const active = leaves.find((l: any) => String(l.id) === String(selectedLeave.id)) || selectedLeave;
        const canDecide = isAdmin && active.status === 'PENDING' && !leaveEditMode;
        const actionBtn = (label: string, bg: string, color: string, onClick: () => void, title: string) => (
          <button
            type="button"
            title={title}
            onClick={onClick}
            style={{
              background: bg,
              border: 'none',
              color,
              minWidth: 34,
              height: 34,
              borderRadius: 17,
              padding: '0 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.02em',
            }}
          >
            {label}
          </button>
        );
        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 99999,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
            }}
            onClick={closeLeaveDetail}
          >
            <div
              style={{
                background: '#161926',
                borderTop: '1px solid #2a3050',
                borderTopLeftRadius: 18,
                borderTopRightRadius: 18,
                padding: '14px 16px 16px',
                paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '100dvh',
                overflow: 'hidden',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ position: 'absolute', top: 10, right: 12, display: 'flex', gap: 8, zIndex: 2 }}>
                {canDecide && actionBtn('App', GREEN_BG, GREEN, () => reviewLeave(active.id, 'APPROVED'), 'Approve')}
                {canDecide && actionBtn('Dec', RED_BG, RED, () => reviewLeave(active.id, 'REJECTED'), 'Decline')}
                {!leaveEditMode &&
                  actionBtn('Rev', AMBER_BG, AMBER, () => {
                    setLeaveDraft(leaveToForm(active));
                    setLeaveEditMode(true);
                  }, 'Revise')}
                <button
                  type="button"
                  onClick={closeLeaveDetail}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: 'none',
                    color: '#94a3b8',
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <div
                style={{
                  fontSize: '0.68rem',
                  color: WHITE,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 10,
                  fontWeight: 700,
                  paddingRight: 150,
                  opacity: 0.7,
                }}
              >
                {leaveEditMode ? 'Revise Leave' : 'Leave Details'}
              </div>

              <div style={{ overflowY: 'auto', maxHeight: 'calc(100dvh - 120px)' }}>
                <LeaveFields
                  form={leaveDraft}
                  editMode={leaveEditMode}
                  onChange={(field, val) => setLeaveDraft(prev => ({ ...prev, [field]: val }))}
                  viewSource={leaveEditMode ? undefined : active}
                  members={members}
                  isAdmin={!!isAdmin}
                  currentUser={user}
                />
              </div>

              {leaveEditMode && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setLeaveDraft(leaveToForm(active));
                      setLeaveEditMode(false);
                    }}
                    style={{
                      padding: '10px',
                      borderRadius: 9,
                      border: '1px solid #2a3050',
                      background: '#131722',
                      color: WHITE,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={leaveSaving}
                    onClick={saveLeaveDraft}
                    style={{
                      padding: '10px',
                      borderRadius: 9,
                      border: 'none',
                      background: BLUE_GRAD,
                      color: WHITE,
                      fontWeight: 700,
                      cursor: leaveSaving ? 'wait' : 'pointer',
                      opacity: leaveSaving ? 0.7 : 1,
                    }}
                  >
                    {leaveSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* New Leave Request sheet — same fields for employee & admin */}
      {showLeaveModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
          onClick={() => setShowLeaveModal(false)}
        >
          <div
            style={{
              background: '#161926',
              borderTop: '1px solid #2a3050',
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              padding: '14px 16px 16px',
              paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
              position: 'relative',
              maxHeight: '100dvh',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ position: 'absolute', top: 10, right: 12, zIndex: 2 }}>
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  color: '#94a3b8',
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                fontSize: '0.68rem',
                color: WHITE,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 10,
                fontWeight: 700,
                paddingRight: 50,
                opacity: 0.7,
              }}
            >
              New Leave Request
            </div>

            <div style={{ overflowY: 'auto', maxHeight: 'calc(100dvh - 140px)' }}>
              <LeaveFields
                form={leaveData}
                editMode
                onChange={(field, val) => setLeaveData(prev => ({ ...prev, [field]: val }))}
                members={members}
                isAdmin={!!isAdmin}
                currentUser={user}
              />
            </div>

            <button
              type="button"
              disabled={leaveSaving}
              onClick={() => submitLeave()}
              style={{
                width: '100%',
                marginTop: 12,
                padding: '12px',
                borderRadius: 9,
                border: 'none',
                background: BLUE_GRAD,
                color: WHITE,
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: leaveSaving ? 'wait' : 'pointer',
                opacity: leaveSaving ? 0.7 : 1,
              }}
            >
              {leaveSaving ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      )}

      {toastMsg && <div className="toast on">{toastMsg}</div>}
    </>
  );
}