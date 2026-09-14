/**
 * Tender Management — mobile thin cards (Daily Tasks pattern)
 * Card front: title → org → deadline (1D / 2H / 30M), white text
 * Tap → compact detail sheet (no scroll); top-right edit / delete / close only
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Briefcase, Trash2, Pencil, X, Plus, DownloadCloud } from 'lucide-react';
import Topbar from '../components/Topbar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tender {
  id: string;
  title: string;
  organization?: string;
  tender_type: 'GOVT' | 'PRIVATE';
  published_date?: string;
  submission_deadline: string;
  estimated_value: number;
  status: 'UPCOMING' | 'IN_PROGRESS' | 'SUBMITTED' | 'WON' | 'LOST';
  documents_url?: string;
  notes?: string;
  notify_email?: number;
  reminder_days?: number | null;
  reminder_hours?: number | null;
  reminder_minutes?: number | null;
}

type TenderForm = {
  title: string;
  organization: string;
  tender_type: string;
  published_date: string;
  submission_deadline: string;
  estimated_value: string;
  documents_url: string;
  notes: string;
  status: string;
  reminder_days: string;
  reminder_hours: string;
  reminder_minutes: string;
};

const BLANK: TenderForm = {
  title: '',
  organization: '',
  tender_type: 'GOVT',
  published_date: '',
  submission_deadline: '',
  estimated_value: '',
  documents_url: '',
  notes: '',
  status: 'UPCOMING',
  reminder_days: '',
  reminder_hours: '',
  reminder_minutes: '',
};

const STATUS_LABELS: Record<string, string> = {
  UPCOMING: 'Upcoming',
  IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted',
  WON: 'Won',
  LOST: 'Lost',
};

const WHITE = '#ffffff';
const MUTED_LABEL = 'rgba(255,255,255,0.55)';

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

const fieldEditSt: React.CSSProperties = {
  ...fieldInputSt,
  border: '1px solid #3a4568',
};

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function fmtDeadline(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

/** Compact remaining time: 1D / 2H / 30M */
function getCountdownShort(deadline: string): string {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff < 0) return '0M';
  const days = Math.floor(diff / 86400000);
  if (days >= 1) return `${days}D`;
  const hours = Math.floor(diff / 3600000);
  if (hours >= 1) return `${hours}H`;
  const mins = Math.max(1, Math.floor(diff / 60000));
  return `${mins}M`;
}

function tenderToForm(t: Tender): TenderForm {
  return {
    title: t.title || '',
    organization: t.organization || '',
    tender_type: t.tender_type || 'GOVT',
    published_date: t.published_date ? String(t.published_date).slice(0, 10) : '',
    submission_deadline: toLocalInput(t.submission_deadline),
    estimated_value: t.estimated_value != null ? String(t.estimated_value) : '',
    documents_url: t.documents_url || '',
    notes: t.notes || '',
    status: t.status || 'UPCOMING',
    reminder_days: t.reminder_days != null && Number(t.reminder_days) > 0 ? String(t.reminder_days) : '',
    reminder_hours: t.reminder_hours != null && Number(t.reminder_hours) > 0 ? String(t.reminder_hours) : '',
    reminder_minutes: t.reminder_minutes != null && Number(t.reminder_minutes) > 0 ? String(t.reminder_minutes) : '',
  };
}

function buildPayload(form: TenderForm) {
  const remDays = form.reminder_days.trim() === '' ? null : Number(form.reminder_days);
  const remHours = form.reminder_hours.trim() === '' ? null : Number(form.reminder_hours);
  const remMins = form.reminder_minutes.trim() === '' ? null : Number(form.reminder_minutes);
  const hasReminder =
    (remDays != null && remDays > 0) ||
    (remHours != null && remHours > 0) ||
    (remMins != null && remMins > 0);

  return {
    title: form.title.trim(),
    organization: form.organization.trim(),
    tender_type: form.tender_type,
    published_date: form.published_date || null,
    submission_deadline: new Date(form.submission_deadline).toISOString(),
    estimated_value: parseFloat(form.estimated_value) || 0,
    documents_url: form.documents_url.trim(),
    notes: form.notes.trim(),
    status: form.status,
    reminder_days: remDays,
    reminder_hours: remHours,
    reminder_minutes: remMins,
    notify_email: hasReminder ? 1 : 0,
  };
}

