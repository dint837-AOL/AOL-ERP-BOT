/**
 * Credentials Vault Module
 *
 * Table-based layout matching HR / Accounts sections.
 * No horizontal scrolling — table uses fixed layout fitted to screen.
 * FAB + bottom-sheet for add/edit. Plain styling, minimal colour.
 * Telegram reminders sent to admin before credentials expire.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Key, Clock, Trash2, Edit3, Bell, BellOff, Plus } from 'lucide-react';
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
  cred_type: string;
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

// ─── Cred Sheet ───────────────────────────────────────────────────────────────

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
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 12px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{editId ? 'Edit Credential' : 'New Credential'}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1, padding: 4 }}>X</button>
      </div>
      <form onSubmit={onSubmit} style={{ padding: '0 20px 24px' }}>
        <div className="fg">
          <label>Name</label>
          <input name="name" placeholder="e.g. Gmail Admin, AWS Key" value={form.name} onChange={onChange} required />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 13 }}>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label>Type</label>
            <select name="cred_type" value={form.cred_type} onChange={onChange}>
              <option value="EMAIL">Email</option>
              <option value="SOCIAL">Social Media</option>
              <option value="API_KEY">API Key</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label>Username / Email</label>
            <input name="username" placeholder="user@domain.com" value={form.username} onChange={onChange} />
          </div>
        </div>
        <div className="fg">
          <label>URL <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
          <input name="url" placeholder="https://..." value={form.url} onChange={onChange} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 13 }}>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label>Expiry Date</label>
            <input type="date" name="expiry_date" value={form.expiry_date} onChange={onChange} />
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label>Last Changed</label>
            <input type="date" name="last_changed_date" value={form.last_changed_date} onChange={onChange} />
          </div>
        </div>
        <div className="fg" style={{ marginBottom: 14 }}>
          <label>Remind (Days Before Expiry)</label>
          <input name="reminder_days_before" placeholder="e.g. 5, 2, 1" value={form.reminder_days_before} onChange={onChange} />
          <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} /> Telegram &amp; Brevo alerts will be sent to admin before expiry.
          </div>
        </div>

        {/* Notifications Bell */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-card, #131722)', border: '1px solid var(--border, #2a3050)', borderRadius: '10px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: form.notify_email ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: form.notify_email ? '#eab308' : '#64748b' }}>
              {form.notify_email ? <Bell size={16} /> : <BellOff size={16} />}
            </div>
            <div>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text, #f1f5f9)' }}>Notifications</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted, #64748b)' }}>Telegram &amp; Brevo reminders (24h &amp; 15h)</div>
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

        <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '.95rem', fontWeight: 700, borderRadius: 10 }} disabled={saving}>
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

  function openAdd() { setEditId(null); setForm(BLANK_FORM); setSheetOpen(true); }

  function openEdit(c: Cred) {
    setEditId(c.id);
    setForm({
      name: c.name,
      cred_type: c.cred_type,
      url: c.url || '',
      username: c.username || '',
      expiry_date: c.expiry_date || '',
      last_changed_date: c.last_changed_date || '',
      reminder_days_before: c.reminder_days_before || '5, 2, 1',
      notify_email: c.notify_email ?? 1,
    });
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
      showToast('Deleted.');
      setDeleteTarget(null);
      fetchCreds();
    } catch { showToast('Error deleting.'); }
  }

  // ── table styles ───────────────────────────────────────────────────────────
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
      <Topbar title="Credentials & Keys" />

      {toast && (
        <div style={{ position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)', background: '#1d2133', border: '1px solid #2a3050', borderRadius: 10, padding: '10px 20px', fontSize: '.84rem', zIndex: 999, color: '#dde2f0', whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,.4)' }}>
          {toast}
        </div>
      )}

      <div className="scroll" style={{ padding: '20px 24px 100px' }}>
        {/* Table card */}
        <div className="card" style={{ background: '#161926', border: '1px solid #2a3050', borderRadius: '12px', overflow: 'hidden' }}>
          <div className="card-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #2a3050' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>Credential Vault</h3>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{creds.length} total</span>
          </div>

          <div className="table-scroll">
            <table style={{ width: '100%', minWidth: '880px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid #2a3050' }}>
                  <th style={{ minWidth: '220px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Name</th>
                  <th style={{ width: '140px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Type</th>
                  <th style={{ width: '150px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Expiry</th>
                  <th style={{ width: '190px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Username</th>
                  <th style={{ width: '130px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Remind</th>
                  <th style={{ width: '110px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8', fontSize: '0.84rem' }}>Loading credentials…</td></tr>
                ) : creds.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '44px 20px', color: '#94a3b8', fontSize: '0.85rem' }}>
                      <Key size={26} style={{ opacity: 0.35, display: 'block', margin: '0 auto 10px' }} />
                      No credentials saved yet. Click the + button at bottom right to add one.
                    </td>
                  </tr>
                ) : creds.map(c => {
                  const daysLeft = getDaysUntilExpiry(c.expiry_date);
                  const expiryColor = daysLeft === null ? '#94a3b8' : daysLeft <= 0 ? '#ef4444' : daysLeft <= 7 ? '#f59e0b' : '#f1f5f9';
                  const expiryText = daysLeft === null ? '—' : daysLeft <= 0 ? 'Expired' : daysLeft <= 30 ? `${daysLeft}d left` : fmtDate(c.expiry_date);

                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid rgba(42,48,80,0.6)', transition: 'background 0.15s' }}>
                      {/* Name */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.86rem', color: '#f1f5f9' }}>{c.name}</div>
                        {c.url && (
                          <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.72rem', color: '#4f7eff', display: 'inline-block', marginTop: 2, textDecoration: 'none' }}>
                            {c.url.replace(/^https?:\/\//, '').slice(0, 30)}
                          </a>
                        )}
                      </td>
                      {/* Type */}
                      <td style={{ padding: '12px 16px', fontSize: '0.82rem' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600,
                          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#cbd5e1'
                        }}>
                          {typeLabel(c.cred_type)}
                        </span>
                      </td>
                      {/* Expiry */}
                      <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: expiryColor, whiteSpace: 'nowrap', fontWeight: daysLeft !== null && daysLeft <= 7 ? 700 : 400 }}>
                        {expiryText}
                      </td>
                      {/* Username */}
                      <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: '#94a3b8' }}>
                        {c.username || <span style={{ color: '#64748b', fontStyle: 'italic' }}>—</span>}
                      </td>
                      {/* Reminder */}
                      <td style={{ padding: '12px 16px', fontSize: '0.78rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.05)', padding: '3px 8px', borderRadius: 6 }}>
                          <Clock size={12} style={{ color: '#eab308' }} />
                          <span>{c.reminder_days_before || '5, 2, 1'}d</span>
                        </div>
                      </td>
                      {/* Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => toggleCredNotify(c)}
                            title={c.notify_email ? 'Notifications ON (click to mute)' : 'Notifications OFF (click to enable)'}
                            style={{
                              background: 'none', border: 'none',
                              color: c.notify_email ? '#eab308' : '#64748b',
                              cursor: 'pointer', padding: '6px', borderRadius: '6px',
                              display: 'inline-flex', alignItems: 'center', transition: 'all 0.15s'
                            }}
                          >
                            {c.notify_email ? <Bell size={16} /> : <BellOff size={16} />}
                          </button>
                          <button
                            onClick={() => openEdit(c)}
                            title="Edit Credential"
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', transition: 'all 0.15s' }}
                            onMouseOver={e => (e.currentTarget.style.color = '#38bdf8')}
                            onMouseOut={e => (e.currentTarget.style.color = '#94a3b8')}
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(c)}
                            title="Delete Credential"
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', transition: 'all 0.15s' }}
                            onMouseOver={e => (e.currentTarget.style.color = '#ef4444')}
                            onMouseOut={e => (e.currentTarget.style.color = '#64748b')}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* FAB matching Daily Task View */}
      <button
        id="cred-fab"
        onClick={openAdd}
        title="Add Credential"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 800,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #4f7eff, #6c4fe3)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(79,126,255,0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.15s'
        }}
      >
        <Plus size={24} />
      </button>

      {/* Add/Edit bottom sheet */}
      {sheetOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) setSheetOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 910, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#161926', border: '1px solid #2a3050', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, paddingBottom: 'env(safe-area-inset-bottom,12px)', maxHeight: '92dvh', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,.5)', animation: 'slideSheet .22s ease-out' }}>
            <CredSheet editId={editId} form={form} saving={saving} onClose={() => setSheetOpen(false)} onChange={handleChange} onToggleNotify={handleToggleNotify} onSubmit={handleSubmit} />
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }} style={{ position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#161926', border: '1px solid #2a3050', borderRadius: 16, width: '100%', maxWidth: 340, padding: 24, boxShadow: '0 8px 40px rgba(0,0,0,.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(242,92,122,.12)', border: '1px solid rgba(242,92,122,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)' }}>
                <Trash2 size={22} />
              </div>
            </div>
            <h3 style={{ textAlign: 'center', fontSize: '1rem', fontWeight: 700, marginBottom: 8, color: '#f8fafc' }}>Delete Credential?</h3>
            <p style={{ textAlign: 'center', fontSize: '.88rem', fontWeight: 600, color: '#f1f5f9', marginBottom: 20 }}>{deleteTarget.name}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1px solid #2a3050', background: '#131722', color: '#f1f5f9', fontSize: '.88rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={confirmDelete} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontSize: '.88rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
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
  borderRadius: 6, width: 26, height: 26,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background .12s', fontFamily: 'inherit',
};
