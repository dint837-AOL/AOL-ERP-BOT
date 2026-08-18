/**
 * Dashboard / Daily Tasks Module — v2
 *
 * Three-tab system:
 *  1. Admin View  – inline editable table; last row = new task entry row
 *  2. Team View   – full task list with multi-filter (assignee / action / status / deadline)
 *  3. Board View  – per-assignee summary table (Name | Total | Done | WIP | Pending)
 *
 * API: /api/tasks, /api/members
 * Mobile-ready: all tables wrapped in .table-scroll
 */
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Phone, Mail, MessageSquare, Users, Calendar } from 'lucide-react';
import Topbar from '../components/Topbar';

/* ─── Type Definitions ─────────────────────────────── */
type Task = {
  id: number;
  title: string;
  description: string;
  action_type: 'SMS' | 'CALL' | 'MAIL' | 'MEETING' | 'ASSIGN';
  priority: 'GREEN' | 'ORANGE' | 'RED';
  status: 'PENDING' | 'DONE' | 'DUE';
  assigned_to: number | null;
  assignee_name?: string;
  assignee_color?: string;
  task_date: string;
  deadline?: string;
};

type Member = { id: number; name: string; avatar_color: string; role: string; };

type ActionMeta = { icon: React.ReactNode; label: string; color: string };

const ACTION_MAP: Record<string, ActionMeta> = {
  SMS:     { icon: <MessageSquare size={14} />, label: 'SMS',     color: '#26c486' },
  CALL:    { icon: <Phone size={14} />,         label: 'Call',    color: '#4f7eff' },
  MAIL:    { icon: <Mail size={14} />,          label: 'Mail',    color: '#f5a623' },
  MEETING: { icon: <Calendar size={14} />,      label: 'Meeting', color: '#a78bfa' },
  ASSIGN:  { icon: <Users size={14} />,         label: 'Assign',  color: '#f472b6' },
};

const ACTION_KEYS = ['SMS', 'CALL', 'MAIL', 'MEETING', 'ASSIGN'] as const;

function getActionMeta(key?: string): ActionMeta {
  if (key && key in ACTION_MAP) {
    return ACTION_MAP[key]!;
  }
  return { icon: <Users size={14} />, label: 'Assign', color: '#f472b6' };
}

function getStatusColor(status?: string): string {
  if (status === 'DONE') return 'var(--green)';
  if (status === 'DUE') return 'var(--red)';
  return 'var(--muted)';
}

/* ─── Blank new-task row shape ─────────────────────── */
const BLANK_ROW = { action_type: 'ASSIGN', title: '', assigned_to: '', status: 'PENDING', deadline: '' };

