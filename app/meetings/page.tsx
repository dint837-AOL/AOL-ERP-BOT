/**
 * Meetings & Contacts Module
 *
 * Schedules client meetings and manages contact information.
 * Telegram reminders are sent to admin before each meeting.
 * Layout: Mobile-first, single screen, no horizontal scrolling.
 * Pattern: Matches Accounts / Credentials pages (FAB + bottom sheet + card list).
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar, User, Clock, Trash2, Edit3, MoreVertical } from 'lucide-react';
import Topbar from '../components/Topbar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Meeting {
  id: string;
  title: string;
  contact_name?: string;
  scheduled_at: string;
  reminder_minutes_before?: string;
}

type MeetingForm = {
  title: string;
  contact_name: string;
  scheduled_date: string;
  scheduled_time: string;
  reminder_minutes_before: string;
};

const BLANK: MeetingForm = {
  title: '',
  contact_name: '',
  scheduled_date: '',
  scheduled_time: '',
  reminder_minutes_before: '30, 15',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  } catch { return iso; }
}

function fmtDateShort(iso: string) {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    return `${dd}-${mm}-${yy}`;
  } catch { return iso; }
}

function fmtTimeShort(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return ''; }
}

function getMinsUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 60000);
}

function getMeetingStatus(iso: string): 'upcoming' | 'today' | 'soon' | 'past' {
  const mins = getMinsUntil(iso);
  if (mins < 0) return 'past';
  if (mins <= 60) return 'soon';
  const today = new Date().toDateString();
  const meetDay = new Date(iso).toDateString();
  if (today === meetDay) return 'today';
  return 'upcoming';
}

// ─── Meeting Sheet ────────────────────────────────────────────────────────────

interface MeetingSheetProps {
  editId: string | null;
  form: MeetingForm;
  saving: boolean;
  onClose: () => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function MeetingSheet({ editId, form, saving, onClose, onChange, onSubmit }: MeetingSheetProps) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 12px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{editId ? 'Edit Meeting' : 'Schedule Meeting'}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1, padding: 4 }}>X</button>
      </div>

      <form onSubmit={onSubmit} style={{ padding: '0 20px 24px' }}>
        {/* Title */}
        <div className="fg">
          <label>Meeting Title</label>
          <input name="title" placeholder="e.g. Client Pitch, Project Review" value={form.title} onChange={onChange} required />
        </div>

        {/* Contact */}
        <div className="fg">
          <label>Contact Name <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
          <input name="contact_name" placeholder="e.g. John Doe" value={form.contact_name} onChange={onChange} />
        </div>

        {/* Date + Time */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 13 }}>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label>Date</label>
            <input type="date" name="scheduled_date" value={form.scheduled_date} onChange={onChange} required />
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label>Time</label>
            <input type="time" name="scheduled_time" value={form.scheduled_time} onChange={onChange} required />
          </div>
        </div>

        {/* Reminder mins */}
        <div className="fg">
          <label>Remind (Minutes Before)</label>
          <input
            name="reminder_minutes_before"
            placeholder="e.g. 30, 15"
            value={form.reminder_minutes_before}
            onChange={onChange}
          />
          <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} />
            Telegram alert will be sent to admin at these minutes before the meeting.
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '.95rem', fontWeight: 700, borderRadius: 10 }}
          disabled={saving}
        >
          {saving ? 'Saving...' : editId ? 'Update Meeting' : 'Schedule Meeting'}
        </button>
      </form>
    </>
  );
}

// ─── Meeting Card ─────────────────────────────────────────────────────────────

interface MeetingCardProps {
  meeting: Meeting;
  onEdit: () => void;
  onDelete: () => void;
}

