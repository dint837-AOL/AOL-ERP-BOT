/**
 * Credentials Vault Module
 *
 * Securely manages API keys, logins, and environment variables.
 * Allows setting reminder days (comma-separated) to trigger automated
 * Telegram warnings to admin before credentials expire / need rotation.
 * Uses /api/credentials for backend storage operations.
 *
 * Layout: Mobile-first, single-screen, no horizontal scrolling.
 * Pattern: Matches Accounts page (FAB + bottom sheet + card list).
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Globe, Key, Clock, Mail, Link as LinkIcon, MoreVertical, Edit3, Trash2, RefreshCw, X, ChevronDown } from 'lucide-react';
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

function getIcon(type: string) {
  switch (type) {
    case 'EMAIL':   return Mail;
    case 'API_KEY': return Key;
    case 'SOCIAL':  return Globe;
    default:        return LinkIcon;
  }
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'EMAIL':   return 'var(--primary)';
    case 'API_KEY': return 'var(--orange)';
    case 'SOCIAL':  return 'var(--green)';
    default:        return 'var(--muted)';
  }
}

function getTypeBg(type: string): string {
  switch (type) {
    case 'EMAIL':   return 'rgba(79,126,255,.12)';
    case 'API_KEY': return 'rgba(245,166,35,.12)';
    case 'SOCIAL':  return 'rgba(38,196,134,.12)';
    default:        return 'rgba(106,117,144,.12)';
  }
}

function getDaysUntilExpiry(expiry?: string): number | null {
  if (!expiry) return null;
  const diff = new Date(expiry).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

// ─── CredSheet — defined outside component to prevent remount ────────────────

interface CredSheetProps {
  editId: string | null;
  form: CredForm;
  saving: boolean;
  onClose: () => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
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
        {/* Name */}
        <div className="fg">
          <label>Name</label>
          <input name="name" placeholder="e.g. Gmail Admin, AWS Key" value={form.name} onChange={onChange} required />
        </div>

        {/* Type + Username */}
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

        {/* URL */}
        <div className="fg">
          <label>URL <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
          <input name="url" placeholder="https://..." value={form.url} onChange={onChange} />
        </div>

        {/* Expiry + Last Changed */}
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

        {/* Reminder Days */}
        <div className="fg">
          <label>Remind (Days Before Expiry)</label>
          <input
            name="reminder_days_before"
            placeholder="e.g. 5, 2, 1"
            value={form.reminder_days_before}
            onChange={onChange}
          />
          <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} />
            Telegram alert will be sent to admin on these days before expiry.
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '.95rem', fontWeight: 700, borderRadius: 10 }}
          disabled={saving}
        >
          {saving ? 'Saving...' : editId ? 'Update Credential' : 'Save Credential'}
        </button>
      </form>
    </>
  );
}

// ─── Actions Dropdown ─────────────────────────────────────────────────────────