/* ═══════════════════════════════════════════════════ */
export default function DashboardPage() {
  const [tasks,       setTasks]       = useState<Task[]>([]);
  const [members,     setMembers]     = useState<Member[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]!);
  const [tab,         setTab]         = useState<'admin' | 'team' | 'board'>('admin');
  const [loading,     setLoading]     = useState(true);
  const [toastMsg,    setToastMsg]    = useState('');

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
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: field === 'assigned_to' ? (value ? parseInt(value) : null) : value }),
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
          status: newRow.status,
          deadline: newRow.deadline || null,
          assigned_to: newRow.assigned_to ? parseInt(newRow.assigned_to) : null,
          task_date: currentDate,
        }),
      });
      setNewRow({ ...BLANK_ROW });
      showToast('Task added!');
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
    { id: null as number | null, name: 'Unassigned', avatar_color: '#4f7eff' },
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
  const renderCell = (task: Task, field: keyof Task) => {
    const isEditing = editCell?.id === task.id && editCell?.field === field;

    if (field === 'action_type') {
      if (isEditing) return (
        <select autoFocus
          defaultValue={task.action_type}
          onBlur={e => saveCell(task.id, 'action_type', e.target.value)}
          onChange={e => saveCell(task.id, 'action_type', e.target.value)}
          style={{ background: 'var(--card)', border: '1px solid var(--primary)', borderRadius: 6, color: 'var(--text)', padding: '4px 8px', fontSize: '.8rem', fontFamily: 'inherit', outline: 'none' }}>
          {ACTION_KEYS.map(k => <option key={k} value={k}>{getActionMeta(k).label}</option>)}
        </select>
      );
      const am = getActionMeta(task.action_type);
      return (
        <span onClick={() => setEditCell({ id: task.id, field })}
          style={{ display: 'flex', alignItems: 'center', gap: 5, color: am.color, fontWeight: 600, fontSize: '.78rem', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: `${am.color}18` }}>
          {am.icon} {am.label}
        </span>
      );
    }

    if (field === 'status') {
      if (isEditing) return (
        <select autoFocus
          defaultValue={task.status}
          onBlur={e => saveCell(task.id, 'status', e.target.value)}
          onChange={e => saveCell(task.id, 'status', e.target.value)}
          style={{ background: 'var(--card)', border: '1px solid var(--primary)', borderRadius: 6, color: 'var(--text)', padding: '4px 8px', fontSize: '.8rem', fontFamily: 'inherit', outline: 'none' }}>
          <option value="PENDING">Pending</option>
          <option value="DONE">Done</option>
          <option value="DUE">Due</option>
        </select>
      );
      const sColor = getStatusColor(task.status);
      return (
        <span onClick={() => setEditCell({ id: task.id, field })}
          style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: '.72rem', fontWeight: 700, cursor: 'pointer', background: `${sColor}22`, color: sColor }}>
          {task.status}
        </span>
      );
    }

    if (field === 'assigned_to') {
      if (isEditing) return (
        <select autoFocus
          defaultValue={task.assigned_to?.toString() || ''}
          onBlur={e => saveCell(task.id, 'assigned_to', e.target.value)}
          onChange={e => saveCell(task.id, 'assigned_to', e.target.value)}
          style={{ background: 'var(--card)', border: '1px solid var(--primary)', borderRadius: 6, color: 'var(--text)', padding: '4px 8px', fontSize: '.8rem', fontFamily: 'inherit', outline: 'none' }}>
          <option value="">—</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      );
      return (
        <span onClick={() => setEditCell({ id: task.id, field })}
          style={{ cursor: 'pointer', color: task.assignee_name ? 'var(--text)' : 'var(--muted)', fontSize: '.83rem' }}>
          {task.assignee_name || '—'}
        </span>
      );
    }

    if (field === 'deadline') {
      if (isEditing) return (
        <input type="datetime-local" autoFocus
          defaultValue={task.deadline?.slice(0, 16) || ''}
          onBlur={e => saveCell(task.id, 'deadline', e.target.value)}
          style={{ background: 'var(--card)', border: '1px solid var(--primary)', borderRadius: 6, color: 'var(--text)', padding: '4px 8px', fontSize: '.8rem', fontFamily: 'inherit', outline: 'none' }} />
      );
      const dl = task.deadline ? new Date(task.deadline) : null;
      return (
        <span onClick={() => setEditCell({ id: task.id, field })}
          style={{ cursor: 'pointer', color: dl ? 'var(--text)' : 'var(--muted)', fontSize: '.8rem', whiteSpace: 'nowrap' }}>
          {dl ? dl.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
        </span>
      );
    }

    /* Default: title */
    if (isEditing) return (
      <input autoFocus type="text"
        defaultValue={String(task[field] || '')}
        onBlur={e => saveCell(task.id, field as string, e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') saveCell(task.id, field as string, (e.target as HTMLInputElement).value); }}
        style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--primary)', color: 'var(--text)', fontSize: '.83rem', padding: '2px 4px', width: '100%', outline: 'none', fontFamily: 'inherit' }} />
    );
    return (
      <span onClick={() => setEditCell({ id: task.id, field })}
        style={{ cursor: 'text', fontSize: '.83rem', display: 'block', minWidth: 120 }}>
        {String(task[field] || '—')}
      </span>
    );
  };

  /* ─── Render ──────────────────────────────────── */
  return (
    <>
      <Topbar title="Daily Tasks">
        {/* Date navigation */}
        <div className="dnav" style={{ marginRight: 'auto', marginLeft: 20 }}>
          <button onClick={() => shiftDate(-1)}><ChevronLeft size={18} /></button>
          <div className={`dchip${isToday ? ' today' : ''}`}>
            {isToday ? 'Today' : currentDate}
          </div>
          <button onClick={() => shiftDate(1)}><ChevronRight size={18} /></button>
        </div>
      </Topbar>

      <div className="scroll">

        {/* ── Tab bar ─────────────────────────────── */}
        <div className="tabs">
          {(['admin', 'team', 'board'] as const).map(t => (
            <div key={t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
              {t === 'admin' ? 'Admin View' : t === 'team' ? 'Team View' : 'Board View'}
            </div>
          ))}
        </div>

        {/* ── Summary line ────────────────────────── */}
        <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: 18, letterSpacing: '.01em' }}>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{total}</span> tasks &nbsp;·&nbsp;
          <span style={{ color: 'var(--green)', fontWeight: 600 }}>{done}</span> done &nbsp;·&nbsp;
          <span style={{ color: 'var(--orange)', fontWeight: 600 }}>{wip}</span> in progress &nbsp;·&nbsp;
          <span style={{ color: 'var(--red)', fontWeight: 600 }}>{overdue}</span> overdue
        </div>

        {loading ? (
          <div style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 40 }}>Loading…</div>
        ) : (

          /* ══════════════════════════════════════════ */
          /* TAB 1 – ADMIN VIEW                        */
          /* ══════════════════════════════════════════ */
          tab === 'admin' ? (
            <div className="card">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Action</th>
                      <th>Activity Name</th>
                      <th style={{ width: 130 }}>Recipient</th>
                      <th style={{ width: 110 }}>Status</th>
                      <th style={{ width: 160 }}>Deadline</th>
                      <th style={{ width: 44 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.length === 0 && (
                      <tr className="empty-r"><td colSpan={6}>No tasks for this day. Add one below.</td></tr>
                    )}

                    {/* Existing task rows – all cells are click-to-edit */}
                    {tasks.map(task => (
                      <tr key={task.id} style={{ transition: 'background .15s' }}>
                        <td>{renderCell(task, 'action_type')}</td>
                        <td>{renderCell(task, 'title')}</td>
                        <td>{renderCell(task, 'assigned_to')}</td>
                        <td>{renderCell(task, 'status')}</td>
                        <td>{renderCell(task, 'deadline')}</td>
                        <td>
                          <button onClick={() => deleteTask(task.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', transition: 'color .15s' }}
                            onMouseOver={e => (e.currentTarget.style.color = 'var(--red)')}
                            onMouseOut={e  => (e.currentTarget.style.color = 'var(--muted)')}>
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}

                    {/* ── Add new task row (always visible at the bottom) ── */}
                    <tr style={{ background: 'rgba(79,126,255,.04)' }}>
                      <td>
                        <select value={newRow.action_type}
                          onChange={e => setNewRow({ ...newRow, action_type: e.target.value })}
                          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '6px 8px', fontSize: '.8rem', fontFamily: 'inherit', outline: 'none', width: '100%' }}>
                          {ACTION_KEYS.map(k => <option key={k} value={k}>{getActionMeta(k).label}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="text" placeholder="+ New activity..."
                          value={newRow.title}
                          onChange={e => setNewRow({ ...newRow, title: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') submitNewRow(); }}
                          style={{ background: 'transparent', border: 'none', borderBottom: '1px dashed var(--border)', color: 'var(--text)', fontSize: '.83rem', padding: '6px 4px', width: '100%', outline: 'none', fontFamily: 'inherit' }} />
                      </td>
                      <td>
                        <select value={newRow.assigned_to}
                          onChange={e => setNewRow({ ...newRow, assigned_to: e.target.value })}
                          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '6px 8px', fontSize: '.8rem', fontFamily: 'inherit', outline: 'none', width: '100%' }}>
                          <option value="">Unassigned</option>
                          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={newRow.status}
                          onChange={e => setNewRow({ ...newRow, status: e.target.value })}
                          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '6px 8px', fontSize: '.8rem', fontFamily: 'inherit', outline: 'none', width: '100%' }}>
                          <option value="PENDING">Pending</option>
                          <option value="DONE">Done</option>
                          <option value="DUE">Due</option>
                        </select>
                      </td>
                      <td>
                        <input type="datetime-local"
                          value={newRow.deadline}
                          onChange={e => setNewRow({ ...newRow, deadline: e.target.value })}
                          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '6px 8px', fontSize: '.78rem', fontFamily: 'inherit', outline: 'none', width: '100%' }} />
                      </td>
                      <td>
                        <button onClick={submitNewRow} disabled={savingNew}
                          style={{ background: 'var(--primary)', border: 'none', color: '#fff', cursor: 'pointer', padding: '6px 10px', borderRadius: 6, fontSize: '.75rem', fontWeight: 700, fontFamily: 'inherit', opacity: savingNew ? .5 : 1 }}>
                          {savingNew ? '…' : '+ Add'}
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
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
                {/* Assignee filter */}
                <select value={fAssignee} onChange={e => setFAssignee(e.target.value)}
                  style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: fAssignee ? 'var(--primary)' : 'var(--muted)', padding: '8px 12px', fontSize: '.82rem', fontFamily: 'inherit', outline: 'none' }}>
                  <option value="">All Assignees</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                {/* Action filter */}
                <select value={fAction} onChange={e => setFAction(e.target.value)}
                  style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: fAction ? 'var(--primary)' : 'var(--muted)', padding: '8px 12px', fontSize: '.82rem', fontFamily: 'inherit', outline: 'none' }}>
                  <option value="">All Actions</option>
                  {ACTION_KEYS.map(k => <option key={k} value={k}>{getActionMeta(k).label}</option>)}
                </select>
                {/* Status filter */}
                <select value={fStatus} onChange={e => setFStatus(e.target.value)}
                  style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: fStatus ? 'var(--primary)' : 'var(--muted)', padding: '8px 12px', fontSize: '.82rem', fontFamily: 'inherit', outline: 'none' }}>
                  <option value="">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="DONE">Done</option>
                  <option value="DUE">Due</option>
                </select>
                {/* Deadline date filter */}
                <input type="date" value={fDeadline} onChange={e => setFDeadline(e.target.value)}
                  style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: fDeadline ? 'var(--primary)' : 'var(--muted)', padding: '8px 12px', fontSize: '.82rem', fontFamily: 'inherit', outline: 'none' }} />
                {(fAssignee || fAction || fStatus || fDeadline) && (
                  <button onClick={() => { setFAssignee(''); setFAction(''); setFStatus(''); setFDeadline(''); }}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', padding: '8px 14px', fontSize: '.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Clear Filters
                  </button>
                )}
              </div>

              <div className="card">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 110 }}>Action</th>
                        <th>Activity Name</th>
                        <th style={{ width: 130 }}>Assignee</th>
                        <th style={{ width: 110 }}>Status</th>
                        <th style={{ width: 160 }}>Deadline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.length === 0 && (
                        <tr className="empty-r"><td colSpan={5}>No tasks match the current filters.</td></tr>
                      )}
                      {filteredTasks.map(task => {
                        const am = getActionMeta(task.action_type);
                        const dl = task.deadline ? new Date(task.deadline) : null;
                        const sColor = getStatusColor(task.status);
                        return (
                          <tr key={task.id}>
                            <td>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: am.color, fontWeight: 600, fontSize: '.78rem', padding: '3px 8px', borderRadius: 6, background: `${am.color}18`, width: 'fit-content' }}>
                                {am.icon} {am.label}
                              </span>
                            </td>
                            <td style={{ fontWeight: 500 }}>{task.title}</td>
                            <td>
                              {task.assignee_name ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: task.assignee_color || '#4f7eff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.68rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                    {(task.assignee_name[0] || 'U').toUpperCase()}
                                  </div>
                                  <span style={{ fontSize: '.83rem' }}>{task.assignee_name}</span>
                                </div>
                              ) : <span style={{ color: 'var(--muted)', fontSize: '.83rem' }}>—</span>}
                            </td>
                            <td>
                              <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: '.72rem', fontWeight: 700, background: `${sColor}22`, color: sColor }}>
                                {task.status}
                              </span>
                            </td>
                            <td style={{ fontSize: '.8rem', color: dl ? 'var(--text)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
                              {dl ? dl.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
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
            <div className="card">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Assignee</th>
                      <th style={{ width: 100, textAlign: 'center' }}>Total Jobs</th>
                      <th style={{ width: 100, textAlign: 'center' }}>Done</th>
                      <th style={{ width: 100, textAlign: 'center' }}>In Progress</th>
                      <th style={{ width: 100, textAlign: 'center' }}>Overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boardRows.length === 0 && (
                      <tr className="empty-r"><td colSpan={5}>No tasks assigned for this day.</td></tr>
                    )}
                    {boardRows.map(row => (
                      <tr key={row.id ?? 'unassigned'}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: row.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.76rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                              {(row.name[0] || 'U').toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{row.name}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)' }}>{row.total}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--green)' }}>{row.done}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--orange)' }}>{row.wip}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--red)' }}>{row.pending}</span>
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
      {toastMsg && <div className="toast on">{toastMsg}</div>}
    </>
  );
}