function MeetingCard({ meeting, onEdit, onDelete }: MeetingCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = getMeetingStatus(meeting.scheduled_at);
  const mins = getMinsUntil(meeting.scheduled_at);

  const statusColors: Record<string, string> = {
    past: 'var(--muted)',
    upcoming: 'var(--primary)',
    today: 'var(--green)',
    soon: 'var(--orange)',
  };
  const statusLabels: Record<string, string> = {
    past: 'Past',
    upcoming: 'Upcoming',
    today: 'Today',
    soon: mins <= 0 ? 'Now' : `In ${mins}m`,
  };
  const statusBgs: Record<string, string> = {
    past: 'rgba(106,117,144,.1)',
    upcoming: 'rgba(79,126,255,.1)',
    today: 'rgba(38,196,134,.1)',
    soon: 'rgba(245,166,35,.1)',
  };

  return (
    <div
      style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '13px 14px', display: 'flex', alignItems: 'flex-start', gap: 12,
        position: 'relative', opacity: status === 'past' ? 0.6 : 1,
        transition: 'opacity .2s'
      }}
    >
      {/* Calendar avatar */}
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: statusBgs[status], color: statusColors[status],
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Calendar size={17} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title + status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
            {meeting.title}
          </span>
          <span style={{
            fontSize: '.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 5,
            textTransform: 'uppercase', letterSpacing: '.04em',
            color: statusColors[status], background: statusBgs[status]
          }}>
            {statusLabels[status]}
          </span>
        </div>

        {/* Contact */}
        {meeting.contact_name && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, fontSize: '.74rem', color: 'var(--muted)' }}>
            <User size={11} />
            {meeting.contact_name}
          </div>
        )}

        {/* Date + time + reminder */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.72rem', color: 'var(--text)', fontWeight: 600 }}>
            <Calendar size={11} style={{ opacity: .6 }} />
            {fmtDateShort(meeting.scheduled_at)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.72rem', color: statusColors[status], fontWeight: 600 }}>
            <Clock size={11} />
            {fmtTimeShort(meeting.scheduled_at)}
          </div>
          {meeting.reminder_minutes_before && (
            <div style={{ fontSize: '.68rem', color: 'var(--orange)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Clock size={10} />
              {meeting.reminder_minutes_before} min
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
          style={{
            background: menuOpen ? 'rgba(255,255,255,.08)' : 'none',
            border: '1px solid ' + (menuOpen ? 'var(--border)' : 'transparent'),
            color: 'var(--muted)', cursor: 'pointer', borderRadius: 8,
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .15s', fontFamily: 'inherit'
          }}
        >
          <MoreVertical size={15} />
        </button>

        {menuOpen && (
          <div
            style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 200,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,.4)', minWidth: 150, overflow: 'hidden',
              animation: 'fadeIn .12s ease-out'
            }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => { onEdit(); setMenuOpen(false); }} style={menuBtnStyle}>
              <Edit3 size={13} /> Edit
            </button>
            <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
            <button onClick={() => { onDelete(); setMenuOpen(false); }} style={{ ...menuBtnStyle, color: 'var(--red)' }}>
              <Trash2 size={13} /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const menuBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', background: 'none', border: 'none',
  color: 'var(--text)', fontSize: '.82rem', fontWeight: 500,
  padding: '10px 14px', cursor: 'pointer', textAlign: 'left',
  transition: 'background .12s', fontFamily: 'inherit',
};

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 4, color }}>
        {value}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<MeetingForm>(BLANK);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Meeting | null>(null);

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2600); }

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/meetings');
      const data = await res.json();
      setMeetings(Array.isArray(data) ? data : []);
    } catch {
      showToast('Error loading meetings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  function openAdd() {
    setEditId(null);
    setForm(BLANK);
    setSheetOpen(true);
  }

  function openEdit(m: Meeting) {
    setEditId(m.id);
    // Parse ISO into separate date + time for inputs
    const dt = new Date(m.scheduled_at);
    const date = dt.toLocaleDateString('en-CA'); // YYYY-MM-DD
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    setForm({
      title: m.title,
      contact_name: m.contact_name || '',
      scheduled_date: date,
      scheduled_time: `${hh}:${mm}`,
      reminder_minutes_before: m.reminder_minutes_before || '30, 15',
    });
    setSheetOpen(true);
  }

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.scheduled_date || !form.scheduled_time) {
      showToast('Title, date and time are required.');
      return;
    }
    setSaving(true);
    try {
      const scheduled_at = new Date(`${form.scheduled_date}T${form.scheduled_time}`).toISOString();
      const url = editId ? `/api/meetings/${editId}` : '/api/meetings';
      const method = editId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          contact_name: form.contact_name,
          scheduled_at,
          reminder_minutes_before: form.reminder_minutes_before,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      showToast(editId ? 'Meeting updated.' : 'Meeting scheduled!');
      setSheetOpen(false);
      fetchMeetings();
    } catch {
      showToast('Error saving meeting.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/meetings/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Meeting deleted.');
      setDeleteTarget(null);
      fetchMeetings();
    } catch {
      showToast('Error deleting.');
    }
  }

  // ── Derived stats ────────────────────────────────────────────────────────
  const total = meetings.length;
  const todayCount = meetings.filter(m => getMeetingStatus(m.scheduled_at) === 'today' || getMeetingStatus(m.scheduled_at) === 'soon').length;
  const upcoming = meetings.filter(m => getMeetingStatus(m.scheduled_at) === 'upcoming').length;
  const past = meetings.filter(m => getMeetingStatus(m.scheduled_at) === 'past').length;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <Topbar title="Meetings & Contacts" />

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)',
          background: '#1d2133', border: '1px solid #2a3050', borderRadius: 10,
          padding: '10px 20px', fontSize: '.84rem', zIndex: 999, color: '#dde2f0',
          whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,.4)'
        }}>
          {toast}
        </div>
      )}

      {/* Scroll area */}
      <div style={{
        padding: '12px 16px 100px', overflowY: 'auto', overflowX: 'hidden',
        height: 'calc(100dvh - 56px)', display: 'flex', flexDirection: 'column',
        boxSizing: 'border-box', gap: 12
      }}>

        {/* Summary stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
          <StatCard label="Total" value={total} color="var(--primary)" />
          <StatCard label="Today / Soon" value={todayCount} color={todayCount > 0 ? 'var(--orange)' : 'var(--muted)'} />
          <StatCard label="Upcoming" value={upcoming} color="var(--green)" />
          <StatCard label="Past" value={past} color="var(--muted)" />
        </div>

        {/* Meetings list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: '.84rem' }}>
              Loading meetings...
            </div>
          ) : meetings.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '48px 20px', color: 'var(--muted)', fontSize: '.84rem',
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12
            }}>
              <Calendar size={28} style={{ opacity: .3, marginBottom: 12 }} />
              <div>No meetings scheduled yet.</div>
              <div style={{ fontSize: '.76rem', marginTop: 6 }}>Tap + to schedule your first meeting.</div>
            </div>
          ) : (
            meetings.map(m => (
              <MeetingCard
                key={m.id}
                meeting={m}
                onEdit={() => openEdit(m)}
                onDelete={() => setDeleteTarget(m)}
              />
            ))
          )}
        </div>
      </div>

      {/* FAB */}
      <button
        id="meeting-fab"
        onClick={openAdd}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 800,
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--primary)', color: '#fff', border: 'none',
          fontSize: '1.8rem', cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(79,126,255,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
      >
        +
      </button>

      {/* Add/Edit bottom sheet */}
      {sheetOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setSheetOpen(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 910,
            background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
          }}
        >
          <div style={{
            background: 'var(--surface)', borderRadius: '20px 20px 0 0',
            width: '100%', maxWidth: 560,
            paddingBottom: 'env(safe-area-inset-bottom,12px)',
            maxHeight: '92dvh', overflowY: 'auto',
            boxShadow: '0 -8px 40px rgba(0,0,0,.5)',
            animation: 'slideSheet .22s ease-out'
          }}>
            <MeetingSheet
              editId={editId}
              form={form}
              saving={saving}
              onClose={() => setSheetOpen(false)}
              onChange={handleChange}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 950,
            background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, animation: 'fadeIn .18s ease-out'
          }}
        >
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 16, width: '100%', maxWidth: 340, padding: 24,
            boxShadow: '0 8px 40px rgba(0,0,0,.5)', animation: 'slideUp .2s ease-out'
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: 'rgba(242,92,122,.12)', border: '1px solid rgba(242,92,122,.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)'
              }}>
                <Trash2 size={22} />
              </div>
            </div>
            <h3 style={{ textAlign: 'center', fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Delete Meeting?</h3>
            <p style={{ textAlign: 'center', fontSize: '.88rem', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{deleteTarget.title}</p>
            <p style={{ textAlign: 'center', fontSize: '.76rem', color: 'var(--muted)', marginBottom: 22 }}>
              {fmtDateTime(deleteTarget.scheduled_at)}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: '.88rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: 'var(--red)', color: '#fff', fontSize: '.88rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideSheet{from{transform:translateY(50px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
      `}</style>
    </>
  );
}