function Label({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <div style={labelSt}>
      {children}
      {optional ? ' (optional)' : ''}
    </div>
  );
}

// ─── Compact card — daily-task style: title | org | deadline side by side ─────

function CompactTenderCard({ tender, onClick }: { tender: Tender; onClick: () => void }) {
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
        {tender.title || 'Untitled Tender'}
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
        {tender.organization || '—'}
      </div>
      <div style={{ fontSize: '0.82rem', color: WHITE, whiteSpace: 'nowrap', fontWeight: 600, flexShrink: 0, marginLeft: 40 }}>
        {getCountdownShort(tender.submission_deadline)}
      </div>
    </div>
  );
}

// ─── Reminder boxes ───────────────────────────────────────────────────────────

function ReminderBoxes({
  form,
  editMode,
  onChange,
}: {
  form: TenderForm;
  editMode: boolean;
  onChange: (field: keyof TenderForm, val: string) => void;
}) {
  const box = (label: string, field: 'reminder_days' | 'reminder_hours' | 'reminder_minutes', placeholder: string) => (
    <div style={{ flex: 1 }}>
      <div style={{ ...labelSt, marginBottom: 2 }}>{label}</div>
      {editMode ? (
        <input
          type="number"
          min={0}
          placeholder={placeholder}
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
    <div style={{ marginBottom: 0 }}>
      <Label optional>Reminder</Label>
      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
        {box('Day', 'reminder_days', '2')}
        {box('Hour', 'reminder_hours', '10')}
        {box('Minute', 'reminder_minutes', '30')}
      </div>
    </div>
  );
}

// ─── Shared field grid for detail / add ───────────────────────────────────────

function TenderFields({
  form,
  editMode,
  onChange,
  viewSource,
}: {
  form: TenderForm;
  editMode: boolean;
  onChange: (field: keyof TenderForm, val: string) => void;
  viewSource?: Tender | undefined;
}) {
  const v = viewSource;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <Label>Tender Title</Label>
        {editMode ? (
          <input
            autoFocus
            type="text"
            value={form.title}
            onChange={e => onChange('title', e.target.value)}
            style={{ ...fieldEditSt, fontWeight: 600 }}
          />
        ) : (
          <div style={{ ...valueSt, fontWeight: 600, fontSize: '0.95rem' }}>{v?.title || '—'}</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <Label>Organization</Label>
          {editMode ? (
            <input type="text" value={form.organization} onChange={e => onChange('organization', e.target.value)} style={fieldEditSt} />
          ) : (
            <div style={valueSt}>{v?.organization || '—'}</div>
          )}
        </div>
        <div>
          <Label>Sector</Label>
          {editMode ? (
            <select value={form.tender_type} onChange={e => onChange('tender_type', e.target.value)} style={{ ...fieldEditSt, cursor: 'pointer' }}>
              <option value="GOVT">Govt</option>
              <option value="PRIVATE">Private</option>
            </select>
          ) : (
            <div style={valueSt}>{v?.tender_type === 'GOVT' ? 'Govt' : 'Private'}</div>
          )}
        </div>
        <div>
          <Label>Published Date</Label>
          {editMode ? (
            <input type="date" value={form.published_date} onChange={e => onChange('published_date', e.target.value)} style={{ ...fieldEditSt, colorScheme: 'dark' }} />
          ) : (
            <div style={valueSt}>{fmtDate(v?.published_date)}</div>
          )}
        </div>
        <div>
          <Label>Closing Date & Time</Label>
          {editMode ? (
            <input
              type="datetime-local"
              value={form.submission_deadline}
              onClick={e => {
                try {
                  (e.target as HTMLInputElement).showPicker?.();
                } catch {}
              }}
              onChange={e => onChange('submission_deadline', e.target.value)}
              style={{ ...fieldEditSt, colorScheme: 'dark' }}
            />
          ) : (
            <div style={valueSt}>{v?.submission_deadline ? fmtDeadline(v.submission_deadline) : '—'}</div>
          )}
        </div>
        <div>
          <Label>Estimated Value (BDT)</Label>
          {editMode ? (
            <input type="number" min={0} value={form.estimated_value} onChange={e => onChange('estimated_value', e.target.value)} style={fieldEditSt} placeholder="0" />
          ) : (
            <div style={valueSt}>৳ {Number(v?.estimated_value || 0).toLocaleString('en-BD')}</div>
          )}
        </div>
        <div>
          <Label>Status</Label>
          {editMode ? (
            <select value={form.status} onChange={e => onChange('status', e.target.value)} style={{ ...fieldEditSt, cursor: 'pointer' }}>
              {Object.entries(STATUS_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          ) : (
            <div style={valueSt}>{STATUS_LABELS[v?.status || ''] || v?.status || '—'}</div>
          )}
        </div>
      </div>

      <div>
        <Label optional>Documents URL</Label>
        {editMode ? (
          <input type="url" value={form.documents_url} onChange={e => onChange('documents_url', e.target.value)} style={fieldEditSt} placeholder="https://..." />
        ) : v?.documents_url ? (
          <a href={v.documents_url} target="_blank" rel="noreferrer" style={{ color: WHITE, fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 5, wordBreak: 'break-all', textDecoration: 'underline' }}>
            <DownloadCloud size={12} /> Open documents
          </a>
        ) : (
          <div style={valueSt}>—</div>
        )}
      </div>

      <div>
        <Label optional>Notes</Label>
        {editMode ? (
          <textarea value={form.notes} onChange={e => onChange('notes', e.target.value)} rows={2} style={{ ...fieldEditSt, resize: 'none' }} placeholder="Additional notes..." />
        ) : (
          <div style={{ ...valueSt, whiteSpace: 'pre-wrap' }}>{v?.notes || '—'}</div>
        )}
      </div>

      <ReminderBoxes form={form} editMode={editMode} onChange={onChange} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TendersPage() {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const [selected, setSelected] = useState<Tender | null>(null);
  const [draft, setDraft] = useState<TenderForm>(BLANK);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<TenderForm>(BLANK);
  const [savingAdd, setSavingAdd] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Tender | null>(null);

  function showToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(''), 2600);
  }

  const fetchTenders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tenders');
      const data = await res.json();
      setTenders(Array.isArray(data) ? data : []);
    } catch {
      showToast('Error loading tenders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTenders();
  }, [fetchTenders]);

  function openDetail(t: Tender) {
    setSelected(t);
    setDraft(tenderToForm(t));
    setEditMode(false);
  }

  function closeDetail() {
    setSelected(null);
    setEditMode(false);
  }

  function handleDraftChange(field: keyof TenderForm, val: string) {
    setDraft(prev => ({ ...prev, [field]: val }));
  }

  async function saveDraft() {
    if (!selected) return;
    if (!draft.title.trim() || !draft.submission_deadline) {
      showToast('Title and closing date are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/tenders/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(draft)),
      });
      if (!res.ok) throw new Error('Failed');
      showToast('Tender updated.');
      setEditMode(false);
      await fetchTenders();
      const updated = await res.json();
      setSelected(updated);
      setDraft(tenderToForm(updated));
    } catch {
      showToast('Error saving tender.');
    } finally {
      setSaving(false);
    }
  }

  async function submitAdd() {
    if (!addForm.title.trim() || !addForm.submission_deadline) {
      showToast('Title and closing date are required.');
      return;
    }
    setSavingAdd(true);
    try {
      const res = await fetch('/api/tenders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(addForm)),
      });
      if (!res.ok) throw new Error('Failed');
      showToast('Tender saved!');
      setShowAdd(false);
      setAddForm(BLANK);
      fetchTenders();
    } catch {
      showToast('Error saving tender.');
    } finally {
      setSavingAdd(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/tenders/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Tender deleted.');
      setDeleteTarget(null);
      closeDetail();
      fetchTenders();
    } catch {
      showToast('Error deleting.');
    }
  }

  const active = selected ? tenders.find(t => t.id === selected.id) || selected : null;

  const BLUE = '#4f7eff';
  const BLUE_BG = 'rgba(79,126,255,0.15)';
  const BLUE_GRAD = 'linear-gradient(135deg, #4f7eff, #6c4fe3)';

  const iconBtn = (onClick: () => void, children: React.ReactNode, color = BLUE, bg = BLUE_BG) => (
    <button
      onClick={onClick}
      style={{
        background: bg,
        border: 'none',
        color,
        width: 34,
        height: 34,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );

  return (
    <>
      <Topbar title="Tender Management" />

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
          <div style={{ textAlign: 'center', padding: 48, color: WHITE, fontSize: '0.85rem', opacity: 0.6 }}>Loading...</div>
        ) : tenders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: WHITE, fontSize: '0.85rem', opacity: 0.6 }}>
            <Briefcase size={28} style={{ opacity: 0.3, display: 'block', margin: '0 auto 10px' }} />
            No tenders yet. Tap + to add one.
          </div>
        ) : (
          tenders.map(t => <CompactTenderCard key={t.id} tender={t} onClick={() => openDetail(t)} />)
        )}
      </div>

      {/* FAB */}
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
        title="Add tender"
      >
        <Plus size={24} />
      </button>

      {/* ── Detail / edit sheet — compact, no scroll ── */}
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
            {/* Top-right actions only */}
            <div style={{ position: 'absolute', top: 10, right: 12, display: 'flex', gap: 8, zIndex: 2 }}>
              {!editMode && iconBtn(() => setEditMode(true), <Pencil size={15} />)}
              {!editMode &&
                iconBtn(
                  () => {
                    setDeleteTarget(active);
                    closeDetail();
                  },
                  <Trash2 size={15} />,
                  '#ef4444',
                  'rgba(239,68,68,0.12)'
                )}
              {iconBtn(closeDetail, <X size={16} />, '#94a3b8', 'rgba(255,255,255,0.08)')}
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
              {editMode ? 'Edit Tender Details' : 'Tender Details'}
            </div>

            <div style={{ overflow: 'hidden' }}>
              <TenderFields
                form={draft}
                editMode={editMode}
                onChange={handleDraftChange}
                viewSource={editMode ? undefined : active}
              />
            </div>

            {/* Edit mode only: Cancel / Save */}
            {editMode && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(tenderToForm(active));
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

      {/* ── Add tender sheet ── */}
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
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: WHITE, margin: 0 }}>Add Tender</h3>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: WHITE, cursor: 'pointer', padding: 4, opacity: 0.7 }}>
                <X size={18} />
              </button>
            </div>

            <TenderFields form={addForm} editMode onChange={(field, val) => setAddForm(p => ({ ...p, [field]: val }))} />

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

      {/* Delete confirm */}
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
            <h3 style={{ textAlign: 'center', fontSize: '1rem', fontWeight: 700, marginBottom: 8, color: WHITE }}>Delete Tender?</h3>
            <p style={{ textAlign: 'center', fontSize: '.88rem', fontWeight: 600, color: WHITE, marginBottom: 4 }}>{deleteTarget.title}</p>
            <p style={{ textAlign: 'center', fontSize: '.76rem', color: WHITE, opacity: 0.6, marginBottom: 20 }}>{deleteTarget.organization || ''}</p>
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
