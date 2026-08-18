/**
 * Dashboard / Daily Tasks Module — v3
 *
 * Requirements:
 *  1. Admin View:
 *     - Recipient column:
 *       • If Action is 'ASSIGN' → Dropdown to select team member
 *       • If Action is 'SMS' | 'CALL' | 'MAIL' | 'MEETING' → Text field for recipient contact/name/email
 *     - Inline editable rows + last row for adding new tasks
 *     - Clickable Deadline cell opening native datetime picker
 *  2. Team View:
 *     - Multi-filter bar (Assignee / Action / Status / Deadline)
 *     - Clean, responsive presentation
 *  3. Board View:
 *     - Summary table (Assignee | Total | Done | In Progress | Overdue)
 *  4. Topbar:
 *     - Clickable Date chip opening native calendar date picker
 *  5. Aesthetics:
 *     - Polished dark UI with high contrast, no truncated dropdowns, smooth hover states
 *
 * API: /api/tasks, /api/members
 */
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Phone, Mail, MessageSquare, Users, Calendar, Plus, Check } from 'lucide-react';
import Topbar from '../components/Topbar';

/* ─── Type Definitions ─────────────────────────────── */
type Task = {
  id: number;
  title: string;
  description: string;
  action_type: 'SMS' | 'CALL' | 'MAIL' | 'MEETING' | 'ASSIGN';
  recipient?: string;
  priority: 'GREEN' | 'ORANGE' | 'RED';
  status: 'PENDING' | 'DONE' | 'DUE';
  assigned_to: number | null;
  assignee_name?: string;
  assignee_color?: string;
  task_date: string;
  deadline?: string;
};

type Member = { id: number; name: string; avatar_color: string; role: string; };

type ActionMeta = { icon: React.ReactNode; label: string; color: string; bg: string };