interface ActionsMenuProps {
  cred: Cred;
  onEdit: () => void;
  onRotate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function ActionsMenu({ cred, onEdit, onRotate, onDelete, onClose }: ActionsMenuProps) {
  const rotateLabel = cred.cred_type === 'API_KEY' ? 'Rotate Key' : 'Change Password';
  const rotateIcon = <RefreshCw size={13} />;

  return (
    <div
      style={{
        position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 200,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,.4)', minWidth: 170, overflow: 'hidden',
        animation: 'fadeIn .12s ease-out'
      }}
      onClick={e => e.stopPropagation()}
    >
      <button onClick={() => { onEdit(); onClose(); }} style={menuBtnStyle}>
        <Edit3 size={13} /> Edit Details
      </button>
      <button onClick={() => { onRotate(); onClose(); }} style={menuBtnStyle}>
        {rotateIcon} {rotateLabel}
      </button>
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      <button onClick={() => { onDelete(); onClose(); }} style={{ ...menuBtnStyle, color: 'var(--red)' }}>
        <Trash2 size={13} /> Delete
      </button>
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

// ─── Credential Card ──────────────────────────────────────────────────────────

interface CredCardProps {
  cred: Cred;
  onEdit: () => void;
  onRotate: () => void;
  onDelete: () => void;
}

function CredCard({ cred, onEdit, onRotate, onDelete }: CredCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const Icon = getIcon(cred.cred_type);
  const color = getTypeColor(cred.cred_type);
  const bg = getTypeBg(cred.cred_type);
  const daysLeft = getDaysUntilExpiry(cred.expiry_date);

  let expiryColor = 'var(--muted)';
  if (daysLeft !== null) {
    if (daysLeft <= 0) expiryColor = 'var(--red)';
    else if (daysLeft <= 7) expiryColor = 'var(--orange)';
    else expiryColor = 'var(--green)';
  }

  return (
    <div
      style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12,
        position: 'relative'
      }}
      onClick={() => { if (menuOpen) setMenuOpen(false); }}
    >
      {/* Icon avatar */}
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: bg, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
      }}>
        <Icon size={16} />
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cred.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.65rem', fontWeight: 600, color, background: bg, padding: '2px 7px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {cred.cred_type.replace('_', ' ')}
          </span>
          {cred.username && (
            <span style={{ fontSize: '.7rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
              {cred.username}
            </span>
          )}
        </div>

        {/* Reminder + expiry row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
          {cred.reminder_days_before && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.7rem', color: 'var(--primary)' }}>
              <Clock size={11} />
              <span>{cred.reminder_days_before} days</span>
            </div>
          )}
          {cred.expiry_date && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.7rem', color: expiryColor }}>
              <span>
                {daysLeft !== null && daysLeft <= 0
                  ? '⚠ Expired'
                  : daysLeft !== null && daysLeft <= 30
                  ? `Expires in ${daysLeft}d`
                  : `Exp: ${fmtDate(cred.expiry_date)}`}
              </span>
            </div>
          )}
          {cred.last_changed_date && (
            <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>
              Chg: {fmtDate(cred.last_changed_date)}
            </div>
          )}
        </div>
      </div>

      {/* Actions button */}
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
          <ActionsMenu
            cred={cred}
            onEdit={onEdit}
            onRotate={onRotate}
            onDelete={onDelete}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CredentialsPage() {
  const [creds, setCreds] = useState<Cred[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CredForm>(BLANK_FORM);
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Cred | null>(null);

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2600); }

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

  useEffect(() => { fetchCreds(); }, [fetchCreds]);

  // Close menus when clicking outside
  useEffect(() => {
    const handler = () => {};
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  function openAdd() {
    setEditId(null);
    setForm(BLANK_FORM);
    setSheetOpen(true);
  }

  function openEdit(cred: Cred) {
    setEditId(cred.id);
    setForm({
      name: cred.name,
      cred_type: cred.cred_type,
      url: cred.url || '',
      username: cred.username || '',
      expiry_date: cred.expiry_date || '',
      last_changed_date: cred.last_changed_date || '',
      reminder_days_before: cred.reminder_days_before || '5, 2, 1',
    });
    setSheetOpen(true);
  }

  function openRotate(cred: Cred) {
    // Open edit pre-populated; user updates last_changed_date
    setEditId(cred.id);
    setForm({
      name: cred.name,
      cred_type: cred.cred_type,
      url: cred.url || '',
      username: cred.username || '',
      expiry_date: cred.expiry_date || '',
      last_changed_date: new Date().toISOString().split('T')[0],
      reminder_days_before: cred.reminder_days_before || '5, 2, 1',
    });
    setSheetOpen(true);
    showToast('Update the last changed date & save to log rotation.');
  }

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Name is required.'); return; }
    setSaving(true);
    try {
      const url = editId ? `/api/credentials/${editId}` : '/api/credentials';
      const method = editId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, cred_type: form.cred_type,
          url: form.url, username: form.username,
          expiry_date: form.expiry_date || null,
          last_changed_date: form.last_changed_date || null,
          reminder_days_before: form.reminder_days_before,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      showToast(editId ? 'Credential updated.' : 'Credential saved.');
      setSheetOpen(false);
      fetchCreds();
    } catch {
      showToast('Error saving credential.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/credentials/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Deleted.');
      setDeleteTarget(null);
      fetchCreds();
    } catch {
      showToast('Error deleting.');
    }
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalCount = creds.length;
  const expiringSoon = creds.filter(c => {
    const d = getDaysUntilExpiry(c.expiry_date);
    return d !== null && d >= 0 && d <= 30;
  }).length;
  const apiKeyCount = creds.filter(c => c.cred_type === 'API_KEY').length;
  const emailCount = creds.filter(c => c.cred_type === 'EMAIL').length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <Topbar title="Credentials & Keys" />

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

      {/* Scrollable content */}
      <div style={{
        padding: '12px 16px 100px', overflowY: 'auto', overflowX: 'hidden',
        height: 'calc(100dvh - 56px)', display: 'flex', flexDirection: 'column',
        boxSizing: 'border-box', gap: 12
      }}>

        {/* Summary stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
          <StatCard label="Total" value={totalCount} color="var(--primary)" />
          <StatCard label="Expiring ≤30d" value={expiringSoon} color={expiringSoon > 0 ? 'var(--orange)' : 'var(--muted)'} />
          <StatCard label="API Keys" value={apiKeyCount} color="var(--orange)" />
          <StatCard label="Emails" value={emailCount} color="var(--green)" />
        </div>

        {/* Credentials list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: '.84rem' }}>
              Loading credentials...
            </div>
          ) : creds.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '48px 20px', color: 'var(--muted)', fontSize: '.84rem',
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12
            }}>
              <Key size={28} style={{ opacity: .3, marginBottom: 12 }} />
              <div>No credentials saved yet.</div>
              <div style={{ fontSize: '.76rem', marginTop: 6 }}>Tap + to add your first credential.</div>
            </div>
          ) : (
            creds.map(c => (
              <CredCard
                key={c.id}
                cred={c}
                onEdit={() => openEdit(c)}
                onRotate={() => openRotate(c)}
                onDelete={() => setDeleteTarget(c)}
              />
            ))
          )}
        </div>
      </div>

      {/* FAB */}
      <button
        id="cred-fab"
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
            <CredSheet
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

      {/* Delete confirm modal */}
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
            <h3 style={{ textAlign: 'center', fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Delete Credential?</h3>
            <p style={{ textAlign: 'center', fontSize: '.88rem', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{deleteTarget.name}</p>
            <p style={{ textAlign: 'center', fontSize: '.78rem', color: 'var(--muted)', marginBottom: 22 }}>This action cannot be undone.</p>
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

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px'
    }}>
      <div style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 4, color }}>
        {value}
      </div>
    </div>
  );
}
