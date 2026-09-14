/**
 * Meetings — thin cards (tenders / daily-tasks pattern)
 * Card: Title | With whom | deadline (1D/2H/30M)
 * Detail: Meeting title, With whom, Date & time, Reminder Day/Hour/Minute
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar, Trash2, Pencil, X, Plus } from 'lucide-react';
import Topbar from '../components/Topbar';

interface Meeting {
  id: string;
  title: string;
  contact_name?: string;
  scheduled_at: string;
  notify_email?: number;
  reminder_days?: number | null;
  reminder_hours?: number | null;
  reminder_minutes?: number | null;
}

type MeetingForm = {
  title: string;
  contact_name: string;
  scheduled_at: string;
  reminder_days: string;
  reminder_hours: string;
  reminder_minutes: string;
};

const BLANK: MeetingForm = {
  title: '',
  contact_name: '',
  scheduled_at: '',
  reminder_days: '',
  reminder_hours: '',
  reminder_minutes: '',
};

const WHITE = '#ffffff';
const MUTED_LABEL = 'rgba(255,255,255,0.55)';
const BLUE = '#4f7eff';
const BLUE_BG = 'rgba(79,126,255,0.15)';
const BLUE_GRAD = 'linear-gradient(135deg, #4f7eff, #6c4fe3)';

const fieldInputSt: React.CSSProperties = {
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
const fieldEditSt: React.CSSProperties = { ...fieldInputSt, border: '1px solid #3a4568' };
const labelSt: React.CSSProperties = {
  fontSize: '0.62rem',
  color: MUTED_LABEL,
  textTransform: 'uppercase',
  marginBottom: 2,
  fontWeight: 600,
  letterSpacing: '0.04em',
};
const valueSt: React.CSSProperties = {
  color: WHITE,
  fontWeight: 500,
  fontSize: '0.82rem',
  lineHeight: 1.25,
};

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <div style={labelSt}>
      {children}
      {optional ? ' (optional)' : ''}
    </div>
  );
}

function toLocalInput(iso?: string) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

function fmtDateTime(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function getCountdownShort(deadline?: string): string {
  if (!deadline) return '—';
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff < 0) return '0M';
  const days = Math.floor(diff / 86400000);
  if (days >= 1) return `${days}D`;
  const hours = Math.floor(diff / 3600000);
  if (hours >= 1) return `${hours}H`;
  const mins = Math.max(1, Math.floor(diff / 60000));
  return `${mins}M`;
}

function meetingToForm(m: Meeting): MeetingForm {
  return {
    title: m.title || '',
    contact_name: m.contact_name || '',
    scheduled_at: toLocalInput(m.scheduled_at),
    reminder_days: m.reminder_days != null && Number(m.reminder_days) > 0 ? String(m.reminder_days) : '',
    reminder_hours: m.reminder_hours != null && Number(m.reminder_hours) > 0 ? String(m.reminder_hours) : '',
    reminder_minutes: m.reminder_minutes != null && Number(m.reminder_minutes) > 0 ? String(m.reminder_minutes) : '',
  };
}

function buildPayload(form: MeetingForm) {
  const remDays = form.reminder_days.trim() === '' ? null : Number(form.reminder_days);
  const remHours = form.reminder_hours.trim() === '' ? null : Number(form.reminder_hours);
  const remMins = form.reminder_minutes.trim() === '' ? null : Number(form.reminder_minutes);
  const hasReminder =
    (remDays != null && remDays > 0) ||
    (remHours != null && remHours > 0) ||
    (remMins != null && remMins > 0);

  return {
    title: form.title.trim(),
    contact_name: form.contact_name.trim(),
    scheduled_at: new Date(form.scheduled_at).toISOString(),
    reminder_days: remDays,
    reminder_hours: remHours,
    reminder_minutes: remMins,
    notify_email: hasReminder ? 1 : 0,
  };
}

function ReminderBoxes({
  form,
  editMode,
  onChange,
}: {
  form: MeetingForm;
  editMode: boolean;
  onChange: (field: keyof MeetingForm, val: string) => void;
}) {
  const box = (label: string, field: 'reminder_days' | 'reminder_hours' | 'reminder_minutes', ph: string) => (
    <div style={{ flex: 1 }}>
      <div style={{ ...labelSt, marginBottom: 2 }}>{label}</div>
      {editMode ? (
        <input
          type="number"
          min={0}
          placeholder={ph}
          value={form[field]}
          onChange={e => onChange(field, e.target.value)}
          style={{ ...fieldEditSt, textAlign: 'center', padding: '5px 6px' }}
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
      <FieldLabel optional>Reminder</FieldLabel>
      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
        {box('Day', 'reminder_days', '2')}
        {box('Hour', 'reminder_hours', '10')}
        {box('Minute', 'reminder_minutes', '30')}
      </div>
    </div>
  );
}

function CompactMeetingCard({ meeting, onClick }: { meeting: Meeting; onClick: () => void }) {
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
        {meeting.title || 'Untitled Meeting'}
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
        {meeting.contact_name || '—'}
      </div>
      <div style={{ fontSize: '0.82rem', color: WHITE, whiteSpace: 'nowrap', fontWeight: 600, flexShrink: 0, marginLeft: 40 }}>
        {getCountdownShort(meeting.scheduled_at)}
      </div>
    </div>
  );
}

function MeetingFields({
  form,
  editMode,
  onChange,
  viewSource,
}: {
  form: MeetingForm;
  editMode: boolean;
  onChange: (field: keyof MeetingForm, val: string) => void;
  viewSource?: Meeting | undefined;
}) {
  const v = viewSource;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <FieldLabel>Meeting Title</FieldLabel>
        {editMode ? (
          <input
            autoFocus
            type="text"
            value={form.title}
            onChange={e => onChange('title', e.target.value)}
            style={{ ...fieldEditSt, fontWeight: 600 }}
            placeholder="e.g. Client Pitch"
          />
        ) : (
          <div style={{ ...valueSt, fontWeight: 600, fontSize: '0.95rem', paddingRight: 90 }}>{v?.title || '—'}</div>
        )}
      </div>

      <div>
        <FieldLabel optional>With Whom</FieldLabel>
        {editMode ? (
          <input
            type="text"
            value={form.contact_name}
            onChange={e => onChange('contact_name', e.target.value)}
            style={fieldEditSt}
            placeholder="e.g. John Doe"
          />
        ) : (
          <div style={valueSt}>{v?.contact_name || '—'}</div>
        )}
      </div>

      <div>
        <FieldLabel>Date & Time</FieldLabel>
        {editMode ? (
          <input
            type="datetime-local"
            value={form.scheduled_at}
            onClick={e => {
              try {
                (e.target as HTMLInputElement).showPicker?.();
              } catch {}
            }}
            onChange={e => onChange('scheduled_at', e.target.value)}
            style={{ ...fieldEditSt, colorScheme: 'dark' }}
          />
        ) : (
          <div style={valueSt}>{v?.scheduled_at ? fmtDateTime(v.scheduled_at) : '—'}</div>
        )}
      </div>

      <ReminderBoxes form={form} editMode={editMode} onChange={onChange} />
    </div>
  );
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const [selected, setSelected] = useState<Meeting | null>(null);
  const [draft, setDraft] = useState<MeetingForm>(BLANK);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<MeetingForm>(BLANK);
  const [savingAdd, setSavingAdd] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Meeting | null>(null);

  function showToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(''), 2600);
  }

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

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  function openDetail(m: Meeting) {
    setSelected(m);
    setDraft(meetingToForm(m));
    setEditMode(false);
  }

  function closeDetail() {
    setSelected(null);
    setEditMode(false);
  }

  async function saveDraft() {
    if (!selected) return;
    if (!draft.title.trim() || !draft.scheduled_at) {
      showToast('Title and date/time are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/meetings/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(draft)),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json();
      showToast('Meeting updated.');
      setEditMode(false);
      await fetchMeetings();
      setSelected(updated);
      setDraft(meetingToForm(updated));
    } catch {
      showToast('Error saving meeting.');
    } finally {
      setSaving(false);
    }
  }

  async function submitAdd() {
    if (!addForm.title.trim() || !addForm.scheduled_at) {
      showToast('Title and date/time are required.');
      return;
    }
    setSavingAdd(true);
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(addForm)),
      });
      if (!res.ok) throw new Error('Failed');
      showToast('Meeting scheduled!');
      setShowAdd(false);
      setAddForm(BLANK);
      fetchMeetings();
    } catch {
      showToast('Error saving meeting.');
    } finally {
      setSavingAdd(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/meetings/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Meeting deleted.');
      setDeleteTarget(null);
      closeDetail();
      fetchMeetings();
    } catch {
      showToast('Error deleting.');
    }
  }

  const active = selected ? meetings.find(m => m.id === selected.id) || selected : null;

  return (
    <>
      <Topbar title="Meetings & Contacts" />

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 88,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1d2133',
            border: '1px solid #2a3050',
            borderRadius: 10,
            padding: '10px 20px',
            fontSize: '.84rem',
            zIndex: 99999,
            color: WHITE,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 20px rgba(0,0,0,.4)',
          }}
        >
          {toast}
        </div>
      )}

      <div
        style={{
          padding: '14px 14px 100px',
          overflowY: 'auto',
          height: 'calc(100dvh - 56px)',
          boxSizing: 'border-box',
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: WHITE, opacity: 0.6, fontSize: '0.85rem' }}>Loading...</div>
        ) : meetings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: WHITE, opacity: 0.6, fontSize: '0.85rem' }}>
            <Calendar size={28} style={{ opacity: 0.3, display: 'block', margin: '0 auto 10px' }} />
            No meetings yet. Tap + to schedule one.
          </div>
        ) : (
          meetings.map(m => <CompactMeetingCard key={m.id} meeting={m} onClick={() => openDetail(m)} />)
        )}
      </div>

      <button
        onClick={() => {
          setAddForm(BLANK);
          setShowAdd(true);
        }}
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
        title="Add meeting"
      >
        <Plus size={24} />
      </button>

      {active && (
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
          onClick={closeDetail}
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
              {!editMode && (
                <button
                  onClick={() => setEditMode(true)}
                  style={{
                    background: BLUE_BG,
                    border: 'none',
                    color: BLUE,
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Pencil size={15} />
                </button>
              )}
              {!editMode && (
                <button
                  onClick={() => {
                    setDeleteTarget(active);
                    closeDetail();
                  }}
                  style={{
                    background: 'rgba(239,68,68,0.12)',
                    border: 'none',
                    color: '#ef4444',
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                onClick={closeDetail}
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
                paddingRight: 110,
                opacity: 0.7,
              }}
            >
              {editMode ? 'Edit Meeting' : 'Meeting Details'}
            </div>

            <MeetingFields
              form={draft}
              editMode={editMode}
              onChange={(field, val) => setDraft(prev => ({ ...prev, [field]: val }))}
              viewSource={editMode ? undefined : active}
            />

            {editMode && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(meetingToForm(active));
                    setEditMode(false);
                  }}
                  style={{
                    padding: '10px',
                    borderRadius: 9,
                    border: '1px solid #2a3050',
                    background: '#131722',
                    color: WHITE,
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveDraft}
                  disabled={saving}
                  style={{
                    padding: '10px',
                    borderRadius: 9,
                    border: 'none',
                    background: BLUE_GRAD,
                    color: WHITE,
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: '0 4px 15px rgba(79,126,255,0.3)',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showAdd && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 800,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
          <div onClick={() => setShowAdd(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }} />
          <div
            style={{
              position: 'relative',
              background: '#161926',
              borderRadius: '18px 18px 0 0',
              border: '1px solid #2a3050',
              borderBottom: 'none',
              padding: '12px 16px 16px',
              paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
              width: '100%',
              maxWidth: 560,
              maxHeight: '100dvh',
              overflow: 'hidden',
            }}
          >
            <div style={{ width: 36, height: 3, background: '#2a3050', borderRadius: 2, margin: '0 auto 10px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: WHITE, margin: 0 }}>Add Meeting</h3>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: WHITE, cursor: 'pointer', padding: 4, opacity: 0.7 }}>
                <X size={18} />
              </button>
            </div>

            <MeetingFields form={addForm} editMode onChange={(field, val) => setAddForm(p => ({ ...p, [field]: val }))} />

            <button
              type="button"
              onClick={submitAdd}
              disabled={savingAdd}
              style={{
                width: '100%',
                marginTop: 12,
                padding: '11px',
                borderRadius: 9,
                border: 'none',
                background: BLUE_GRAD,
                color: WHITE,
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 4px 15px rgba(79,126,255,0.3)',
                opacity: savingAdd ? 0.7 : 1,
              }}
            >
              {savingAdd ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          onClick={e => {
            if (e.target === e.currentTarget) setDeleteTarget(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            background: 'rgba(0,0,0,.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              background: '#161926',
              border: '1px solid #2a3050',
              borderRadius: 16,
              width: '100%',
              maxWidth: 340,
              padding: 22,
            }}
          >
            <h3 style={{ textAlign: 'center', fontSize: '1rem', fontWeight: 700, marginBottom: 8, color: WHITE }}>Delete Meeting?</h3>
            <p style={{ textAlign: 'center', fontSize: '.88rem', fontWeight: 600, color: WHITE, marginBottom: 4 }}>{deleteTarget.title}</p>
            <p style={{ textAlign: 'center', fontSize: '.76rem', color: WHITE, opacity: 0.6, marginBottom: 20 }}>{fmtDateTime(deleteTarget.scheduled_at)}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: 10,
                  border: '1px solid #2a3050',
                  background: '#131722',
                  color: WHITE,
                  fontSize: '.88rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: 10,
                  border: 'none',
                  background: BLUE_GRAD,
                  color: WHITE,
                  fontSize: '.88rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: '0 4px 15px rgba(79,126,255,0.3)',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
