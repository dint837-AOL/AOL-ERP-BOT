/**
 * Credentials Vault Module
 *
 * Table layout fitted to screen like Meetings & Contacts module — zero horizontal scroll.
 * Table shows: Name, Type, Expiry, Username (no inline edit/delete/notify buttons).
 * Clicking any row opens the details popup with Edit, Delete, and Cross buttons in top-right corner.
 * FAB (+) at bottom right to add new credentials.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Key, Clock, Trash2, Edit3, Bell, BellOff, Plus, X, Pencil } from 'lucide-react';
import Topbar from '../components/Topbar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Cred {
  id: string;
  name: string;
  cred_type: 'EMAIL' | 'API_KEY' | 'SOCIAL' | 'OTHER';
  url?: string;
  username?: string;
  expiry_date?: string;
  last_changed_date?: string;
  reminder_days_before?: string;
  notify_email?: number;
}

type CredForm = {
  name: string;
  cred_type: 'EMAIL' | 'API_KEY' | 'SOCIAL' | 'OTHER';
  url: string;
  username: string;
  expiry_date: string;
  last_changed_date: string;
  reminder_days_before: string;
  notify_email: number;
};

const BLANK_FORM: CredForm = {
  name: '',
  cred_type: 'OTHER',
  url: '',
  username: '',
  expiry_date: '',
  last_changed_date: '',
  reminder_days_before: '5, 2, 1',
  notify_email: 1,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso?: string) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function getDaysUntilExpiry(expiry?: string): number | null {
  if (!expiry) return null;
  return Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
}

function typeLabel(t: string) {
  switch (t) {
    case 'EMAIL': return 'Email';
    case 'API_KEY': return 'API Key';
    case 'SOCIAL': return 'Social';
    default: return 'Other';
  }
}

// ─── Add Credential Bottom Sheet ──────────────────────────────────────────────

interface CredSheetProps {
  editId: string | null;
  form: CredForm;
  saving: boolean;
  onClose: () => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onToggleNotify: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

function CredSheet({ editId, form, saving, onClose, onChange, onToggleNotify, onSubmit }: CredSheetProps) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border, #2a3050)' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 12px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>{editId ? 'Edit Credential' : 'New Credential'}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
          <X size={18} />
        </button>
      </div>
      <form onSubmit={onSubmit} style={{ padding: '0 20px 24px', display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div>
          <label style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4 }}>Name *</label>
          <input
            name="name"
            placeholder="e.g. Gmail Admin, AWS Key"
            value={form.name}
            onChange={onChange}
            required
            style={{ width: '100%', background: '#131722', border: '1px solid #2a3050', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4 }}>Type</label>
            <select
              name="cred_type"
              value={form.cred_type}
              onChange={onChange}
              style={{ width: '100%', background: '#131722', border: '1px solid #2a3050', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }}
            >
              <option value="EMAIL">Email</option>
              <option value="SOCIAL">Social Media</option>
              <option value="API_KEY">API Key</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4 }}>Username / Email</label>
            <input
              name="username"
              placeholder="user@domain.com"
              value={form.username}
              onChange={onChange}
              style={{ width: '100%', background: '#131722', border: '1px solid #2a3050', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>
        <div>
          <label style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4 }}>URL <span style={{ color: '#64748b', fontWeight: 400 }}>(optional)</span></label>
          <input
            name="url"
            placeholder="https://..."
            value={form.url}
            onChange={onChange}
            style={{ width: '100%', background: '#131722', border: '1px solid #2a3050', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4 }}>Expiry Date</label>
            <input
              type="date"
              name="expiry_date"
              value={form.expiry_date}
              onChange={onChange}
              style={{ width: '100%', background: '#131722', border: '1px solid #2a3050', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: '0.88rem', outline: 'none', colorScheme: 'dark', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4 }}>Last Changed</label>
            <input
              type="date"
              name="last_changed_date"
              value={form.last_changed_date}
              onChange={onChange}
              style={{ width: '100%', background: '#131722', border: '1px solid #2a3050', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: '0.88rem', outline: 'none', colorScheme: 'dark', boxSizing: 'border-box' }}
            />
          </div>
        </div>
        <div>
          <label style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4 }}>Remind (Days Before Expiry)</label>
          <input
            name="reminder_days_before"
            placeholder="e.g. 5, 2, 1"
            value={form.reminder_days_before}
            onChange={onChange}
            style={{ width: '100%', background: '#131722', border: '1px solid #2a3050', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }}
          />
          <div style={{ fontSize: '.7rem', color: '#64748b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} /> Telegram &amp; Brevo alerts will be sent to admin before expiry.
          </div>
        </div>

        {/* Notifications Bell */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#131722', border: '1px solid #2a3050', borderRadius: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: form.notify_email ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: form.notify_email ? '#eab308' : '#64748b' }}>
              {form.notify_email ? <Bell size={16} /> : <BellOff size={16} />}
            </div>
            <div>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#f1f5f9' }}>Notifications</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Telegram &amp; Brevo reminders (24h &amp; 15h)</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleNotify}
            style={{
              background: form.notify_email ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${form.notify_email ? '#eab308' : '#334155'}`,
              color: form.notify_email ? '#eab308' : '#94a3b8',
              borderRadius: '8px', padding: '6px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5
            }}
          >
            {form.notify_email ? <Bell size={14} /> : <BellOff size={14} />}
            {form.notify_email ? 'ON' : 'OFF'}
          </button>
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{ width: '100%', padding: '13px', fontSize: '.95rem', fontWeight: 700, borderRadius: 10, background: 'linear-gradient(135deg,#4f7eff,#6c4fe3)', border: 'none', color: '#fff', cursor: 'pointer', marginTop: 4, boxShadow: '0 4px 15px rgba(79,126,255,0.3)' }}
        >
          {saving ? 'Saving...' : editId ? 'Update Credential' : 'Save Credential'}
        </button>
      </form>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CredentialsPage() {
  const [creds, setCreds] = useState<Cred[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CredForm>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Cred | null>(null);

  // Detail Modal states
  const [selectedCred, setSelectedCred] = useState<Cred | null>(null);
  const [detailEditMode, setDetailEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState<CredForm>(BLANK_FORM);

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2600); }

  const fetchCreds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/credentials');
      const data = await res.json();
      setCreds(Array.isArray(data) ? data : []);
    } catch { showToast('Error loading credentials.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCreds(); }, [fetchCreds]);

  function openAdd() {
    setEditId(null);
    setForm(BLANK_FORM);
    setSheetOpen(true);
  }

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }, []);

  const handleToggleNotify = useCallback(() => {
    setForm(prev => ({ ...prev, notify_email: prev.notify_email ? 0 : 1 }));
  }, []);

  async function toggleCredNotify(c: Cred) {
    const nextVal = c.notify_email ? 0 : 1;
    try {
      await fetch(`/api/credentials/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notify_email: nextVal }),
      });
      showToast(`Notifications ${nextVal ? 'enabled' : 'muted'} for credential.`);
      fetchCreds();
      if (selectedCred && selectedCred.id === c.id) {
        setSelectedCred({ ...selectedCred, notify_email: nextVal });
      }
    } catch {
      showToast('Failed to update notification setting.');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Name is required.'); return; }
    setSaving(true);
    try {
      const url = editId ? `/api/credentials/${editId}` : '/api/credentials';
      const res = await fetch(url, {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          cred_type: form.cred_type,
          url: form.url,
          username: form.username,
          expiry_date: form.expiry_date || null,
          last_changed_date: form.last_changed_date || null,
          reminder_days_before: form.reminder_days_before,
          notify_email: form.notify_email,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      showToast(editId ? 'Credential updated.' : 'Credential saved.');
      setSheetOpen(false);
      fetchCreds();
    } catch { showToast('Error saving credential.'); }
    finally { setSaving(false); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/credentials/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Credential deleted.');
      setDeleteTarget(null);
      setSelectedCred(null);
      fetchCreds();
    } catch { showToast('Error deleting.'); }
  }

  // ── table cell styles (matching Meetings & Contacts) ───────────────────────
  const th: React.CSSProperties = {
    padding: '9px 12px',
    fontSize: '.65rem',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '.04em',
    borderBottom: '1px solid #2a3050',
    background: 'rgba(0,0,0,.2)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  };

  const td: React.CSSProperties = {
    padding: '12px 12px',
    fontSize: '.78rem',
    color: '#f1f5f9',
    verticalAlign: 'middle',
  };

  return (
    <>
      <Topbar title="Credentials & Keys" />

      {toast && (
        <div style={{ position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)', background: '#1d2133', border: '1px solid #2a3050', borderRadius: 10, padding: '10px 20px', fontSize: '.84rem', zIndex: 9999, color: '#dde2f0', whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,.4)' }}>
          {toast}
        </div>
      )}

      {/* Outer wrapper: strictly fitted to screen, zero sideways scrolling like Meeting */}
      <div style={{ padding: '12px 16px 100px', overflowY: 'auto', overflowX: 'hidden', height: 'calc(100dvh - 56px)', boxSizing: 'border-box' }}>
        
        {/* Table card */}
        <div className="card" style={{ background: '#161926', border: '1px solid #2a3050', borderRadius: '12px', overflow: 'hidden', marginBottom: 0 }}>
          <div className="card-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #2a3050' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>Credential Vault</h3>
            <span style={{ fontSize: '.75rem', color: '#94a3b8' }}>{creds.length} total</span>
          </div>

          {/* Fixed-layout table — fits viewport perfectly, zero horizontal scroll */}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '30%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '24%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Type</th>
                <th style={th}>Expiry</th>
                <th style={th}>Username</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8', fontSize: '.82rem' }}>
                    Loading credentials…
                  </td>
                </tr>
              ) : creds.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '36px 16px', color: '#94a3b8', fontSize: '.82rem' }}>
                    <Key size={22} style={{ opacity: .3, display: 'block', margin: '0 auto 8px' }} />
                    No credentials saved yet. Tap + below to add one.
                  </td>
                </tr>
              ) : (
                creds.map((c, i) => {
                  const daysLeft = getDaysUntilExpiry(c.expiry_date);
                  let dotColor = '#22c55e';
                  let dotGlow = '0 0 8px #22c55e';
                  let expiryColor = '#94a3b8';
                  let expiryText = '—';

                  if (daysLeft !== null) {
                    if (daysLeft <= 0) {
                      dotColor = '#ef4444';
                      dotGlow = '0 0 8px #ef4444';
                      expiryColor = '#ef4444';
                      expiryText = 'Expired';
                    } else if (daysLeft <= 7) {
                      dotColor = '#ef4444';
                      dotGlow = '0 0 8px #ef4444';
                      expiryColor = '#ef4444';
                      expiryText = `${daysLeft}d left`;
                    } else if (daysLeft <= 30) {
                      dotColor = '#eab308';
                      dotGlow = '0 0 8px #eab308';
                      expiryColor = '#eab308';
                      expiryText = `${daysLeft}d left`;
                    } else {
                      expiryText = fmtDate(c.expiry_date);
                    }
                  }

                  return (
                    <tr
                      key={c.id}
                      onClick={() => {
                        setSelectedCred(c);
                        setDetailEditMode(false);
                      }}
                      style={{
                        borderBottom: i < creds.length - 1 ? '1px solid rgba(42,48,80,0.6)' : 'none',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onMouseOver={e => (e.currentTarget.style.background = 'rgba(79,126,255,0.06)')}
                      onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Name with glowing status dot */}
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, boxShadow: dotGlow, flexShrink: 0 }} />
                          <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.name}
                          </div>
                        </div>
                      </td>

                      {/* Type */}
                      <td style={{ ...td, fontSize: '0.76rem', color: '#38bdf8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {typeLabel(c.cred_type)}
                      </td>

                      {/* Expiry */}
                      <td style={{ ...td, fontSize: '0.74rem', color: expiryColor, whiteSpace: 'nowrap', fontWeight: (daysLeft !== null && daysLeft <= 30) ? 700 : 400 }}>
                        {expiryText}
                      </td>

                      {/* Username */}
                      <td style={{ ...td, fontSize: '0.74rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.username || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAB (+) button at bottom right (matching Meeting FAB) */}
      <button
        id="cred-fab"
        onClick={openAdd}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 20,
          zIndex: 700,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #4f7eff, #6c4fe3)',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 22px rgba(79,126,255,0.45)',
          transition: 'transform 0.15s'
        }}
        title="Add new credential"
      >
        <Plus size={24} />
      </button>

      {/* ── Credential Detail Popup (Opens on row click with Edit, Delete, and Cross in top right) ── */}
      {selectedCred && (() => {
        const activeCred = creds.find(c => c.id === selectedCred.id) || selectedCred;
        const daysLeft = getDaysUntilExpiry(activeCred.expiry_date);

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              alignItems: 'center'
            }}
            onClick={() => { setSelectedCred(null); setDetailEditMode(false); }}
          >
            <div
              style={{
                background: '#161926',
                borderTop: '1px solid #2a3050',
                borderTopLeftRadius: '20px',
                borderTopRightRadius: '20px',
                padding: '24px 20px',
                paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
                width: '100%',
                maxWidth: '560px',
                maxHeight: '90vh',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
                animation: 'slideSheet .22s ease-out'
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Top-Right Corner Action Buttons: Edit, Delete, Cross (X) */}
              <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 10 }}>
                {!detailEditMode && (
                  <button
                    onClick={() => {
                      setEditDraft({
                        name: activeCred.name,
                        cred_type: activeCred.cred_type,
                        url: activeCred.url || '',
                        username: activeCred.username || '',
                        expiry_date: activeCred.expiry_date || '',
                        last_changed_date: activeCred.last_changed_date || '',
                        reminder_days_before: activeCred.reminder_days_before || '5, 2, 1',
                        notify_email: activeCred.notify_email ?? 1,
                      });
                      setDetailEditMode(true);
                    }}
                    style={{ background: 'rgba(79,126,255,0.12)', border: '1px solid #4f7eff', color: '#4f7eff', width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    title="Edit"
                  >
                    <Pencil size={15} />
                  </button>
                )}
                {!detailEditMode && (
                  <button
                    onClick={() => { setDeleteTarget(activeCred); setSelectedCred(null); }}
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
                <button
                  onClick={() => { setSelectedCred(null); setDetailEditMode(false); }}
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid #2a3050', color: '#94a3b8', width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  title="Close"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Category Header */}
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, fontWeight: 700 }}>
                {detailEditMode ? 'Edit Credential' : 'Credential Details'}
              </div>

              {/* View Mode vs Edit Mode */}
              {!detailEditMode ? (
                <div style={{ overflowY: 'auto', paddingRight: 4 }}>
                  {/* Title */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#f8fafc', lineHeight: 1.3, paddingRight: 110 }}>
                      {activeCred.name || 'Untitled Credential'}
                    </div>
                  </div>

                  {/* 2-Column Details Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Type</div>
                      <div style={{ color: '#38bdf8', fontWeight: 500, fontSize: '0.9rem' }}>{typeLabel(activeCred.cred_type)}</div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Username / Email</div>
                      <div style={{ color: '#f1f5f9', fontWeight: 500, fontSize: '0.9rem' }}>{activeCred.username || '—'}</div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Expiry Date</div>
                      <div style={{ color: daysLeft !== null && daysLeft <= 7 ? '#ef4444' : daysLeft !== null && daysLeft <= 30 ? '#eab308' : '#38bdf8', fontWeight: 500, fontSize: '0.9rem' }}>
                        {fmtDate(activeCred.expiry_date)} {daysLeft !== null ? (daysLeft <= 0 ? '(Expired)' : `(${daysLeft}d left)`) : ''}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Last Changed</div>
                      <div style={{ color: '#f1f5f9', fontWeight: 500, fontSize: '0.9rem' }}>{fmtDate(activeCred.last_changed_date)}</div>
                    </div>

                    {activeCred.url && (
                      <div style={{ gridColumn: 'span 2' }}>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>URL / Host</div>
                        <a href={activeCred.url} target="_blank" rel="noreferrer" style={{ color: '#4f7eff', fontWeight: 500, fontSize: '0.88rem', wordBreak: 'break-all', textDecoration: 'none' }}>
                          {activeCred.url}
                        </a>
                      </div>
                    )}

                    <div style={{ gridColumn: 'span 2' }}>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Reminders</div>
                      <div style={{ color: '#94a3b8', fontWeight: 500, fontSize: '0.88rem' }}>{activeCred.reminder_days_before || '5, 2, 1'} days before expiry</div>
                    </div>
                  </div>

                  {/* Notifications Bell Status */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#131722', border: '1px solid #2a3050', borderRadius: '10px', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: activeCred.notify_email ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: activeCred.notify_email ? '#eab308' : '#64748b' }}>
                        {activeCred.notify_email ? <Bell size={16} /> : <BellOff size={16} />}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#f1f5f9' }}>Notifications</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Telegram &amp; Brevo reminders</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleCredNotify(activeCred)}
                      style={{
                        background: activeCred.notify_email ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${activeCred.notify_email ? '#eab308' : '#334155'}`,
                        color: activeCred.notify_email ? '#eab308' : '#94a3b8',
                        borderRadius: '8px', padding: '6px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 5
                      }}
                    >
                      {activeCred.notify_email ? <Bell size={14} /> : <BellOff size={14} />}
                      {activeCred.notify_email ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {/* Bottom Action Buttons: Close / Edit / Delete */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => { setSelectedCred(null); setDetailEditMode(false); }}
                      style={{ padding: '12px', borderRadius: 10, border: '1px solid #2a3050', background: '#131722', color: '#f1f5f9', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditDraft({
                          name: activeCred.name,
                          cred_type: activeCred.cred_type,
                          url: activeCred.url || '',
                          username: activeCred.username || '',
                          expiry_date: activeCred.expiry_date || '',
                          last_changed_date: activeCred.last_changed_date || '',
                          reminder_days_before: activeCred.reminder_days_before || '5, 2, 1',
                          notify_email: activeCred.notify_email ?? 1,
                        });
                        setDetailEditMode(true);
                      }}
                      style={{ padding: '12px', borderRadius: 10, border: '1px solid #4f7eff', background: 'rgba(79,126,255,0.12)', color: '#4f7eff', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}
                    >
                      <Pencil size={15} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDeleteTarget(activeCred); setSelectedCred(null); }}
                      style={{ padding: '12px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}
                    >
                      <Trash2 size={15} /> Delete
                    </button>
                  </div>
                </div>
              ) : (
                /* Edit Mode: In-place editable form */
                <div style={{ overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Name Input */}
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Name *</div>
                    <input
                      autoFocus
                      type="text"
                      value={editDraft.name}
                      onChange={e => setEditDraft({ ...editDraft, name: e.target.value })}
                      style={{ background: '#131722', border: '1px solid #4f7eff', borderRadius: '7px', color: '#f1f5f9', fontSize: '1.05rem', fontWeight: 600, padding: '8px 12px', width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {/* Type */}
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Type</div>
                      <select
                        value={editDraft.cred_type}
                        onChange={e => setEditDraft({ ...editDraft, cred_type: e.target.value as any })}
                        style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: '#f1f5f9', fontSize: '0.88rem', padding: '8px 10px', width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                      >
                        <option value="EMAIL">Email</option>
                        <option value="SOCIAL">Social Media</option>
                        <option value="API_KEY">API Key</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>

                    {/* Username */}
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Username / Email</div>
                      <input
                        type="text"
                        placeholder="Username..."
                        value={editDraft.username}
                        onChange={e => setEditDraft({ ...editDraft, username: e.target.value })}
                        style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: '#f1f5f9', fontSize: '0.88rem', padding: '8px 10px', width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                      />
                    </div>

                    {/* Expiry Date */}
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Expiry Date</div>
                      <input
                        type="date"
                        value={editDraft.expiry_date}
                        onChange={e => setEditDraft({ ...editDraft, expiry_date: e.target.value })}
                        style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: '#f1f5f9', fontSize: '0.88rem', padding: '8px 10px', width: '100%', outline: 'none', colorScheme: 'dark', fontFamily: 'inherit', boxSizing: 'border-box' }}
                      />
                    </div>

                    {/* Last Changed */}
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Last Changed</div>
                      <input
                        type="date"
                        value={editDraft.last_changed_date}
                        onChange={e => setEditDraft({ ...editDraft, last_changed_date: e.target.value })}
                        style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: '#f1f5f9', fontSize: '0.88rem', padding: '8px 10px', width: '100%', outline: 'none', colorScheme: 'dark', fontFamily: 'inherit', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  {/* URL */}
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>URL / Host (optional)</div>
                    <input
                      type="text"
                      placeholder="https://..."
                      value={editDraft.url}
                      onChange={e => setEditDraft({ ...editDraft, url: e.target.value })}
                      style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: '#f1f5f9', fontSize: '0.88rem', padding: '8px 10px', width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                    />
                  </div>

                  {/* Reminders */}
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Reminders (Days Before Expiry)</div>
                    <input
                      type="text"
                      placeholder="e.g. 5, 2, 1"
                      value={editDraft.reminder_days_before}
                      onChange={e => setEditDraft({ ...editDraft, reminder_days_before: e.target.value })}
                      style={{ background: '#131722', border: '1px solid #2a3050', borderRadius: '7px', color: '#f1f5f9', fontSize: '0.88rem', padding: '8px 10px', width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                    />
                  </div>

                  {/* Notifications toggle in edit mode */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#131722', border: '1px solid #2a3050', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: editDraft.notify_email ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: editDraft.notify_email ? '#eab308' : '#64748b' }}>
                        {editDraft.notify_email ? <Bell size={16} /> : <BellOff size={16} />}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#f1f5f9' }}>Notifications</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Telegram &amp; Brevo reminders</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditDraft({ ...editDraft, notify_email: editDraft.notify_email ? 0 : 1 })}
                      style={{
                        background: editDraft.notify_email ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${editDraft.notify_email ? '#eab308' : '#334155'}`,
                        color: editDraft.notify_email ? '#eab308' : '#94a3b8',
                        borderRadius: '8px', padding: '6px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 5
                      }}
                    >
                      {editDraft.notify_email ? <Bell size={14} /> : <BellOff size={14} />}
                      {editDraft.notify_email ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {/* Edit Mode Buttons: Cancel / Save Changes */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => setDetailEditMode(false)}
                      style={{ padding: '12px', borderRadius: 10, border: '1px solid #2a3050', background: '#131722', color: '#f1f5f9', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={async () => {
                        if (!editDraft.name.trim()) { showToast('Name is required.'); return; }
                        setSaving(true);
                        try {
                          const res = await fetch(`/api/credentials/${activeCred.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(editDraft)
                          });
                          if (res.ok) {
                            showToast('Credential updated!');
                            setDetailEditMode(false);
                            fetchCreds();
                            setSelectedCred({ ...activeCred, ...editDraft });
                          } else {
                            showToast('Failed to update.');
                          }
                        } catch {
                          showToast('Error updating credential.');
                        } finally {
                          setSaving(false);
                        }
                      }}
                      style={{ padding: '12px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #4f7eff, #6c4fe3)', color: '#fff', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 15px rgba(79,126,255,0.3)' }}
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Add/Edit bottom sheet (when clicking + FAB) ── */}
      {sheetOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) setSheetOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 910, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#161926', border: '1px solid #2a3050', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, paddingBottom: 'env(safe-area-inset-bottom,12px)', maxHeight: '92dvh', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,.5)', animation: 'slideSheet .22s ease-out' }}>
            <CredSheet editId={editId} form={form} saving={saving} onClose={() => setSheetOpen(false)} onChange={handleChange} onToggleNotify={handleToggleNotify} onSubmit={handleSubmit} />
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {deleteTarget && (
        <div onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#161926', border: '1px solid #2a3050', borderRadius: 16, width: '100%', maxWidth: 360, padding: 24, boxShadow: '0 8px 40px rgba(0,0,0,.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                <Trash2 size={24} />
              </div>
            </div>
            <h3 style={{ textAlign: 'center', fontSize: '1rem', fontWeight: 700, color: '#f8fafc', marginBottom: 6 }}>Delete Credential?</h3>
            <p style={{ textAlign: 'center', fontSize: '.88rem', fontWeight: 600, color: '#f1f5f9', marginBottom: 20 }}>{deleteTarget.name}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1px solid #2a3050', background: '#131722', color: '#f1f5f9', fontSize: '.88rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={confirmDelete} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontSize: '.88rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideSheet { from { transform: translateY(50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </>
  );
}