const ACTION_MAP: Record<string, ActionMeta> = {
  ASSIGN:  { icon: <Users size={14} />,         label: 'Assign',  color: '#f472b6', bg: 'rgba(244,114,182,0.15)' },
  SMS:     { icon: <MessageSquare size={14} />, label: 'SMS',     color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  CALL:    { icon: <Phone size={14} />,         label: 'Call',    color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  MAIL:    { icon: <Mail size={14} />,          label: 'Mail',    color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  MEETING: { icon: <Calendar size={14} />,      label: 'Meeting', color: '#a855f7', bg: 'rgba(168,85,247,0.15)' },
};

const ACTION_KEYS = ['ASSIGN', 'SMS', 'CALL', 'MAIL', 'MEETING'] as const;

function getActionMeta(key?: string): ActionMeta {
  if (key && key in ACTION_MAP) {
    return ACTION_MAP[key]!;
  }
  return ACTION_MAP.ASSIGN!;
}

function getStatusStyle(status?: string): { color: string; bg: string; label: string } {
  if (status === 'DONE') return { color: '#22c55e', bg: 'rgba(34,197,94,0.15)', label: 'Done' };
  if (status === 'DUE')  return { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', label: 'Due' };
  return { color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', label: 'Pending' };
}

/* ─── Inline Deadline Editor with Auto-Open Calendar ─ */
function DeadlineEditor({ defaultValue, onSave }: { defaultValue: string; onSave: (val: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      try {
        ref.current.showPicker?.();
      } catch (err) {}
    }
  }, []);

  return (
    <input
      ref={ref}
      type="datetime-local"
      defaultValue={defaultValue}
      onBlur={e => onSave(e.target.value)}
      onChange={e => onSave(e.target.value)}
      onClick={e => {
        try {
          (e.target as HTMLInputElement).showPicker?.();
        } catch (err) {}
      }}
      style={{
        background: '#131722',
        border: '1px solid #4f7eff',
        borderRadius: '7px',
        color: '#f1f5f9',
        padding: '6px 10px',
        fontSize: '0.82rem',
        fontFamily: 'inherit',
        outline: 'none',
        colorScheme: 'dark',
        cursor: 'pointer',
        width: '100%',
        minWidth: '160px'
      }}
    />
  );
}

/* ─── Blank new-task row shape ─────────────────────── */
const BLANK_ROW = { action_type: 'ASSIGN', title: '', recipient: '', assigned_to: '', status: 'PENDING', deadline: '' };

/* ═══════════════════════════════════════════════════ */
export default function DashboardPage() {
  const [tasks,       setTasks]       = useState<Task[]>([]);
  const [members,     setMembers]     = useState<Member[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]!);
  const [tab,         setTab]         = useState<'admin' | 'team' | 'board'>('admin');
  const [loading,     setLoading]     = useState(true);
  const [toastMsg,    setToastMsg]    = useState('');

  /* Topbar date picker ref */
  const datePickerRef = useRef<HTMLInputElement>(null);

  /* New-task inline row state */
  const [newRow, setNewRow] = useState({ ...BLANK_ROW });
  const [savingNew, setSavingNew] = useState(false);

  /* Team-view filters */
  const [fAssignee, setFAssignee] = useState('');
  const [fAction,   setFAction]   = useState('');
  const [fStatus,   setFStatus]   = useState('');
  const [fDeadline, setFDeadline] = useState('');

  /* Inline cell editing for existing rows */
  const [editCell, setEditCell] = useState<{ id: number; field: string } | null>(null);

  function showToast(m: string) {
    setToastMsg(m);
    setTimeout(() => setToastMsg(''), 2500);
  }

  /* ─── Data fetching ───────────────────────────── */
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks?date=${currentDate}`);
      setTasks(await res.json());
    } catch (e) {
      console.error('Failed to fetch tasks', e);
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/members');
      setMembers(await res.json());
    } catch (e) {
      console.error('Failed to fetch members', e);
    }
  }, []);

  useEffect(() => { fetchTasks(); fetchMembers(); }, [fetchTasks, fetchMembers]);

  /* ─── Date navigation ─────────────────────────── */
  const shiftDate = (days: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + days);
    setCurrentDate(d.toISOString().split('T')[0]!);
  };

  const isToday = currentDate === new Date().toISOString().split('T')[0]!;

  /* ─── Inline save (existing task cell) ─────────── */
  const saveCell = async (id: number, field: string, value: string) => {
    setEditCell(null);
    const payload: any = {};
    if (field === 'assigned_to') {
      payload.assigned_to = value ? parseInt(value) : null;
    } else {
      payload[field] = value;
    }
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    fetchTasks();
  };

  /* ─── Delete task ─────────────────────────────── */
  const deleteTask = async (id: number) => {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    showToast('Task deleted.');
    fetchTasks();
  };

  /* ─── Add new task (inline row submit) ─────────── */
  const submitNewRow = async () => {
    if (!newRow.title.trim()) { showToast('Activity name is required.'); return; }
    setSavingNew(true);
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newRow.title,
          action_type: newRow.action_type,
          recipient: newRow.action_type === 'ASSIGN' ? '' : (newRow.recipient || ''),
          assigned_to: newRow.action_type === 'ASSIGN' ? (newRow.assigned_to ? parseInt(newRow.assigned_to) : null) : null,
          status: newRow.status,
          deadline: newRow.deadline || null,
          task_date: currentDate,
        }),
      });
      setNewRow({ ...BLANK_ROW });
      showToast('Task added successfully!');
      fetchTasks();
    } catch (e) {
      showToast('Failed to add task.');
    } finally {
      setSavingNew(false);
    }
  };

  /* ─── Computed stats ──────────────────────────── */
  const total   = tasks.length;
  const done    = tasks.filter(t => t.status === 'DONE').length;
  const wip     = tasks.filter(t => t.status === 'PENDING').length;
  const overdue = tasks.filter(t => t.status === 'DUE').length;

  /* ─── Team view filtered list ─────────────────── */
  const filteredTasks = tasks.filter(t => {
    if (fAssignee && String(t.assigned_to) !== fAssignee) return false;
    if (fAction   && t.action_type !== fAction)            return false;
    if (fStatus   && t.status !== fStatus)                 return false;
    if (fDeadline && (!t.deadline || !t.deadline.startsWith(fDeadline))) return false;
    return true;
  });

  /* ─── Board view: group by assignee ──────────── */
  const boardRows = [
    { id: null as number | null, name: 'Unassigned', avatar_color: '#64748b', role: '' },
    ...members,
  ].map(m => {
    const mt = tasks.filter(t => t.assigned_to === m.id);
    return {
      ...m,
      total:   mt.length,
      done:    mt.filter(t => t.status === 'DONE').length,
      wip:     mt.filter(t => t.status === 'PENDING').length,
      pending: mt.filter(t => t.status === 'DUE').length,
    };
  }).filter(r => r.total > 0);

  /* ─── Inline cell renderer for admin table ────── */
  const renderCell = (task: Task, field: string) => {
    const isEditing = editCell?.id === task.id && editCell?.field === field;

    // 1. ACTION TYPE DROPDOWN
    if (field === 'action_type') {
      if (isEditing) return (
        <select autoFocus
          defaultValue={task.action_type}
          onBlur={e => saveCell(task.id, 'action_type', e.target.value)}
          onChange={e => saveCell(task.id, 'action_type', e.target.value)}
          style={{
            background: '#131722',
            border: '1px solid #4f7eff',
            borderRadius: '7px',
            color: '#f1f5f9',
            padding: '6px 10px',
            fontSize: '0.82rem',
            fontFamily: 'inherit',
            outline: 'none',
            minWidth: '120px'
          }}>
          {ACTION_KEYS.map(k => <option key={k} value={k}>{getActionMeta(k).label}</option>)}
        </select>
      );
      const am = getActionMeta(task.action_type);
      return (
        <div onClick={() => setEditCell({ id: task.id, field })}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: am.color, background: am.bg, fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', padding: '5px 10px', borderRadius: '6px', border: `1px solid ${am.color}30` }}
          title="Click to change action">
          {am.icon} <span>{am.label}</span>
        </div>
      );
    }

    // 2. RECIPIENT / ASSIGNEE COLUMN
    // If action is ASSIGN -> dropdown of team members. Else -> text input for recipient.
    if (field === 'recipient_col') {
      if (task.action_type === 'ASSIGN') {
        if (isEditing) return (
          <select autoFocus
            defaultValue={task.assigned_to?.toString() || ''}
            onBlur={e => saveCell(task.id, 'assigned_to', e.target.value)}
            onChange={e => saveCell(task.id, 'assigned_to', e.target.value)}
            style={{
              background: '#131722',
              border: '1px solid #4f7eff',
              borderRadius: '7px',
              color: '#f1f5f9',
              padding: '6px 10px',
              fontSize: '0.82rem',
              fontFamily: 'inherit',
              outline: 'none',
              minWidth: '150px'
            }}>
            <option value="">Unassigned</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        );
        return (
          <div onClick={() => setEditCell({ id: task.id, field })} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            {task.assignee_name ? (
              <>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: task.assignee_color || '#4f7eff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {(task.assignee_name[0] || 'U').toUpperCase()}
                </div>
                <span style={{ fontSize: '0.84rem', color: '#f1f5f9', fontWeight: 500 }}>{task.assignee_name}</span>
              </>
            ) : (
              <span style={{ color: '#64748b', fontSize: '0.82rem', fontStyle: 'italic' }}>Select member...</span>
            )}
          </div>
        );
      } else {
        // Text field for non-ASSIGN actions
        if (isEditing) return (
          <input autoFocus type="text"
            defaultValue={task.recipient || ''}
            placeholder="Recipient / Contact..."
            onBlur={e => saveCell(task.id, 'recipient', e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveCell(task.id, 'recipient', (e.target as HTMLInputElement).value); }}
            style={{
              background: '#131722',
              border: '1px solid #4f7eff',
              borderRadius: '7px',
              color: '#f1f5f9',
              fontSize: '0.82rem',
              padding: '6px 10px',
              width: '100%',
              minWidth: '140px',
              outline: 'none',
              fontFamily: 'inherit'
            }} />
        );
        return (
          <div onClick={() => setEditCell({ id: task.id, field })}
            style={{ cursor: 'pointer', fontSize: '0.84rem', color: task.recipient ? '#f1f5f9' : '#64748b', minWidth: '120px' }}
            title="Click to edit recipient">
            {task.recipient || <span style={{ fontStyle: 'italic', color: '#64748b' }}>Enter recipient...</span>}
          </div>
        );
      }
    }

    // 3. STATUS DROPDOWN
    if (field === 'status') {
      if (isEditing) return (
        <select autoFocus
          defaultValue={task.status}
          onBlur={e => saveCell(task.id, 'status', e.target.value)}
          onChange={e => saveCell(task.id, 'status', e.target.value)}
          style={{
            background: '#131722',
            border: '1px solid #4f7eff',
            borderRadius: '7px',
            color: '#f1f5f9',
            padding: '6px 10px',
            fontSize: '0.82rem',
            fontFamily: 'inherit',
            outline: 'none',
            minWidth: '120px'
          }}>
          <option value="PENDING">Pending</option>
          <option value="DONE">Done</option>
          <option value="DUE">Due</option>
        </select>
      );
      const st = getStatusStyle(task.status);
      return (
        <div onClick={() => setEditCell({ id: task.id, field })}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', background: st.bg, color: st.color, border: `1px solid ${st.color}35` }}
          title="Click to change status">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color }}></span>
          <span>{st.label}</span>
        </div>
      );
    }

    // 4. DEADLINE CALENDAR PICKER
    if (field === 'deadline') {
      if (isEditing) return (
        <DeadlineEditor
          defaultValue={task.deadline?.slice(0, 16) || ''}
          onSave={val => saveCell(task.id, 'deadline', val)}
        />
      );
      const dl = task.deadline ? new Date(task.deadline) : null;
      return (
        <div onClick={() => setEditCell({ id: task.id, field })}
          style={{ cursor: 'pointer', color: dl ? '#e2e8f0' : '#64748b', fontSize: '0.82rem', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: '6px', background: dl ? 'rgba(255,255,255,0.03)' : 'transparent' }}
          title="Click to set deadline">
          <Calendar size={13} style={{ color: dl ? '#38bdf8' : '#64748b' }} />
          <span>{dl ? dl.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Set deadline'}</span>
        </div>
      );
    }

    // 5. ACTIVITY NAME (TITLE)
    if (field === 'title') {
      if (isEditing) return (
        <input autoFocus type="text"
          defaultValue={task.title}
          onBlur={e => saveCell(task.id, 'title', e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') saveCell(task.id, 'title', (e.target as HTMLInputElement).value); }}
          style={{
            background: '#131722',
            border: '1px solid #4f7eff',
            borderRadius: '7px',
            color: '#f1f5f9',
            fontSize: '0.84rem',
            padding: '6px 10px',
            width: '100%',
            minWidth: '180px',
            outline: 'none',
            fontFamily: 'inherit'
          }} />
      );
      return (
        <div onClick={() => setEditCell({ id: task.id, field })}
          style={{ cursor: 'text', fontSize: '0.86rem', color: '#f8fafc', fontWeight: 500, display: 'block', minWidth: '160px' }}
          title="Click to edit activity name">
          {task.title || <span style={{ fontStyle: 'italic', color: '#64748b' }}>Enter activity name...</span>}
        </div>
      );
    }

    return null;
  };

  /* ─── Render ──────────────────────────────────── */
  return (
    <>
      <Topbar title="Daily Tasks">
        {/* Date navigation with click-to-open calendar */}
        <div className="dnav" style={{ marginRight: 'auto', marginLeft: 20, position: 'relative', background: '#161926', border: '1px solid #2a3050', borderRadius: '9px' }}>
          <button onClick={() => shiftDate(-1)} title="Previous Day" style={{ padding: '8px 14px', color: '#94a3b8' }}><ChevronLeft size={18} /></button>
          
          <div
            className={`dchip${isToday ? ' today' : ''}`}
            onClick={() => {
              try {
                datePickerRef.current?.showPicker?.();
              } catch (e) {}
              datePickerRef.current?.focus();
            }}
            title="Click to open calendar"
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minWidth: 210, padding: '8px 16px', userSelect: 'none', color: isToday ? '#38bdf8' : '#f1f5f9', fontWeight: 600, fontSize: '0.88rem' }}
          >
            <Calendar size={15} style={{ color: isToday ? '#38bdf8' : '#94a3b8' }} />
            <span>{isToday ? `Today (${currentDate})` : currentDate}</span>
            <input
              ref={datePickerRef}
              type="date"
              value={currentDate}
              onChange={e => {
                if (e.target.value) {
                  setCurrentDate(e.target.value);
                }
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                cursor: 'pointer',
                pointerEvents: 'none'
              }}
            />
          </div>

          <button onClick={() => shiftDate(1)} title="Next Day" style={{ padding: '8px 14px', color: '#94a3b8' }}><ChevronRight size={18} /></button>
        </div>
      </Topbar>

      <div className="scroll" style={{ padding: '24px' }}>

        {/* ── Tab bar ─────────────────────────────── */}
        <div className="tabs" style={{ borderBottom: '1px solid #2a3050', marginBottom: 20 }}>
          {(['admin', 'team', 'board'] as const).map(t => (
            <div key={t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}
              style={{
                padding: '10px 22px',
                fontSize: '0.88rem',
                fontWeight: tab === t ? 600 : 500,
                color: tab === t ? '#38bdf8' : '#94a3b8',
                borderBottom: tab === t ? '2px solid #38bdf8' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}>
              {t === 'admin' ? 'Admin View' : t === 'team' ? 'Team View' : 'Board View'}
            </div>
          ))}
        </div>

        {/* ── Summary line ────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '0.82rem', color: '#94a3b8', marginBottom: 20, background: '#161926', border: '1px solid #2a3050', borderRadius: '10px', padding: '12px 18px' }}>
          <div>Total Tasks: <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '0.95rem' }}>{total}</span></div>
          <span style={{ color: '#334155' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }}></span>
            <span>Done:</span>
            <span style={{ color: '#22c55e', fontWeight: 700 }}>{done}</span>
          </div>
          <span style={{ color: '#334155' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }}></span>
            <span>In Progress:</span>
            <span style={{ color: '#f59e0b', fontWeight: 700 }}>{wip}</span>
          </div>
          <span style={{ color: '#334155' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }}></span>
            <span>Overdue:</span>
            <span style={{ color: '#ef4444', fontWeight: 700 }}>{overdue}</span>
          </div>
        </div>

        {loading ? (
          <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: 40, fontSize: '0.9rem' }}>Loading tasks…</div>
        ) : (

          /* ══════════════════════════════════════════ */
          /* TAB 1 – ADMIN VIEW                        */
          /* ══════════════════════════════════════════ */
          tab === 'admin' ? (
            <div className="card" style={{ background: '#161926', border: '1px solid #2a3050', borderRadius: '12px', overflow: 'hidden' }}>
              <div className="table-scroll">
                <table style={{ width: '100%', minWidth: '820px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid #2a3050' }}>
                      <th style={{ width: '140px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action</th>
                      <th style={{ minWidth: '200px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activity Name</th>
                      <th style={{ width: '180px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recipient / Assignee</th>
                      <th style={{ width: '130px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                      <th style={{ width: '190px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deadline</th>
                      <th style={{ width: '50px', padding: '12px 16px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.length === 0 && (
                      <tr className="empty-r"><td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>No tasks for this day. Enter one in the row below.</td></tr>
                    )}

                    {/* Existing task rows */}
                    {tasks.map(task => (
                      <tr key={task.id} style={{ borderBottom: '1px solid rgba(42,48,80,0.6)', transition: 'background 0.15s' }}>
                        <td style={{ padding: '12px 16px' }}>{renderCell(task, 'action_type')}</td>
                        <td style={{ padding: '12px 16px' }}>{renderCell(task, 'title')}</td>
                        <td style={{ padding: '12px 16px' }}>{renderCell(task, 'recipient_col')}</td>
                        <td style={{ padding: '12px 16px' }}>{renderCell(task, 'status')}</td>
                        <td style={{ padding: '12px 16px' }}>{renderCell(task, 'deadline')}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <button onClick={() => deleteTask(task.id)}
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', transition: 'all 0.15s' }}
                            onMouseOver={e => (e.currentTarget.style.color = '#ef4444')}
                            onMouseOut={e  => (e.currentTarget.style.color = '#64748b')}
                            title="Delete Task">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}

                    {/* ── Add new task row (always visible at bottom) ── */}
                    <tr style={{ background: 'rgba(79,126,255,0.06)', borderTop: '2px solid rgba(79,126,255,0.2)' }}>
                      {/* Action selector */}
                      <td style={{ padding: '12px 16px' }}>
                        <select value={newRow.action_type}
                          onChange={e => setNewRow({ ...newRow, action_type: e.target.value })}
                          style={{
                            background: '#131722',
                            border: '1px solid #2a3050',
                            borderRadius: '7px',
                            color: '#f1f5f9',
                            padding: '8px 10px',
                            fontSize: '0.82rem',
                            fontFamily: 'inherit',
                            outline: 'none',
                            width: '100%',
                            minWidth: '110px'
                          }}>
                          {ACTION_KEYS.map(k => <option key={k} value={k}>{getActionMeta(k).label}</option>)}
                        </select>
                      </td>

                      {/* Activity name */}
                      <td style={{ padding: '12px 16px' }}>
                        <input type="text" placeholder="+ New activity name..."
                          value={newRow.title}
                          onChange={e => setNewRow({ ...newRow, title: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') submitNewRow(); }}
                          style={{
                            background: '#131722',
                            border: '1px solid #2a3050',
                            borderRadius: '7px',
                            color: '#f1f5f9',
                            fontSize: '0.84rem',
                            padding: '8px 12px',
                            width: '100%',
                            minWidth: '180px',
                            outline: 'none',
                            fontFamily: 'inherit'
                          }} />
                      </td>

                      {/* Dynamic Recipient / Assignee */}
                      <td style={{ padding: '12px 16px' }}>
                        {newRow.action_type === 'ASSIGN' ? (
                          <select value={newRow.assigned_to}
                            onChange={e => setNewRow({ ...newRow, assigned_to: e.target.value })}
                            style={{
                              background: '#131722',
                              border: '1px solid #2a3050',
                              borderRadius: '7px',
                              color: '#f1f5f9',
                              padding: '8px 10px',
                              fontSize: '0.82rem',
                              fontFamily: 'inherit',
                              outline: 'none',
                              width: '100%',
                              minWidth: '150px'
                            }}>
                            <option value="">Select team member...</option>
                            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        ) : (
                          <input type="text"
                            placeholder={newRow.action_type === 'MAIL' ? 'e.g. client@email.com' : newRow.action_type === 'CALL' || newRow.action_type === 'SMS' ? 'e.g. +88017... or Name' : 'e.g. Client / Contact'}
                            value={newRow.recipient}
                            onChange={e => setNewRow({ ...newRow, recipient: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') submitNewRow(); }}
                            style={{
                              background: '#131722',
                              border: '1px solid #2a3050',
                              borderRadius: '7px',
                              color: '#f1f5f9',
                              fontSize: '0.82rem',
                              padding: '8px 12px',
                              width: '100%',
                              minWidth: '140px',
                              outline: 'none',
                              fontFamily: 'inherit'
                            }}
                          />
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 16px' }}>
                        <select value={newRow.status}
                          onChange={e => setNewRow({ ...newRow, status: e.target.value })}
                          style={{
                            background: '#131722',
                            border: '1px solid #2a3050',
                            borderRadius: '7px',
                            color: '#f1f5f9',
                            padding: '8px 10px',
                            fontSize: '0.82rem',
                            fontFamily: 'inherit',
                            outline: 'none',
                            width: '100%',
                            minWidth: '110px'
                          }}>
                          <option value="PENDING">Pending</option>
                          <option value="DONE">Done</option>
                          <option value="DUE">Due</option>
                        </select>
                      </td>

                      {/* Deadline */}
                      <td style={{ padding: '12px 16px' }}>
                        <input
                          type="datetime-local"
                          value={newRow.deadline}
                          onClick={e => {
                            try {
                              (e.target as HTMLInputElement).showPicker?.();
                            } catch (err) {}
                          }}
                          onChange={e => setNewRow({ ...newRow, deadline: e.target.value })}
                          style={{
                            background: '#131722',
                            border: '1px solid #2a3050',
                            borderRadius: '7px',
                            color: '#f1f5f9',
                            padding: '7px 10px',
                            fontSize: '0.8rem',
                            fontFamily: 'inherit',
                            outline: 'none',
                            width: '100%',
                            minWidth: '160px',
                            colorScheme: 'dark',
                            cursor: 'pointer'
                          }}
                        />
                      </td>

                      {/* Submit button */}
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button onClick={submitNewRow} disabled={savingNew}
                          style={{
                            background: '#4f7eff',
                            border: 'none',
                            color: '#fff',
                            cursor: 'pointer',
                            padding: '8px 14px',
                            borderRadius: '7px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            fontFamily: 'inherit',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            opacity: savingNew ? 0.5 : 1,
                            transition: 'background 0.15s'
                          }}>
                          <Plus size={14} /> <span>{savingNew ? '...' : 'Add'}</span>
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

          /* ══════════════════════════════════════════ */
          /* TAB 2 – TEAM VIEW                         */
          /* ══════════════════════════════════════════ */
          ) : tab === 'team' ? (
            <>
              {/* Filter bar */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, background: '#161926', border: '1px solid #2a3050', borderRadius: '12px', padding: '14px 18px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filters:</span>
                
                {/* Assignee filter */}
                <select value={fAssignee} onChange={e => setFAssignee(e.target.value)}
                  style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: fAssignee ? '#38bdf8' : '#f1f5f9', padding: '8px 12px', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', minWidth: '140px' }}>
                  <option value="">All Team Members</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>

                {/* Action filter */}
                <select value={fAction} onChange={e => setFAction(e.target.value)}
                  style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: fAction ? '#38bdf8' : '#f1f5f9', padding: '8px 12px', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', minWidth: '120px' }}>
                  <option value="">All Actions</option>
                  {ACTION_KEYS.map(k => <option key={k} value={k}>{getActionMeta(k).label}</option>)}
                </select>

                {/* Status filter */}
                <select value={fStatus} onChange={e => setFStatus(e.target.value)}
                  style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: fStatus ? '#38bdf8' : '#f1f5f9', padding: '8px 12px', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', minWidth: '120px' }}>
                  <option value="">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="DONE">Done</option>
                  <option value="DUE">Due</option>
                </select>

                {/* Deadline date filter */}
                <input
                  type="date"
                  value={fDeadline}
                  onClick={e => {
                    try {
                      (e.target as HTMLInputElement).showPicker?.();
                    } catch (err) {}
                  }}
                  onChange={e => setFDeadline(e.target.value)}
                  style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: fDeadline ? '#38bdf8' : '#f1f5f9', padding: '8px 12px', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', colorScheme: 'dark', cursor: 'pointer', minWidth: '140px' }}
                />

                {(fAssignee || fAction || fStatus || fDeadline) && (
                  <button onClick={() => { setFAssignee(''); setFAction(''); setFStatus(''); setFDeadline(''); }}
                    style={{ background: 'transparent', border: '1px solid #334155', borderRadius: '7px', color: '#94a3b8', padding: '8px 14px', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>
                    Clear Filters
                  </button>
                )}
              </div>

              <div className="card" style={{ background: '#161926', border: '1px solid #2a3050', borderRadius: '12px', overflow: 'hidden' }}>
                <div className="table-scroll">
                  <table style={{ width: '100%', minWidth: '780px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid #2a3050' }}>
                        <th style={{ width: '130px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action</th>
                        <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activity Name</th>
                        <th style={{ width: '180px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recipient / Assignee</th>
                        <th style={{ width: '130px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                        <th style={{ width: '180px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deadline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.length === 0 && (
                        <tr className="empty-r"><td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>No tasks match the selected filters.</td></tr>
                      )}
                      {filteredTasks.map(task => {
                        const am = getActionMeta(task.action_type);
                        const dl = task.deadline ? new Date(task.deadline) : null;
                        const st = getStatusStyle(task.status);
                        return (
                          <tr key={task.id} style={{ borderBottom: '1px solid rgba(42,48,80,0.6)' }}>
                            <td style={{ padding: '12px 16px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: am.color, background: am.bg, fontWeight: 600, fontSize: '0.78rem', padding: '4px 10px', borderRadius: '6px', border: `1px solid ${am.color}30` }}>
                                {am.icon} <span>{am.label}</span>
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', fontWeight: 500, color: '#f8fafc', fontSize: '0.86rem' }}>{task.title}</td>
                            <td style={{ padding: '12px 16px' }}>
                              {task.action_type === 'ASSIGN' ? (
                                task.assignee_name ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: task.assignee_color || '#4f7eff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                      {(task.assignee_name[0] || 'U').toUpperCase()}
                                    </div>
                                    <span style={{ fontSize: '0.84rem', color: '#f1f5f9', fontWeight: 500 }}>{task.assignee_name}</span>
                                  </div>
                                ) : <span style={{ color: '#64748b', fontSize: '0.82rem' }}>—</span>
                              ) : (
                                <span style={{ color: task.recipient ? '#f1f5f9' : '#64748b', fontSize: '0.84rem' }}>{task.recipient || '—'}</span>
                              )}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700, background: st.bg, color: st.color, border: `1px solid ${st.color}35` }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color }}></span>
                                <span>{st.label}</span>
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: dl ? '#e2e8f0' : '#64748b', whiteSpace: 'nowrap' }}>
                              {dl ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  <Calendar size={13} style={{ color: '#38bdf8' }} />
                                  <span>{dl.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>

          /* ══════════════════════════════════════════ */
          /* TAB 3 – BOARD VIEW                        */
          /* ══════════════════════════════════════════ */
          ) : (
            <div className="card" style={{ background: '#161926', border: '1px solid #2a3050', borderRadius: '12px', overflow: 'hidden' }}>
              <div className="table-scroll">
                <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid #2a3050' }}>
                      <th style={{ padding: '14px 20px', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assignee Name</th>
                      <th style={{ width: '130px', textAlign: 'center', padding: '14px 20px', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Jobs</th>
                      <th style={{ width: '130px', textAlign: 'center', padding: '14px 20px', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Done</th>
                      <th style={{ width: '130px', textAlign: 'center', padding: '14px 20px', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>WIP (Pending)</th>
                      <th style={{ width: '130px', textAlign: 'center', padding: '14px 20px', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boardRows.length === 0 && (
                      <tr className="empty-r"><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No tasks assigned for this day.</td></tr>
                    )}
                    {boardRows.map(row => (
                      <tr key={row.id ?? 'unassigned'} style={{ borderBottom: '1px solid rgba(42,48,80,0.6)', transition: 'background 0.15s' }}>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 34, height: 34, borderRadius: '50%', background: row.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                              {(row.name[0] || 'U').toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#f8fafc' }}>{row.name}</div>
                              {row.role && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>{row.role}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.15rem', color: '#f1f5f9', padding: '14px 20px' }}>
                          {row.total}
                        </td>
                        <td style={{ textAlign: 'center', padding: '14px 20px' }}>
                          <span style={{ display: 'inline-block', background: 'rgba(34,197,94,0.15)', color: '#22c55e', padding: '4px 14px', borderRadius: '14px', fontWeight: 700, fontSize: '0.95rem' }}>
                            {row.done}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', padding: '14px 20px' }}>
                          <span style={{ display: 'inline-block', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '4px 14px', borderRadius: '14px', fontWeight: 700, fontSize: '0.95rem' }}>
                            {row.wip}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', padding: '14px 20px' }}>
                          <span style={{ display: 'inline-block', background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '4px 14px', borderRadius: '14px', fontWeight: 700, fontSize: '0.95rem' }}>
                            {row.pending}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </div>

      {/* Toast notification */}
      {toastMsg && <div className="toast on" style={{ background: '#1e2438', border: '1px solid #4f7eff', color: '#f8fafc', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>{toastMsg}</div>}
    </>
  );
}
