/**
 * Meetings & Contacts Module
 *
 * Table-based layout matching HR / Accounts sections.
 * No horizontal scrolling — table uses fixed layout fitted to screen.
 * FAB + bottom-sheet for add/edit. Plain styling, minimal colour.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, Trash2, Edit3 } from 'lucide-react';
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

function fmtDateShort(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  } catch { return iso; }
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return ''; }
}

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return iso; }
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
        <div className="fg">
          <label>Meeting Title</label>
          <input name="title" placeholder="e.g. Client Pitch" value={form.title} onChange={onChange} required />
        </div>
        <div className="fg">
          <label>Contact Name <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
          <input name="contact_name" placeholder="e.g. John Doe" value={form.contact_name} onChange={onChange} />
        </div>
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
        <div className="fg">
          <label>Remind (Minutes Before)</label>
          <input name="reminder_minutes_before" placeholder="e.g. 30, 15" value={form.reminder_minutes_before} onChange={onChange} />
          <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} /> Telegram alert will be sent to admin at these minutes before the meeting.
          </div>
        </div>
        <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '.95rem', fontWeight: 700, borderRadius: 10 }} disabled={saving}>
          {saving ? 'Saving...' : editId ? 'Update Meeting' : 'Schedule Meeting'}
        </button>
      </form>
    </>
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
    } catch { showToast('Error loading meetings.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  function openAdd() { setEditId(null); setForm(BLANK); setSheetOpen(true); }

  function openEdit(m: Meeting) {
    setEditId(m.id);
    const dt = new Date(m.scheduled_at);
    const date = dt.toLocaleDateString('en-CA');
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    setForm({ title: m.title, contact_name: m.contact_name || '', scheduled_date: date, scheduled_time: `${hh}:${mm}`, reminder_minutes_before: m.reminder_minutes_before || '30, 15' });
    setSheetOpen(true);
  }

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.scheduled_date || !form.scheduled_time) { showToast('Title, date and time are required.'); return; }
    setSaving(true);
    try {
      const scheduled_at = new Date(`${form.scheduled_date}T${form.scheduled_time}`).toISOString();
      const url = editId ? `/api/meetings/${editId}` : '/api/meetings';
      const res = await fetch(url, {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, contact_name: form.contact_name, scheduled_at, reminder_minutes_before: form.reminder_minutes_before }),
      });
      if (!res.ok) throw new Error('Failed');
      showToast(editId ? 'Meeting updated.' : 'Meeting scheduled!');
      setSheetOpen(false);
      fetchMeetings();
    } catch { showToast('Error saving meeting.'); }
    finally { setSaving(false); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/meetings/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Meeting deleted.');
      setDeleteTarget(null);
      fetchMeetings();
    } catch { showToast('Error deleting.'); }
  }

  // ── table cell styles ──────────────────────────────────────────────────────
  const th: React.CSSProperties = {
    padding: '8px 10px', fontSize: '.62rem', fontWeight: 700, color: 'var(--muted)',
    textTransform: 'uppercase', letterSpacing: '.04em',
    borderBottom: '1px solid var(--border)',
    background: 'rgba(0,0,0,.1)', textAlign: 'left', whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    padding: '10px 10px', fontSize: '.78rem', color: 'var(--text)', verticalAlign: 'middle',
  };

  return (
    <>
      <Topbar title="Meetings & Contacts" />

      {toast && (
        <div style={{ position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)', background: '#1d2133', border: '1px solid #2a3050', borderRadius: 10, padding: '10px 20px', fontSize: '.84rem', zIndex: 999, color: '#dde2f0', whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,.4)' }}>
          {toast}
        </div>
      )}

      <div style={{ padding: '12px 16px 100px', overflowY: 'auto', overflowX: 'hidden', height: 'calc(100dvh - 56px)', boxSizing: 'border-box' }}>

        {/* Table card */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-head">
            <h3>Scheduled Meetings</h3>
            <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{meetings.length} total</span>
          </div>

          {/* Fixed-layout table — fits viewport, zero horizontal scroll */}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              {/* Title | Contact | Date | Time | Actions */}
              <col style={{ width: '28%' }} />
              <col style={{ width: '26%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={th}>Title</th>
                <th style={th}>Contact</th>
                <th style={th}>Date</th>
                <th style={th}>Time</th>
                <th style={{ ...th, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)', fontSize: '.82rem' }}>Loading...</td></tr>
              ) : meetings.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)', fontSize: '.82rem' }}>
                  <Calendar size={22} style={{ opacity: .3, display: 'block', margin: '0 auto 8px' }} />
                  No meetings scheduled yet.
                </td></tr>
              ) : meetings.map((m, i) => (
                <tr key={m.id} style={{ borderBottom: i < meetings.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  {/* Title */}
                  <td style={td}>
                    <div style={{ fontWeight: 600, fontSize: '.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                  </td>
                  {/* Contact */}
                  <td style={{ ...td, fontSize: '.76rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.contact_name || '—'}
                  </td>
                  {/* Date */}
                  <td style={{ ...td, fontSize: '.74rem', whiteSpace: 'nowrap' }}>{fmtDateShort(m.scheduled_at)}</td>
                  {/* Time */}
                  <td style={{ ...td, fontSize: '.74rem', whiteSpace: 'nowrap' }}>{fmtTime(m.scheduled_at)}</td>
                  {/* Actions */}
                  <td style={{ ...td, textAlign: 'right', padding: '6px 8px' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button onClick={() => openEdit(m)} title="Edit" style={iconBtn}><Edit3 size={13} /></button>
                      <button onClick={() => setDeleteTarget(m)} title="Delete" style={{ ...iconBtn, color: 'var(--red)' }}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAB */}
      <button id="meeting-fab" onClick={openAdd} style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 800, width: 56, height: 56, borderRadius: '50%', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: '1.8rem', cursor: 'pointer', boxShadow: '0 4px 20px rgba(79,126,255,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        +
      </button>

      {/* Add/Edit bottom sheet */}
      {sheetOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) setSheetOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 910, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, paddingBottom: 'env(safe-area-inset-bottom,12px)', maxHeight: '92dvh', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,.5)', animation: 'slideSheet .22s ease-out' }}>
            <MeetingSheet editId={editId} form={form} saving={saving} onClose={() => setSheetOpen(false)} onChange={handleChange} onSubmit={handleSubmit} />
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }} style={{ position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 340, padding: 24, boxShadow: '0 8px 40px rgba(0,0,0,.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(242,92,122,.12)', border: '1px solid rgba(242,92,122,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)' }}>
                <Trash2 size={22} />
              </div>
            </div>
            <h3 style={{ textAlign: 'center', fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Delete Meeting?</h3>
            <p style={{ textAlign: 'center', fontSize: '.88rem', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{deleteTarget.title}</p>
            <p style={{ textAlign: 'center', fontSize: '.76rem', color: 'var(--muted)', marginBottom: 22 }}>{fmtDateTime(deleteTarget.scheduled_at)}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: '.88rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={confirmDelete} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: 'var(--red)', color: '#fff', fontSize: '.88rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideSheet{from{transform:translateY(50px);opacity:0}to{transform:translateY(0);opacity:1}}
      `}</style>
    </>
  );
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer',
  borderRadius: 6, width: 28, height: 28,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background .12s', fontFamily: 'inherit',
};
