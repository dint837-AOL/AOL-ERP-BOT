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
import { Key, Clock, Trash2, Edit3 } from 'lucide-react';
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
}

type CredForm = {
  name: string;
  cred_type: string;
  url: string;
  username: string;
  expiry_date: string;
  last_changed_date: string;
  reminder_days_before: string;
};

const BLANK_FORM: CredForm = {
  name: '',
  cred_type: 'OTHER',
  url: '',
  username: '',
  expiry_date: '',
  last_changed_date: '',
  reminder_days_before: '5, 2, 1',
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
  onSubmit: (e: React.FormEvent) => void;
}

function CredSheet({ editId, form, saving, onClose, onChange, onSubmit }: CredSheetProps) {
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
        <div className="fg">
          <label>Remind (Days Before Expiry)</label>
          <input name="reminder_days_before" placeholder="e.g. 5, 2, 1" value={form.reminder_days_before} onChange={onChange} />
          <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} /> Telegram alert will be sent to admin on these days before expiry.
          </div>
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
    setForm({ name: c.name, cred_type: c.cred_type, url: c.url || '', username: c.username || '', expiry_date: c.expiry_date || '', last_changed_date: c.last_changed_date || '', reminder_days_before: c.reminder_days_before || '5, 2, 1' });
    setSheetOpen(true);
  }

  function openRotate(c: Cred) {
    setEditId(c.id);
    setForm({ name: c.name, cred_type: c.cred_type, url: c.url || '', username: c.username || '', expiry_date: c.expiry_date || '', last_changed_date: new Date().toISOString().split('T')[0], reminder_days_before: c.reminder_days_before || '5, 2, 1' });
    setSheetOpen(true);
    showToast('Update the last changed date & save to log rotation.');
  }

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Name is required.'); return; }
    setSaving(true);
    try {
      const url = editId ? `/api/credentials/${editId}` : '/api/credentials';
      const res = await fetch(url, {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, cred_type: form.cred_type, url: form.url, username: form.username, expiry_date: form.expiry_date || null, last_changed_date: form.last_changed_date || null, reminder_days_before: form.reminder_days_before }),
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

      <div style={{ padding: '12px 16px 100px', overflowY: 'auto', overflowX: 'hidden', height: 'calc(100dvh - 56px)', boxSizing: 'border-box' }}>

        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-head">
            <h3>Credential Vault</h3>
            <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{creds.length} total</span>
          </div>

          {/* Fixed-layout table — fits viewport, zero horizontal scroll */}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              {/* Name | Type | Expiry | Username | Actions */}
              <col style={{ width: '28%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '28%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Type</th>
                <th style={th}>Expiry</th>
                <th style={th}>Username</th>
                <th style={{ ...th, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)', fontSize: '.82rem' }}>Loading...</td></tr>
              ) : creds.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)', fontSize: '.82rem' }}>
                  <Key size={22} style={{ opacity: .3, display: 'block', margin: '0 auto 8px' }} />
                  No credentials saved yet.
                </td></tr>
              ) : creds.map((c, i) => {
                const daysLeft = getDaysUntilExpiry(c.expiry_date);
                const expiryColor = daysLeft === null ? 'var(--muted)' : daysLeft <= 0 ? 'var(--red)' : daysLeft <= 7 ? 'var(--orange)' : 'var(--text)';
                const expiryText = daysLeft === null ? '—' : daysLeft <= 0 ? 'Expired' : daysLeft <= 30 ? `${daysLeft}d left` : fmtDate(c.expiry_date);

                return (
                  <tr key={c.id} style={{ borderBottom: i < creds.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    {/* Name */}
                    <td style={td}>
                      <div style={{ fontWeight: 600, fontSize: '.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    </td>
                    {/* Type */}
                    <td style={{ ...td, fontSize: '.72rem', color: 'var(--muted)' }}>{typeLabel(c.cred_type)}</td>
                    {/* Expiry */}
                    <td style={{ ...td, fontSize: '.72rem', color: expiryColor, whiteSpace: 'nowrap', fontWeight: daysLeft !== null && daysLeft <= 7 ? 600 : 400 }}>
                      {expiryText}
                    </td>
                    {/* Username */}
                    <td style={{ ...td, fontSize: '.72rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.username || '—'}
                    </td>
                    {/* Actions */}
                    <td style={{ ...td, textAlign: 'right', padding: '6px 8px' }}>
                      <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                        <button onClick={() => openEdit(c)} title="Edit" style={iconBtn}><Edit3 size={13} /></button>
                        <button onClick={() => setDeleteTarget(c)} title="Delete" style={{ ...iconBtn, color: 'var(--red)' }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAB */}
      <button id="cred-fab" onClick={openAdd} style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 800, width: 56, height: 56, borderRadius: '50%', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: '1.8rem', cursor: 'pointer', boxShadow: '0 4px 20px rgba(79,126,255,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        +
      </button>

      {/* Add/Edit bottom sheet */}
      {sheetOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) setSheetOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 910, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, paddingBottom: 'env(safe-area-inset-bottom,12px)', maxHeight: '92dvh', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,.5)', animation: 'slideSheet .22s ease-out' }}>
            <CredSheet editId={editId} form={form} saving={saving} onClose={() => setSheetOpen(false)} onChange={handleChange} onSubmit={handleSubmit} />
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
            <h3 style={{ textAlign: 'center', fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Delete Credential?</h3>
            <p style={{ textAlign: 'center', fontSize: '.88rem', fontWeight: 600, color: 'var(--text)', marginBottom: 20 }}>{deleteTarget.name}</p>
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
  borderRadius: 6, width: 26, height: 26,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background .12s', fontFamily: 'inherit',
};
