/**
 * Dashboard / Daily Tasks Module — v5.0 (Mobile Responsive)
 *
 * Mobile-first redesign:
 *  - Desktop: Full table view (unchanged behaviour)
 *  - Mobile (<768px): Beautiful card-based list view
 *    • Each task shown as a rich card with all fields tap-to-edit
 *    • Floating "+" bottom sheet for adding tasks on mobile
 *    • Board view becomes vertical stacked cards on mobile
 *    • Summary bar adapts to compact pill layout
 *
 * All functionality preserved exactly as before.
 *
 * API: /api/tasks, /api/members
 */
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  Phone,
  Mail,
  MessageSquare,
  Users,
  Calendar,
  Bell,
  Plus,
  Pencil,
  Archive,
  RotateCcw,
  X,
  AlertTriangle,
  FileText,
  CreditCard
} from 'lucide-react';
import Topbar from '../components/Topbar';

/* ─── Helpers ──────────────────────────────────────── */
function getLocalDateString(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/* ─── Type Definitions ─────────────────────────────── */
type Task = {
  id: number;
  title: string;
  description: string;
  action_type: 'ASSIGN' | 'SMS' | 'CALL' | 'MAIL' | 'MEETING' | 'REMINDER';
  recipient?: string;
  priority: 'GREEN' | 'ORANGE' | 'RED';
  status: 'DONE' | 'WIP' | 'PENDING' | 'DUE';
  assigned_to: number | null;
  assignee_name?: string;
  assignee_color?: string;
  task_date: string;
  deadline?: string;
  is_archived?: number;
};

type Member = { id: number; name: string; avatar_color: string; role: string; };
type ActionMeta = { icon: React.ReactNode; label: string };

const ACTION_MAP: Record<string, ActionMeta> = {
  ASSIGN:    { icon: <Users size={14} />,        label: 'Assign' },
  CALL:      { icon: <Phone size={14} />,        label: 'Call' },
  DOC_SHARE: { icon: <FileText size={14} />,     label: 'Documents Sharing' },
  MAIL:      { icon: <Mail size={14} />,         label: 'Mail' },
  MEETING:   { icon: <Calendar size={14} />,     label: 'Meeting' },
  PAYMENT:   { icon: <CreditCard size={14} />,   label: 'Payment' },
  REMINDER:  { icon: <Bell size={14} />,         label: 'Reminder' },
  SMS:       { icon: <MessageSquare size={14} />,label: 'SMS' },
};

// Alphabetical order
const ACTION_KEYS = ['ASSIGN', 'CALL', 'DOC_SHARE', 'MAIL', 'MEETING', 'PAYMENT', 'REMINDER', 'SMS'] as const;

function getActionMeta(key?: string): ActionMeta {
  if (key && key in ACTION_MAP) {
    return ACTION_MAP[key]!;
  }
  return { icon: <Plus size={14} />, label: 'Select' };
}

function getStatusStyle(status?: string): { color: string; bg: string; dotGlow: string; label: string } {
  if (status === 'DONE') return { color: '#22c55e', bg: 'rgba(34,197,94,0.15)', dotGlow: '0 0 10px #22c55e, 0 0 20px rgba(34,197,94,0.5)', label: 'Done' };
  if (status === 'WIP')  return { color: '#eab308', bg: 'rgba(234,179,8,0.15)',  dotGlow: '0 0 10px #eab308, 0 0 20px rgba(234,179,8,0.5)',  label: 'WIP' };
  return { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', dotGlow: '0 0 10px #ef4444, 0 0 20px rgba(239,68,68,0.5)', label: 'Pending' };
}

/* ─── Inline Deadline Editor with Auto-Open Calendar ─ */
function DeadlineEditor({ defaultValue, onSave }: { defaultValue: string; onSave: (val: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      try { ref.current.showPicker?.(); } catch (err) {}
    }
  }, []);
  return (
    <input ref={ref} type="datetime-local" defaultValue={defaultValue}
      onBlur={e => onSave(e.target.value)}
      onChange={e => onSave(e.target.value)}
      onClick={e => { try { (e.target as HTMLInputElement).showPicker?.(); } catch (err) {} }}
      style={{ background: '#131722', border: '1px solid #4f7eff', borderRadius: '7px', color: '#f1f5f9', padding: '6px 10px', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', colorScheme: 'dark', cursor: 'pointer', width: '100%', minWidth: '160px' }}
    />
  );
}

function CompactMobileTaskCard({ task, onClick }: { task: any; onClick: () => void }) {
  const dl = task.deadline ? new Date(task.deadline) : null;
  const shortName = task.assignee_name ? task.assignee_name.split(' ').map((n:string)=>n[0]).join('').substring(0,2).toUpperCase() : 'U';
  const st = getStatusStyle(task.status);
  
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#161926', border: '1px solid #2a3050', borderRadius: '10px', padding: '12px 14px', marginBottom: 10, cursor: 'pointer' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: st.color, boxShadow: st.dotGlow, flexShrink: 0 }} />
      <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.9rem', color: '#f8fafc', fontWeight: 500 }}>
        {task.title || 'Untitled Task'}
      </div>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: task.assignee_color || '#4f7eff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
        {shortName}
      </div>
      {dl && (
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
          {dl.toLocaleString('en-GB', { day: 'numeric', month: 'short' })}
        </div>
      )}
    </div>
  );
}

/* ─── Blank new-task row shape ─────────────────────── */
const BLANK_ROW = { action_type: '', title: '', recipient: '', assigned_to: '', status: 'DONE', deadline: '' };

/* ─── Shared inline field styles ─── */
const fieldInputSt: React.CSSProperties = {
  background: '#131722', border: '1px solid #2a3050', borderRadius: '8px',
  color: '#f1f5f9', fontSize: '0.84rem', padding: '9px 11px',
  width: '100%', outline: 'none', fontFamily: 'inherit'
};
const fieldSelectSt: React.CSSProperties = { ...fieldInputSt, cursor: 'pointer' };



/* ─── Mobile Add Task Bottom Sheet ─── */
function MobileAddSheet({ newRow, setNewRow, members, onSubmit, saving, onClose }: {
  newRow: any; setNewRow: any; members: Member[];
  onSubmit: () => void; saving: boolean; onClose: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 800, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'relative', background: '#161926', borderRadius: '22px 22px 0 0', border: '1px solid #2a3050', borderBottom: 'none', padding: '20px 18px 36px', maxHeight: '82vh', overflowY: 'auto' }}>
        <div style={{ width: 38, height: 4, background: '#2a3050', borderRadius: 2, margin: '0 auto 18px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>Add New Task</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Action */}
          <div>
            <label style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Action Type</label>
            <select value={newRow.action_type} onChange={e => setNewRow({ ...newRow, action_type: e.target.value })} style={fieldSelectSt}>
              {ACTION_KEYS.map(k => <option key={k} value={k}>{getActionMeta(k).label}</option>)}
            </select>
          </div>
          {/* Title */}
          <div>
            <label style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Activity Name *</label>
            <input type="text" placeholder="Enter activity name…" value={newRow.title}
              onChange={e => setNewRow({ ...newRow, title: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
              style={{ ...fieldInputSt, fontSize: '0.92rem' }} />
          </div>
          {/* Recipient */}
          <div>
            <label style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Recipient / Contact</label>
            <input type="text" placeholder="Name, email, or phone…" value={newRow.recipient}
              onChange={e => setNewRow({ ...newRow, recipient: e.target.value })} style={fieldInputSt} />
          </div>
          {/* Assignee + Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Assignee</label>
              <select value={newRow.assigned_to} onChange={e => setNewRow({ ...newRow, assigned_to: e.target.value })} style={fieldSelectSt}>
                <option value="">Select…</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Status</label>
              <select value={newRow.status} onChange={e => setNewRow({ ...newRow, status: e.target.value as any })} style={fieldSelectSt}>
                <option value="DONE">Done</option>
                <option value="WIP">WIP</option>
                <option value="PENDING">Pending</option>
              </select>
            </div>
          </div>
          {/* Deadline */}
          <div>
            <label style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Deadline (optional)</label>
            <input type="datetime-local" value={newRow.deadline}
              onClick={e => { try { (e.target as HTMLInputElement).showPicker?.(); } catch {} }}
              onChange={e => setNewRow({ ...newRow, deadline: e.target.value })}
              style={{ ...fieldInputSt, colorScheme: 'dark', cursor: 'pointer' }} />
          </div>
          {/* Submit */}
          <button onClick={onSubmit} disabled={saving}
            style={{ background: 'linear-gradient(135deg,#4f7eff,#6c4fe3)', border: 'none', color: '#fff', borderRadius: '12px', padding: '14px', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: saving ? 0.6 : 1, marginTop: 4, transition: 'opacity 0.15s' }}>
            <Plus size={18} />
            {saving ? 'Adding…' : 'Add Task'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
export default function DashboardPage() {
  const [tasks,         setTasks]         = useState<Task[]>([]);
  const [members,       setMembers]       = useState<Member[]>([]);
  const [currentDate,   setCurrentDate]   = useState(getLocalDateString());
  const [tab,           setTab]           = useState<'admin' | 'team' | 'board'>('admin');
  const [loading,       setLoading]       = useState(true);
  const [toastMsg,      setToastMsg]      = useState('');
  const [isMobile,      setIsMobile]      = useState(false);
  const [showMobileAdd, setShowMobileAdd] = useState(false);

  /* Delete Confirmation Modal State */
  const [taskToDelete,  setTaskToDelete]  = useState<Task | null>(null);

  /* Archived Tasks Modal State */
  const [showArchived,  setShowArchived]  = useState(false);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);

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

  /* Responsive detection */
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  function showToast(m: string) {
    setToastMsg(m);
    setTimeout(() => setToastMsg(''), 2500);
  }

  /* ─── Data fetching (strictly for currentDate) ─── */
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks?date=${currentDate}`);
      const rawTasks = await res.json();
      rawTasks.sort((a: Task, b: Task) => {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      });
      setTasks(rawTasks);
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

  const fetchArchivedTasks = useCallback(async () => {
    setLoadingArchived(true);
    try {
      const res = await fetch(`/api/tasks?date=${currentDate}&archived=true`);
      setArchivedTasks(await res.json());
    } catch (e) {
      console.error('Failed to fetch archived tasks', e);
    } finally {
      setLoadingArchived(false);
    }
  }, [currentDate]);

  useEffect(() => {
    fetchTasks();
    fetchMembers();
  }, [fetchTasks, fetchMembers]);

  /* ─── Date navigation (Timezone safe) ─────────── */
  const shiftDate = (days: number) => {
    const [y, m, d] = currentDate.split('-').map(Number);
    const date = new Date(y!, m! - 1, d!);
    date.setDate(date.getDate() + days);
    setCurrentDate(getLocalDateString(date));
  };

  const isToday = currentDate === getLocalDateString();

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

  /* ─── Soft Delete (Archive) ─────────────────────── */
  const handleSoftDelete = async (task: Task) => {
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: 1 }),
      });
      setTaskToDelete(null);
      showToast('Task archived.');
      fetchTasks();
    } catch (e) {
      showToast('Failed to archive task.');
    }
  };

  /* ─── Permanent Delete ──────────────────────────── */
  const handlePermanentDelete = async (task: Task) => {
    try {
      await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      setTaskToDelete(null);
      showToast('Task permanently deleted.');
      fetchTasks();
    } catch (e) {
      showToast('Failed to delete task.');
    }
  };

  /* ─── Restore Archived Task ──────────────────────── */
  const handleRestoreTask = async (task: Task) => {
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: 0 }),
      });
      showToast('Task restored to active list!');
      fetchArchivedTasks();
      fetchTasks();
    } catch (e) {
      showToast('Failed to restore task.');
    }
  };

  const [selectedMobileTask, setSelectedMobileTask] = useState<any>(null);
  const [mobileTaskContext, setMobileTaskContext] = useState<'admin'|'employee'>('admin');
  const [mobileEditMode, setMobileEditMode] = useState(false);
  const [mobileDraft, setMobileDraft] = useState<Partial<Task>>({});

  // Helper for mobile clicks
  const handleMobileClick = (task: any, ctx: 'admin'|'employee') => {
    setSelectedMobileTask(task);
    setMobileTaskContext(ctx);
    setMobileEditMode(false);
    setMobileDraft(task);
  };

  /* ─── Add new task (inline row submit) ─────────── */
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
          recipient: newRow.recipient || '',
          assigned_to: newRow.assigned_to ? parseInt(newRow.assigned_to) : null,
          status: newRow.status || 'DONE',
          deadline: newRow.deadline || null,
          task_date: currentDate,
        }),
      });
      setNewRow({ ...BLANK_ROW });
      setShowMobileAdd(false);
      showToast('Task added successfully!');
      fetchTasks();
    } catch (e) {
      showToast('Failed to add task.');
    } finally {
      setSavingNew(false);
    }
  };

  /* ─── Computed stats for currentDate ──────────── */
  const done    = tasks.filter(t => t.status === 'DONE').length;
  const wip     = tasks.filter(t => t.status === 'WIP' || t.status === 'DUE').length;
  const pending = tasks.filter(t => t.status === 'PENDING').length;

  /* ─── Team view filtered list for currentDate ─── */
  const filteredTasks = tasks.filter(t => {
    if (fAssignee) {
      if (fAssignee === 'unassigned') {
        if (t.assigned_to !== null) return false;
      } else {
        if (String(t.assigned_to) !== fAssignee) return false;
      }
    }
    if (fAction   && t.action_type !== fAction)            return false;
    if (fStatus   && t.status !== fStatus)                 return false;
    if (fDeadline && (!t.deadline || !t.deadline.startsWith(fDeadline))) return false;
    return true;
  });

  /* ─── Board view for currentDate ─────────────── */
  const boardRows = [
    { id: null as number | null, name: 'Unassigned', avatar_color: '#64748b', role: '' },
    ...[...members].sort((a, b) => a.name.localeCompare(b.name)),
  ].map(m => {
    const mt = tasks.filter(t => t.assigned_to === m.id);
    return {
      ...m,
      total:   mt.length,
      done:    mt.filter(t => t.status === 'DONE').length,
      wip:     mt.filter(t => t.status === 'WIP' || t.status === 'DUE').length,
      pending: mt.filter(t => t.status === 'PENDING').length,
    };
  }).filter(r => r.total > 0);

  /* ─── Inline cell renderer for admin table (desktop) ────── */
  const renderCell = (task: Task, field: string) => {
    const isEditing = editCell?.id === task.id && editCell?.field === field;

    if (field === 'action_type') {
      if (isEditing) return (
        <select autoFocus defaultValue={task.action_type}
          onBlur={e => saveCell(task.id, 'action_type', e.target.value)}
          onChange={e => saveCell(task.id, 'action_type', e.target.value)}
          style={{ background: '#131722', border: '1px solid #4f7eff', borderRadius: '7px', color: '#f1f5f9', padding: '6px 10px', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', minWidth: '120px' }}>
          <option value="" disabled>Select</option>
          {ACTION_KEYS.map(k => <option key={k} value={k}>{getActionMeta(k).label}</option>)}
        </select>
      );
      const am = getActionMeta(task.action_type);
      return (
        <div onClick={() => setEditCell({ id: task.id, field })}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#e2e8f0', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', padding: '5px 10px', borderRadius: '6px', transition: 'all 0.15s' }}
          title="Click to change action">
          <span style={{ color: '#94a3b8' }}>{am.icon}</span>
          <span>{am.label}</span>
        </div>
      );
    }

    if (field === 'recipient') {
      if (isEditing) return (
        <input autoFocus type="text" defaultValue={task.recipient || ''} placeholder="Enter recipient/contact..."
          onBlur={e => saveCell(task.id, 'recipient', e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') saveCell(task.id, 'recipient', (e.target as HTMLInputElement).value); }}
          style={{ background: '#131722', border: '1px solid #4f7eff', borderRadius: '7px', color: '#f1f5f9', fontSize: '0.82rem', padding: '6px 10px', width: '100%', minWidth: '140px', outline: 'none', fontFamily: 'inherit' }} />
      );
      return (
        <div onClick={() => setEditCell({ id: task.id, field })}
          style={{ cursor: 'pointer', fontSize: '0.84rem', color: task.recipient ? '#f1f5f9' : '#64748b', minWidth: '120px' }}
          title="Click to edit recipient">
          {task.recipient || <span style={{ fontStyle: 'italic', color: '#64748b' }}>Enter recipient...</span>}
        </div>
      );
    }

    if (field === 'assigned_to') {
      if (isEditing) return (
        <select autoFocus defaultValue={task.assigned_to?.toString() || ''}
          onBlur={e => saveCell(task.id, 'assigned_to', e.target.value)}
          onChange={e => saveCell(task.id, 'assigned_to', e.target.value)}
          style={{ background: '#131722', border: '1px solid #4f7eff', borderRadius: '7px', color: '#f1f5f9', padding: '6px 10px', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', minWidth: '150px' }}>
          <option value="">Unassigned</option>
          {[...members].sort((a, b) => a.name.localeCompare(b.name)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
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
            <span style={{ color: '#64748b', fontSize: '0.82rem', fontStyle: 'italic' }}>Unassigned</span>
          )}
        </div>
      );
    }

    if (field === 'status') {
      if (isEditing) return (
        <select autoFocus defaultValue={task.status === 'DUE' ? 'WIP' : task.status}
          onBlur={e => saveCell(task.id, 'status', e.target.value)}
          onChange={e => saveCell(task.id, 'status', e.target.value)}
          style={{ background: '#131722', border: '1px solid #4f7eff', borderRadius: '7px', color: '#f1f5f9', padding: '6px 10px', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', minWidth: '120px' }}>
          <option value="DONE">Done</option>
          <option value="WIP">WIP</option>
          <option value="PENDING">Pending</option>
        </select>
      );
      const st = getStatusStyle(task.status);
      return (
        <div onClick={() => setEditCell({ id: task.id, field })}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', background: st.bg, color: st.color, border: `1px solid ${st.color}35` }}
          title="Click to change status">
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.color, boxShadow: st.dotGlow }} />
          <span>{st.label}</span>
        </div>
      );
    }

    if (field === 'deadline') {
      if (isEditing) return (
        <DeadlineEditor defaultValue={task.deadline?.slice(0, 16) || ''} onSave={val => saveCell(task.id, 'deadline', val)} />
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

    if (field === 'title') {
      if (isEditing) return (
        <input autoFocus type="text" defaultValue={task.title}
          onBlur={e => saveCell(task.id, 'title', e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') saveCell(task.id, 'title', (e.target as HTMLInputElement).value); }}
          style={{ background: '#131722', border: '1px solid #4f7eff', borderRadius: '7px', color: '#f1f5f9', fontSize: '0.84rem', padding: '6px 10px', width: '100%', minWidth: '180px', outline: 'none', fontFamily: 'inherit' }} />
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
      {/* Mobile-specific CSS */}
      <style>{`
        @keyframes fabPulse {
          0%,100% { box-shadow: 0 4px 20px rgba(79,126,255,0.55), 0 0 0 0 rgba(79,126,255,0.35); }
          50%      { box-shadow: 0 4px 28px rgba(79,126,255,0.8), 0 0 0 10px rgba(79,126,255,0); }
        }
        @media (max-width: 767px) {
          /* Topbar stays SINGLE LINE on mobile — date nav moves into scroll area */
          .dash-topbar-desktop { display: none !important; }
          .dash-mobile-datebar { display: flex !important; }
          .dash-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .dash-tabs::-webkit-scrollbar { display: none; }
          .dash-summary { padding: 12px 14px !important; justify-content: space-around !important; }
          .dash-sum-sep { display: none !important; }
        }
        @media (min-width: 768px) {
          .dash-topbar-desktop { display: flex !important; }
          .dash-mobile-datebar { display: none !important; }
        }
      `}</style>

      <Topbar title="Daily Tasks">
        {/* Desktop only: date nav lives in the topbar */}
        <div className="dash-topbar-desktop" style={{ marginRight: 'auto', marginLeft: 20, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap' }}>
          <div className="dnav" style={{ background: '#161926', border: '1px solid #2a3050', borderRadius: '9px', display: 'flex', alignItems: 'center' }}>
            <button onClick={() => shiftDate(-1)} title="Previous Day" style={{ padding: '8px 14px', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}><ChevronLeft size={18} /></button>
            <label style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minWidth: 210, padding: '8px 16px', userSelect: 'none', color: isToday ? '#38bdf8' : '#f1f5f9', fontWeight: 600, fontSize: '0.88rem' }}>
              <Calendar size={15} style={{ color: isToday ? '#38bdf8' : '#94a3b8', flexShrink: 0 }} />
              <span style={{ whiteSpace: 'nowrap' }}>{isToday ? `Today (${currentDate})` : currentDate}</span>
              <input type="date" value={currentDate}
                onChange={e => { if (e.target.value) setCurrentDate(e.target.value); }}
                onClick={e => { try { (e.target as HTMLInputElement).showPicker?.(); } catch (err) {} }}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
            </label>
            <button onClick={() => shiftDate(1)} title="Next Day" style={{ padding: '8px 14px', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}><ChevronRight size={18} /></button>
          </div>
          <button
            onClick={() => { setShowArchived(true); fetchArchivedTasks(); }}
            style={{ background: 'transparent', border: '1px solid #2a3050', borderRadius: '8px', color: '#94a3b8', padding: '8px 14px', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s', flexShrink: 0 }}
            onMouseOver={e => { e.currentTarget.style.color = '#f1f5f9'; e.currentTarget.style.borderColor = '#4f7eff'; }}
            onMouseOut={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#2a3050'; }}
            title="View archived tasks">
            <Archive size={15} />
            <span>Archived Tasks</span>
          </button>
        </div>
      </Topbar>

      <div className="scroll" style={{ padding: isMobile ? '12px 14px 90px' : '24px' }}>

        {/* ── Mobile-only: compact date nav sub-bar (replaces topbar controls) ── */}
        <div className="dash-mobile-datebar" style={{ display: 'none', marginBottom: 12, gap: 8, alignItems: 'center' }}>
          {/* Date nav pill */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#161926', border: '1px solid #2a3050', borderRadius: '10px', overflow: 'hidden' }}>
            <button onClick={() => shiftDate(-1)}
              style={{ padding: '10px 14px', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
              <ChevronLeft size={18} />
            </button>
            <label style={{ position: 'relative', flex: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 8px', userSelect: 'none', color: isToday ? '#38bdf8' : '#f1f5f9', fontWeight: 600, fontSize: '0.85rem' }}>
              <Calendar size={14} style={{ color: isToday ? '#38bdf8' : '#94a3b8', flexShrink: 0 }} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {isToday ? `Today · ${currentDate}` : currentDate}
              </span>
              <input type="date" value={currentDate}
                onChange={e => { if (e.target.value) setCurrentDate(e.target.value); }}
                onClick={e => { try { (e.target as HTMLInputElement).showPicker?.(); } catch (err) {} }}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
            </label>
            <button onClick={() => shiftDate(1)}
              style={{ padding: '10px 14px', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
              <ChevronRight size={18} />
            </button>
          </div>
          {/* Archive icon button */}
          <button
            onClick={() => { setShowArchived(true); fetchArchivedTasks(); }}
            style={{ background: '#161926', border: '1px solid #2a3050', borderRadius: '10px', color: '#94a3b8', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            title="View archived tasks">
            <Archive size={17} />
          </button>
        </div>

        {/* ── Tab bar ─────────────────────────────── */}
        <div className="tabs dash-tabs" style={{ borderBottom: '1px solid #2a3050', marginBottom: 16, display: 'flex', overflowX: 'auto' }}>
          {(['admin', 'team', 'board'] as const).map(t => (
            <div key={t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}
              style={{ padding: '10px 20px', fontSize: '0.88rem', fontWeight: tab === t ? 600 : 500, color: tab === t ? '#38bdf8' : '#94a3b8', borderBottom: tab === t ? '2px solid #38bdf8' : '2px solid transparent', cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
              {t === 'admin' ? 'Admin View' : t === 'team' ? 'Team View' : 'Board View'}
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: 40, fontSize: '0.9rem' }}>Loading tasks for {currentDate}…</div>
        ) : (

          /* ══════════════════════════════════════════ */
          /* TAB 1 – ADMIN VIEW                        */
          /* ══════════════════════════════════════════ */
          tab === 'admin' ? (
            <>
              {/* Mobile: Card list */}
              {isMobile ? (
                <div>
                  {tasks.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '52px 20px', color: '#64748b' }}>
                      <div style={{ fontSize: '2.8rem', marginBottom: 12 }}>📋</div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 6, color: '#94a3b8' }}>No tasks yet</div>
                      <div style={{ fontSize: '0.82rem' }}>Tap the <strong style={{ color: '#4f7eff' }}>+</strong> button below to add a task</div>
                    </div>
                  ) : tasks.map(task => (
                    <CompactMobileTaskCard 
                      key={task.id} 
                      task={task} 
                      onClick={() => handleMobileClick(task, 'admin')}
                    />
                  ))}
                </div>
              ) : (
                /* Desktop: Table */
                <div className="card" style={{ background: '#161926', border: '1px solid #2a3050', borderRadius: '12px', overflow: 'hidden' }}>
                  <div className="table-scroll">
                    <table style={{ width: '100%', minWidth: '920px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid #2a3050' }}>
                          <th style={{ width: '170px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assignee</th>
                          <th style={{ minWidth: '200px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activity Name</th>
                          <th style={{ width: '130px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action</th>
                          <th style={{ width: '170px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recipient</th>
                          <th style={{ width: '180px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deadline</th>
                          <th style={{ width: '125px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                          <th style={{ width: '50px', padding: '12px 16px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.length === 0 && (
                          <tr className="empty-r"><td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>No tasks for {currentDate}. Enter one in the row below.</td></tr>
                        )}

                        {/* Existing task rows */}
                        {tasks.map(task => (
                          <tr key={task.id} style={{ borderBottom: '1px solid rgba(42,48,80,0.6)', transition: 'background 0.15s' }}>
                            <td style={{ padding: '12px 16px' }}>{renderCell(task, 'assigned_to')}</td>
                            <td style={{ padding: '12px 16px' }}>{renderCell(task, 'title')}</td>
                            <td style={{ padding: '12px 16px' }}>{renderCell(task, 'action_type')}</td>
                            <td style={{ padding: '12px 16px' }}>{renderCell(task, 'recipient')}</td>
                            <td style={{ padding: '12px 16px' }}>{renderCell(task, 'deadline')}</td>
                            <td style={{ padding: '12px 16px' }}>{renderCell(task, 'status')}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <button onClick={() => setTaskToDelete(task)}
                                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', transition: 'all 0.15s' }}
                                onMouseOver={e => (e.currentTarget.style.color = '#ef4444')}
                                onMouseOut={e  => (e.currentTarget.style.color = '#64748b')}
                                title="Delete / Archive Task">
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}

                        {/* ── Add new task row (always visible at bottom) ── */}
                        <tr style={{ background: 'rgba(79,126,255,0.06)', borderTop: '2px solid rgba(79,126,255,0.2)' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <select value={newRow.assigned_to} onChange={e => setNewRow({ ...newRow, assigned_to: e.target.value })}
                              style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: '#f1f5f9', padding: '8px 10px', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', width: '100%', minWidth: '140px' }}>
                              <option value="">Select assignee...</option>
                              {[...members].sort((a,b) => a.name.localeCompare(b.name)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <input type="text" placeholder="+ New activity name..." value={newRow.title}
                              onChange={e => setNewRow({ ...newRow, title: e.target.value })}
                              onKeyDown={e => { if (e.key === 'Enter') submitNewRow(); }}
                              style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: '#f1f5f9', fontSize: '0.84rem', padding: '8px 12px', width: '100%', minWidth: '180px', outline: 'none', fontFamily: 'inherit' }} />
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <select value={newRow.action_type} onChange={e => setNewRow({ ...newRow, action_type: e.target.value })}
                              style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: '#f1f5f9', padding: '8px 10px', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', width: '100%', minWidth: '110px' }}>
                              <option value="" disabled>Select</option>
                              {ACTION_KEYS.map(k => <option key={k} value={k}>{getActionMeta(k).label}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <input type="text" placeholder="Recipient / Contact..." value={newRow.recipient}
                              onChange={e => setNewRow({ ...newRow, recipient: e.target.value })}
                              onKeyDown={e => { if (e.key === 'Enter') submitNewRow(); }}
                              style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: '#f1f5f9', fontSize: '0.82rem', padding: '8px 12px', width: '100%', minWidth: '140px', outline: 'none', fontFamily: 'inherit' }} />
                          </td>
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
                          <td style={{ padding: '12px 16px' }}>
                            <select value={newRow.status} onChange={e => setNewRow({ ...newRow, status: e.target.value as any })}
                              style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: '#f1f5f9', padding: '8px 10px', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', width: '100%', minWidth: '110px' }}>
                              <option value="DONE">Done</option>
                              <option value="WIP">WIP</option>
                              <option value="PENDING">Pending</option>
                            </select>
                          </td>
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
              )}
            </>

          /* ══════════════════════════════════════════ */
          /* TAB 2 – TEAM VIEW                         */
          /* ══════════════════════════════════════════ */
          ) : tab === 'team' ? (
            <>
              {/* Filter bar */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, background: '#161926', border: '1px solid #2a3050', borderRadius: '12px', padding: '12px 14px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filters:</span>
                <select value={fAssignee} onChange={e => setFAssignee(e.target.value)}
                  style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: fAssignee ? '#38bdf8' : '#f1f5f9', padding: '8px 10px', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', flex: 1, minWidth: '120px' }}>
                  <option value="">All Assignees</option>
                  <option value="unassigned">Unassigned</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <select value={fAction} onChange={e => setFAction(e.target.value)}
                  style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: fAction ? '#38bdf8' : '#f1f5f9', padding: '8px 10px', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', flex: 1, minWidth: '100px' }}>
                  <option value="">All Actions</option>
                  {ACTION_KEYS.map(k => <option key={k} value={k}>{getActionMeta(k).label}</option>)}
                </select>
                <select value={fStatus} onChange={e => setFStatus(e.target.value)}
                  style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: fStatus ? '#38bdf8' : '#f1f5f9', padding: '8px 10px', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', flex: 1, minWidth: '100px' }}>
                  <option value="">All Statuses</option>
                  <option value="DONE">Done</option>
                  <option value="WIP">WIP</option>
                  <option value="PENDING">Pending</option>
                </select>
                <input type="date" value={fDeadline}
                  onClick={e => { try { (e.target as HTMLInputElement).showPicker?.(); } catch (err) {} }}
                  onChange={e => setFDeadline(e.target.value)}
                  style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: fDeadline ? '#38bdf8' : '#f1f5f9', padding: '8px 10px', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', colorScheme: 'dark', cursor: 'pointer', flex: 1, minWidth: '120px' }} />
                {(fAssignee || fAction || fStatus || fDeadline) && (
                  <button onClick={() => { setFAssignee(''); setFAction(''); setFStatus(''); setFDeadline(''); }}
                    style={{ background: 'transparent', border: '1px solid #334155', borderRadius: '7px', color: '#94a3b8', padding: '8px 12px', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>
                    Clear Filters
                  </button>
                )}
              </div>

              {/* Mobile: task cards */}
              {isMobile ? (
                <div>
                  {filteredTasks.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '52px 20px', color: '#64748b' }}>
                      <div style={{ fontSize: '2.8rem', marginBottom: 12 }}>🔍</div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#94a3b8' }}>No tasks match selected filters</div>
                    </div>
                  ) : filteredTasks.map(task => {
                    return <CompactMobileTaskCard key={task.id} task={task} onClick={() => handleMobileClick(task, 'employee')} />;
                  })}
                </div>
              ) : (
                /* Desktop team table */
                <div className="card" style={{ background: '#161926', border: '1px solid #2a3050', borderRadius: '12px', overflow: 'hidden' }}>
                  <div className="table-scroll">
                    <table style={{ width: '100%', minWidth: '880px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid #2a3050' }}>
                          <th style={{ width: '130px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action</th>
                          <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activity Name</th>
                          <th style={{ width: '170px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recipient</th>
                          <th style={{ width: '170px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assignee</th>
                          <th style={{ width: '125px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                          <th style={{ width: '180px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deadline</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTasks.length === 0 && (
                          <tr className="empty-r"><td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>No tasks match the selected filters on {currentDate}.</td></tr>
                        )}
                        {filteredTasks.map(task => {
                          const am = getActionMeta(task.action_type);
                          const dl = task.deadline ? new Date(task.deadline) : null;
                          const st = getStatusStyle(task.status);
                          return (
                            <tr key={task.id} style={{ borderBottom: '1px solid rgba(42,48,80,0.6)' }}>
                              <td style={{ padding: '12px 16px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#e2e8f0', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', fontWeight: 600, fontSize: '0.78rem', padding: '4px 10px', borderRadius: '6px' }}>
                                  <span style={{ color: '#94a3b8' }}>{am.icon}</span>
                                  <span>{am.label}</span>
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px', fontWeight: 500, color: '#f8fafc', fontSize: '0.86rem' }}>{task.title}</td>
                              <td style={{ padding: '12px 16px', color: task.recipient ? '#f1f5f9' : '#64748b', fontSize: '0.84rem' }}>{task.recipient || '—'}</td>
                              <td style={{ padding: '12px 16px' }}>
                                {task.assignee_name ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: task.assignee_color || '#4f7eff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                      {(task.assignee_name[0] || 'U').toUpperCase()}
                                    </div>
                                    <span style={{ fontSize: '0.84rem', color: '#f1f5f9', fontWeight: 500 }}>{task.assignee_name}</span>
                                  </div>
                                ) : <span style={{ color: '#64748b', fontSize: '0.82rem' }}>—</span>}
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, background: st.bg, color: st.color, border: `1px solid ${st.color}35` }}>
                                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.color, boxShadow: st.dotGlow }} />
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
              )}
            </>

          /* ══════════════════════════════════════════ */
          /* TAB 3 – BOARD VIEW                        */
          /* ══════════════════════════════════════════ */
          ) : isMobile ? (
            /* Mobile board — stacked cards */
            <div>
              {boardRows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '52px 20px', color: '#64748b' }}>
                  <div style={{ fontSize: '2.8rem', marginBottom: 12 }}>📊</div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#94a3b8' }}>No assigned tasks on {currentDate}</div>
                </div>
              ) : boardRows.map(row => (
                <div key={row.id ?? 'unassigned'} style={{ background: '#161926', border: '1px solid #2a3050', borderRadius: '14px', padding: '16px', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: row.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                      {(row.name[0] || 'U').toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f8fafc' }}>{row.name}</div>
                      {row.role && <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 1 }}>{row.role}</div>}
                    </div>
                    <div style={{ background: 'rgba(79,126,255,0.12)', color: '#4f7eff', border: '1px solid rgba(79,126,255,0.28)', borderRadius: '20px', padding: '3px 10px', fontSize: '0.74rem', fontWeight: 700, flexShrink: 0 }}>
                      {row.total} tasks
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'Done',    value: row.done,    color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)'  },
                      { label: 'WIP',     value: row.wip,     color: '#eab308', bg: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.3)'  },
                      { label: 'Pending', value: row.pending, color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)'  },
                    ].map(s => (
                      <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: '10px', padding: '10px 6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: '0.65rem', color: s.color, opacity: 0.85, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Desktop board table */
            <div className="card" style={{ background: '#161926', border: '1px solid #2a3050', borderRadius: '12px', overflow: 'hidden' }}>
              <div className="table-scroll">
                <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid #2a3050' }}>
                      <th style={{ padding: '14px 20px', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assignee Name</th>
                      <th style={{ width: '130px', textAlign: 'center', padding: '14px 20px', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Jobs</th>
                      <th style={{ width: '130px', textAlign: 'center', padding: '14px 20px', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Done</th>
                      <th style={{ width: '130px', textAlign: 'center', padding: '14px 20px', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>WIP</th>
                      <th style={{ width: '130px', textAlign: 'center', padding: '14px 20px', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boardRows.length === 0 && (
                      <tr className="empty-r"><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No tasks assigned on {currentDate}.</td></tr>
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
                        <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.15rem', color: '#f1f5f9', padding: '14px 20px' }}>{row.total}</td>
                        <td style={{ textAlign: 'center', padding: '14px 20px' }}>
                          <span style={{ display: 'inline-block', background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.35)', padding: '4px 14px', borderRadius: '14px', fontWeight: 700, fontSize: '0.95rem' }}>{row.done}</span>
                        </td>
                        <td style={{ textAlign: 'center', padding: '14px 20px' }}>
                          <span style={{ display: 'inline-block', background: 'rgba(234,179,8,0.15)', color: '#eab308', border: '1px solid rgba(234,179,8,0.35)', padding: '4px 14px', borderRadius: '14px', fontWeight: 700, fontSize: '0.95rem' }}>{row.wip}</span>
                        </td>
                        <td style={{ textAlign: 'center', padding: '14px 20px' }}>
                          <span style={{ display: 'inline-block', background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.35)', padding: '4px 14px', borderRadius: '14px', fontWeight: 700, fontSize: '0.95rem' }}>{row.pending}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

        {/* ── Summary at the Bottom of Task Table (Traffic Light Colors) ── */}
        {!loading && (
          <div className="dash-summary" style={{
            display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'space-around' : 'flex-start',
            gap: isMobile ? 8 : 36, marginTop: 20,
            padding: '16px 24px', background: '#161926', border: '1px solid #2a3050', borderRadius: '12px', flexWrap: 'wrap'
          }}>
            {/* DONE - GREEN */}
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 7 : 12, flex: isMobile ? '1 1 auto' : 'none', justifyContent: 'center' }}>
              <span style={{ width: isMobile ? 10 : 14, height: isMobile ? 10 : 14, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 12px #22c55e, 0 0 24px rgba(34,197,94,0.5)', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: isMobile ? '0.88rem' : '1.05rem', fontWeight: 600, color: '#94a3b8' }}>Done:</span>
              <span style={{ fontSize: isMobile ? '1.1rem' : '1.3rem', fontWeight: 800, color: '#22c55e' }}>{done}</span>
            </div>

            <span className="dash-sum-sep" style={{ color: '#2a3050', fontSize: '1.2rem' }}>|</span>

            {/* WIP - YELLOW */}
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 7 : 12, flex: isMobile ? '1 1 auto' : 'none', justifyContent: 'center' }}>
              <span style={{ width: isMobile ? 10 : 14, height: isMobile ? 10 : 14, borderRadius: '50%', background: '#eab308', boxShadow: '0 0 12px #eab308, 0 0 24px rgba(234,179,8,0.5)', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: isMobile ? '0.88rem' : '1.05rem', fontWeight: 600, color: '#94a3b8' }}>WIP:</span>
              <span style={{ fontSize: isMobile ? '1.1rem' : '1.3rem', fontWeight: 800, color: '#eab308' }}>{wip}</span>
            </div>

            <span className="dash-sum-sep" style={{ color: '#2a3050', fontSize: '1.2rem' }}>|</span>

            {/* PENDING - RED */}
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 7 : 12, flex: isMobile ? '1 1 auto' : 'none', justifyContent: 'center' }}>
              <span style={{ width: isMobile ? 10 : 14, height: isMobile ? 10 : 14, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 12px #ef4444, 0 0 24px rgba(239,68,68,0.5)', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: isMobile ? '0.88rem' : '1.05rem', fontWeight: 600, color: '#94a3b8' }}>Pending:</span>
              <span style={{ fontSize: isMobile ? '1.1rem' : '1.3rem', fontWeight: 800, color: '#ef4444' }}>{pending}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile Details Modal ── */}
      {selectedMobileTask && (() => {
        const activeTask = tasks.find(t => t.id === selectedMobileTask.id) || selectedMobileTask;
        const isAdmin = mobileTaskContext === 'admin';
        const canEdit = isAdmin || mobileTaskContext === 'employee';

        const handleDraftChange = (field: string, val: any) => {
          setMobileDraft((prev: any) => ({ ...prev, [field]: val }));
        };

        const saveMobileDraft = async () => {
          try {
            await fetch(`/api/tasks/${activeTask.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(mobileDraft)
            });
            showToast('Task updated!');
            setMobileEditMode(false);
            fetchTasks();
            setSelectedMobileTask({ ...activeTask, ...mobileDraft });
          } catch (e) {
            showToast('Failed to update task.');
          }
        };

        const fieldInputSt = {
          background: '#131722', border: '1px solid #4f7eff', borderRadius: '7px',
          color: '#f1f5f9', fontSize: '0.9rem', padding: '6px 10px',
          width: '100%', outline: 'none', fontFamily: 'inherit'
        };

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
            onClick={() => { setSelectedMobileTask(null); setMobileEditMode(false); }}>
            <div style={{ background: '#161926', borderTop: '1px solid #2a3050', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', padding: '24px 20px', paddingBottom: 'max(24px, env(safe-area-inset-bottom))', position: 'relative', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}
              onClick={e => e.stopPropagation()}>
              
              {/* Header Actions */}
              <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 10 }}>
                {isAdmin && !mobileEditMode && (
                  <button onClick={() => { setTaskToDelete(activeTask); setSelectedMobileTask(null); }} style={{ background: 'rgba(239,68,68,0.1)', border: 'none', color: '#ef4444', width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <Trash2 size={16} />
                  </button>
                )}
                {canEdit && !mobileEditMode && (
                  <button onClick={() => setMobileEditMode(true)} style={{ background: 'rgba(79,126,255,0.1)', border: 'none', color: '#4f7eff', width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <Pencil size={16} />
                  </button>
                )}
                <button onClick={() => { setSelectedMobileTask(null); setMobileEditMode(false); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#94a3b8', width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, fontWeight: 700 }}>
                {mobileEditMode ? 'Edit Task Details' : 'Task Details'}
              </div>
              
              <div style={{ overflowY: 'auto', paddingRight: 4 }}>
                {/* Title */}
                <div style={{ marginBottom: 20 }}>
                  {mobileEditMode ? (
                    <input autoFocus type="text" value={mobileDraft.title ?? activeTask.title}
                      onChange={e => handleDraftChange('title', e.target.value)}
                      style={{ ...fieldInputSt, fontSize: '1.1rem', fontWeight: 600 }} />
                  ) : (
                    <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#f8fafc', lineHeight: 1.3, paddingRight: 100 }}>{activeTask.title || 'Untitled Task'}</div>
                  )}
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  {/* Assignee */}
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Assignee</div>
                    {mobileEditMode && isAdmin ? (
                      <select value={mobileDraft.assigned_to ?? activeTask.assigned_to ?? ''}
                        onChange={e => handleDraftChange('assigned_to', e.target.value)}
                        style={fieldInputSt}>
                        <option value="">Unassigned</option>
                        {[...members].sort((a,b) => a.name.localeCompare(b.name)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    ) : (
                      <div style={{ color: '#f1f5f9', fontWeight: 500, fontSize: '0.9rem' }}>
                        {(mobileDraft.assigned_to ?? activeTask.assigned_to) ? members.find(m => m.id == (mobileDraft.assigned_to ?? activeTask.assigned_to))?.name || 'Unassigned' : 'Unassigned'}
                      </div>
                    )}
                  </div>
                  
                  {/* Recipient */}
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Recipient</div>
                    {mobileEditMode && isAdmin ? (
                      <input type="text" value={mobileDraft.recipient ?? activeTask.recipient ?? ''} placeholder="Recipient..."
                        onChange={e => handleDraftChange('recipient', e.target.value)}
                        style={fieldInputSt} />
                    ) : (
                      <div style={{ color: '#f1f5f9', fontWeight: 500, fontSize: '0.9rem' }}>{(mobileDraft.recipient ?? activeTask.recipient) || '—'}</div>
                    )}
                  </div>

                  {/* Activity */}
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Activity</div>
                    {mobileEditMode && isAdmin ? (
                      <select value={mobileDraft.action_type ?? activeTask.action_type}
                        onChange={e => handleDraftChange('action_type', e.target.value)}
                        style={fieldInputSt}>
                        <option value="" disabled>Select</option>
                        {ACTION_KEYS.map(k => <option key={k} value={k}>{getActionMeta(k).label}</option>)}
                      </select>
                    ) : (
                      <div style={{ color: '#f1f5f9', fontWeight: 500, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {getActionMeta(mobileDraft.action_type ?? activeTask.action_type).icon}
                        {getActionMeta(mobileDraft.action_type ?? activeTask.action_type).label}
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Status</div>
                    {mobileEditMode ? (
                      <select value={mobileDraft.status ?? activeTask.status}
                        onChange={e => handleDraftChange('status', e.target.value)}
                        style={fieldInputSt}>
                        <option value="DONE">Done</option>
                        <option value="WIP">WIP</option>
                        <option value="PENDING">Pending</option>
                      </select>
                    ) : (
                      <div style={{ color: getStatusStyle(mobileDraft.status ?? activeTask.status).color, fontWeight: 600, fontSize: '0.9rem' }}>
                        {getStatusStyle(mobileDraft.status ?? activeTask.status).label}
                      </div>
                    )}
                  </div>
                </div>

                {/* Deadline */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Deadline</div>
                  {mobileEditMode && isAdmin ? (
                    <input type="datetime-local" value={(mobileDraft.deadline ?? activeTask.deadline)?.slice(0, 16) || ''}
                      onClick={e => { try { (e.target as HTMLInputElement).showPicker?.(); } catch {} }}
                      onChange={e => handleDraftChange('deadline', e.target.value)}
                      style={{ ...fieldInputSt, colorScheme: 'dark' }} />
                  ) : (
                    <div style={{ color: (mobileDraft.deadline ?? activeTask.deadline) ? '#38bdf8' : '#94a3b8', fontWeight: 500, fontSize: '0.95rem' }}>
                      {(mobileDraft.deadline ?? activeTask.deadline) ? new Date(mobileDraft.deadline ?? activeTask.deadline).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No Deadline'}
                    </div>
                  )}
                </div>
              </div>

              {mobileEditMode && (
                <button 
                  onClick={saveMobileDraft}
                  style={{ width: '100%', padding: '14px', marginTop: 10, background: 'linear-gradient(135deg, #4f7eff, #6c4fe3)', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', boxShadow: '0 4px 15px rgba(79,126,255,0.3)' }}>
                  Save Changes
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Mobile FAB: floating + button (Admin View only) ── */}
      {isMobile && tab === 'admin' && (
        <button
          onClick={() => setShowMobileAdd(true)}
          style={{ position: 'fixed', bottom: 24, right: 20, zIndex: 700, width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #4f7eff, #6c4fe3)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fabPulse 2.4s ease-in-out infinite', transition: 'transform 0.15s' }}
          title="Add new task">
          <Plus size={24} />
        </button>
      )}

      {/* ── Mobile Add Task Bottom Sheet ── */}
      {showMobileAdd && (
        <MobileAddSheet
          newRow={newRow} setNewRow={setNewRow} members={members}
          onSubmit={submitNewRow} saving={savingNew}
          onClose={() => setShowMobileAdd(false)}
        />
      )}

      {/* ═════════════════════════════════════════════════ */}
      {/* DELETE CONFIRMATION POPUP MODAL                  */}
      {/* ═════════════════════════════════════════════════ */}
      {taskToDelete && (
        <div className="veil on" onClick={e => { if (e.target === e.currentTarget) setTaskToDelete(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#161926', border: '1px solid #2a3050', borderRadius: '14px', width: '100%', maxWidth: '480px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>Delete or Archive Task</h3>
                  <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '2px 0 0' }}>Choose whether to soft-delete (archive) or permanently delete</p>
                </div>
              </div>
              <button onClick={() => setTaskToDelete(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
            </div>

            {/* Task summary card */}
            <div style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '10px', padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                {(() => {
                  const am = getActionMeta(taskToDelete.action_type);
                  return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#e2e8f0', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', fontWeight: 600, fontSize: '0.74rem', padding: '2px 8px', borderRadius: '5px' }}>
                      <span style={{ color: '#94a3b8' }}>{am.icon}</span>
                      <span>{am.label}</span>
                    </span>
                  );
                })()}
                <span style={{ fontWeight: 600, fontSize: '0.92rem', color: '#f1f5f9' }}>{taskToDelete.title}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {taskToDelete.recipient && <span>Recipient: <strong style={{ color: '#f1f5f9' }}>{taskToDelete.recipient}</strong></span>}
                {taskToDelete.assignee_name && <span>Assignee: <strong style={{ color: '#f1f5f9' }}>{taskToDelete.assignee_name}</strong></span>}
                {taskToDelete.deadline && <span>Deadline: <strong style={{ color: '#f1f5f9' }}>{new Date(taskToDelete.deadline).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong></span>}
              </div>
            </div>

            {/* Explanation */}
            <p style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.4, marginBottom: 22 }}>
              To prevent accidental data loss, you can <strong>Archive (Soft Delete)</strong> this task to remove it from your active daily list while keeping it safe in the database, or choose <strong>Permanent Delete</strong>.
            </p>

            {/* Action buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => handleSoftDelete(taskToDelete)}
                style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid #0284c7', color: '#38bdf8', borderRadius: '9px', padding: '11px 16px', fontSize: '0.86rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s' }}
                onMouseOver={e => (e.currentTarget.style.background = 'rgba(56,189,248,0.22)')}
                onMouseOut={e  => (e.currentTarget.style.background = 'rgba(56,189,248,0.12)')}>
                <Archive size={16} />
                <span>Archive Task (Soft Delete — Recommended)</span>
              </button>
              <button onClick={() => handlePermanentDelete(taskToDelete)}
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid #b91c1c', color: '#ef4444', borderRadius: '9px', padding: '11px 16px', fontSize: '0.86rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s' }}
                onMouseOver={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.22)')}
                onMouseOut={e  => (e.currentTarget.style.background = 'rgba(239,68,68,0.12)')}>
                <Trash2 size={16} />
                <span>Permanent Delete (Remove from DB)</span>
              </button>
              <button onClick={() => setTaskToDelete(null)}
                style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', borderRadius: '9px', padding: '10px 16px', fontSize: '0.84rem', fontWeight: 500, cursor: 'pointer', marginTop: 4 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════ */}
      {/* ARCHIVED TASKS MODAL                             */}
      {/* ═════════════════════════════════════════════════ */}
      {showArchived && (
        <div className="veil on" onClick={e => { if (e.target === e.currentTarget) setShowArchived(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#161926', border: '1px solid #2a3050', borderRadius: '14px', width: '100%', maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: '10px', background: 'rgba(56,189,248,0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Archive size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>Archived Tasks</h3>
                  <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '2px 0 0' }}>Tasks archived on {currentDate}</p>
                </div>
              </div>
              <button onClick={() => setShowArchived(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, margin: '8px 0 16px' }}>
              {loadingArchived ? (
                <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Loading archived tasks...</div>
              ) : archivedTasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 36, color: '#94a3b8', fontSize: '0.88rem' }}>
                  No archived tasks found for {currentDate}.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {archivedTasks.map(t => {
                    const am = getActionMeta(t.action_type);
                    return (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#131722', border: '1px solid #2a3050', borderRadius: '9px', padding: '12px 16px', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#e2e8f0', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', fontWeight: 600, fontSize: '0.72rem', padding: '2px 7px', borderRadius: '4px' }}>
                              <span style={{ color: '#94a3b8' }}>{am.icon}</span>
                              <span>{am.label}</span>
                            </span>
                            <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#f1f5f9' }}>{t.title}</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {t.recipient && <span>Recipient: {t.recipient}</span>}
                            {t.assignee_name && <span>Assignee: {t.assignee_name}</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <button onClick={() => handleRestoreTask(t)}
                            style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid #22c55e', color: '#22c55e', borderRadius: '7px', padding: '6px 12px', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                            title="Restore back to active list">
                            <RotateCcw size={13} />
                            <span>Restore</span>
                          </button>
                          <button onClick={() => handlePermanentDelete(t)}
                            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '7px', padding: '6px 10px', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                            title="Delete permanently">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #2a3050', paddingTop: 14 }}>
              <button onClick={() => setShowArchived(false)}
                style={{ background: '#4f7eff', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: '7px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toastMsg && <div className="toast on" style={{ background: '#1e2438', border: '1px solid #4f7eff', color: '#f8fafc', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>{toastMsg}</div>}
    </>
  );
}
