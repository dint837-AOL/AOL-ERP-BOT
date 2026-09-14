/**
 * Credentials Vault — thin cards (tenders / meetings pattern)
 * Card: Activity | User/Email | Deadline (1D/2H/30M)
 * Detail: Activity name, User name/email, URL, Expiry, Last changed, Reminder Day/Hour/Minute
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Key, Trash2, Pencil, X, Plus } from 'lucide-react';
import Topbar from '../components/Topbar';

interface Cred {
  id: string;
  name: string;
  cred_type?: string;
  url?: string;
  username?: string;
  expiry_date?: string;
  last_changed_date?: string;
  notify_email?: number;
  reminder_days?: number | null;
  reminder_hours?: number | null;
  reminder_minutes?: number | null;
}

type CredForm = {
  name: string;
  username: string;
  url: string;
  expiry_date: string;
  last_changed_date: string;
  reminder_days: string;
  reminder_hours: string;
  reminder_minutes: string;
};

const BLANK: CredForm = {
  name: '',
  username: '',
  url: '',
  expiry_date: '',
  last_changed_date: '',
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

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try {
    const [y, m, d] = iso.split('-');
    if (y && m && d) return `${d}-${m}-${y}`;
    return iso;
  } catch {
    return iso;
  }
}

function getCountdownShort(expiry?: string): string {
  if (!expiry) return '—';
  const target = new Date(expiry.includes('T') ? expiry : `${expiry}T09:00:00`);
  const diff = target.getTime() - Date.now();
  if (diff < 0) return '0M';
  const days = Math.floor(diff / 86400000);
  if (days >= 1) return `${days}D`;
  const hours = Math.floor(diff / 3600000);
  if (hours >= 1) return `${hours}H`;
  const mins = Math.max(1, Math.floor(diff / 60000));
  return `${mins}M`;
}

function credToForm(c: Cred): CredForm {
  return {
    name: c.name || '',
    username: c.username || '',
    url: c.url || '',
    expiry_date: c.expiry_date ? String(c.expiry_date).slice(0, 10) : '',
    last_changed_date: c.last_changed_date ? String(c.last_changed_date).slice(0, 10) : '',
    reminder_days: c.reminder_days != null && Number(c.reminder_days) > 0 ? String(c.reminder_days) : '',
    reminder_hours: c.reminder_hours != null && Number(c.reminder_hours) > 0 ? String(c.reminder_hours) : '',
    reminder_minutes: c.reminder_minutes != null && Number(c.reminder_minutes) > 0 ? String(c.reminder_minutes) : '',
  };
}

function buildPayload(form: CredForm) {
  const remDays = form.reminder_days.trim() === '' ? null : Number(form.reminder_days);
  const remHours = form.reminder_hours.trim() === '' ? null : Number(form.reminder_hours);
  const remMins = form.reminder_minutes.trim() === '' ? null : Number(form.reminder_minutes);
  const hasReminder =
    (remDays != null && remDays > 0) ||
    (remHours != null && remHours > 0) ||
    (remMins != null && remMins > 0);

  return {
    name: form.name.trim(),
    username: form.username.trim(),
    url: form.url.trim(),
    expiry_date: form.expiry_date || null,
    last_changed_date: form.last_changed_date || null,
    reminder_days: remDays,
    reminder_hours: remHours,
    reminder_minutes: remMins,
    notify_email: hasReminder ? 1 : 0,
    cred_type: 'OTHER',
  };
}

function ReminderBoxes({
  form,
  editMode,
  onChange,
}: {
  form: CredForm;
  editMode: boolean;
  onChange: (field: keyof CredForm, val: string) => void;
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

function CompactCredCard({ cred, onClick }: { cred: Cred; onClick: () => void }) {
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
        {cred.name || 'Untitled'}
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
        {cred.username || '—'}
      </div>
      <div style={{ fontSize: '0.82rem', color: WHITE, whiteSpace: 'nowrap', fontWeight: 600, flexShrink: 0, marginLeft: 40 }}>
        {getCountdownShort(cred.expiry_date)}
      </div>
    </div>
  );
}

function CredFields({
  form,
  editMode,
  onChange,
  viewSource,
}: {
  form: CredForm;
  editMode: boolean;
  onChange: (field: keyof CredForm, val: string) => void;
  viewSource?: Cred | undefined;
}) {
  const v = viewSource;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <FieldLabel>Activity Name</FieldLabel>
        {editMode ? (
          <input
            autoFocus
            type="text"
            value={form.name}
            onChange={e => onChange('name', e.target.value)}
            style={{ ...fieldEditSt, fontWeight: 600 }}
            placeholder="e.g. Gmail Admin"
          />
        ) : (
          <div style={{ ...valueSt, fontWeight: 600, fontSize: '0.95rem', paddingRight: 90 }}>{v?.name || '—'}</div>
        )}
      </div>

      <div>
        <FieldLabel>User Name / Email</FieldLabel>
        {editMode ? (
          <input
            type="text"
            value={form.username}
            onChange={e => onChange('username', e.target.value)}
            style={fieldEditSt}
            placeholder="user@domain.com"
          />
        ) : (
          <div style={valueSt}>{v?.username || '—'}</div>
        )}
      </div>

      <div>
        <FieldLabel optional>URL</FieldLabel>
        {editMode ? (
          <input type="url" value={form.url} onChange={e => onChange('url', e.target.value)} style={fieldEditSt} placeholder="https://..." />
        ) : v?.url ? (
          <a href={v.url} target="_blank" rel="noreferrer" style={{ color: WHITE, fontSize: '0.82rem', textDecoration: 'underline', wordBreak: 'break-all' }}>
            {v.url}
          </a>
        ) : (
          <div style={valueSt}>—</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <FieldLabel>Expiry</FieldLabel>
          {editMode ? (
            <input type="date" value={form.expiry_date} onChange={e => onChange('expiry_date', e.target.value)} style={{ ...fieldEditSt, colorScheme: 'dark' }} />
          ) : (
            <div style={valueSt}>{fmtDate(v?.expiry_date)}</div>
          )}
        </div>
        <div>
          <FieldLabel optional>Last Changed</FieldLabel>
          {editMode ? (
            <input
              type="date"
              value={form.last_changed_date}
              onChange={e => onChange('last_changed_date', e.target.value)}
              style={{ ...fieldEditSt, colorScheme: 'dark' }}
            />
          ) : (
            <div style={valueSt}>{fmtDate(v?.last_changed_date)}</div>
          )}
        </div>
      </div>

      <ReminderBoxes form={form} editMode={editMode} onChange={onChange} />
    </div>
  );
}

export default function CredentialsPage() {
  const [creds, setCreds] = useState<Cred[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const [selected, setSelected] = useState<Cred | null>(null);
  const [draft, setDraft] = useState<CredForm>(BLANK);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<CredForm>(BLANK);
  const [savingAdd, setSavingAdd] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Cred | null>(null);

  function showToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(''), 2600);
  }

  const fetchCreds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/credentials');
      const data = await res.json();
      setCreds(Array.isArray(data) ? data : []);
    } catch {
      showToast('Error loading credentials.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCreds();
  }, [fetchCreds]);

  function openDetail(c: Cred) {
    setSelected(c);
    setDraft(credToForm(c));
    setEditMode(false);
  }

  function closeDetail() {
    setSelected(null);
    setEditMode(false);
  }

  async function saveDraft() {
    if (!selected) return;
    if (!draft.name.trim()) {
      showToast('Activity name is required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/credentials/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(draft)),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json();
      showToast('Credential updated.');
      setEditMode(false);
      await fetchCreds();
      setSelected(updated);
      setDraft(credToForm(updated));
    } catch {
      showToast('Error saving credential.');
    } finally {
      setSaving(false);
    }
  }

  async function submitAdd() {
    if (!addForm.name.trim()) {
      showToast('Activity name is required.');
      return;
    }
    setSavingAdd(true);
    try {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(addForm)),
      });
      if (!res.ok) throw new Error('Failed');
      showToast('Credential saved!');
      setShowAdd(false);
      setAddForm(BLANK);
      fetchCreds();
    } catch {
      showToast('Error saving credential.');
    } finally {
      setSavingAdd(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/credentials/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Credential deleted.');
      setDeleteTarget(null);
      closeDetail();
      fetchCreds();
    } catch {
      showToast('Error deleting.');
    }
  }

  const active = selected ? creds.find(c => c.id === selected.id) || selected : null;

  return (
    <>
      <Topbar title="Credentials Vault" />

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
        ) : creds.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: WHITE, opacity: 0.6, fontSize: '0.85rem' }}>
            <Key size={28} style={{ opacity: 0.3, display: 'block', margin: '0 auto 10px' }} />
            No credentials yet. Tap + to add one.
          </div>
        ) : (
          creds.map(c => <CompactCredCard key={c.id} cred={c} onClick={() => openDetail(c)} />)
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
        title="Add credential"
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
              {editMode ? 'Edit Credential' : 'Credential Details'}
            </div>

            <CredFields
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
                    setDraft(credToForm(active));
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
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: WHITE, margin: 0 }}>Add Credential</h3>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: WHITE, cursor: 'pointer', padding: 4, opacity: 0.7 }}>
                <X size={18} />
              </button>
            </div>

            <CredFields form={addForm} editMode onChange={(field, val) => setAddForm(p => ({ ...p, [field]: val }))} />

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
            <h3 style={{ textAlign: 'center', fontSize: '1rem', fontWeight: 700, marginBottom: 8, color: WHITE }}>Delete Credential?</h3>
            <p style={{ textAlign: 'center', fontSize: '.88rem', fontWeight: 600, color: WHITE, marginBottom: 4 }}>{deleteTarget.name}</p>
            <p style={{ textAlign: 'center', fontSize: '.76rem', color: WHITE, opacity: 0.6, marginBottom: 20 }}>{deleteTarget.username || ''}</p>
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
