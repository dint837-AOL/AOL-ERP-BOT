/**
 * Tender Management Module
 *
 * Tracks Govt/Private tenders, submission pipelines, and valuations.
 * Features countdown timer for approaching deadlines.
 * Layout: Mobile-first table (fixed layout, no horizontal scroll).
 * Pattern: Matches Meetings / Credentials pages (FAB + bottom sheet).
 * Preserves all original functionality + status/type filter buttons.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Briefcase, DownloadCloud, Trash2, Bell, BellOff, Plus, Calendar, Edit3 } from 'lucide-react';
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
  notify_email: number;
};

const BLANK: TenderForm = {
  title: '', organization: '', tender_type: 'GOVT',
  published_date: '', submission_deadline: '',
  estimated_value: '', documents_url: '', notes: '',
  notify_email: 1,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateShort(iso?: string) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function fmtDateTime(iso?: string) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function getCountdown(deadline: string): { text: string; color: string; urgent: boolean } {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff < 0) return { text: 'Expired', color: '#ef4444', urgent: true };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days === 0) return { text: `${hours}h left`, color: '#eab308', urgent: true };
  if (days === 1) return { text: '1d left (Urgent)', color: '#ef4444', urgent: true };
  return { text: `${days}d left`, color: days <= 3 ? '#eab308' : '#22c55e', urgent: days <= 3 };
}

const STATUS_LABELS: Record<string, string> = {
  UPCOMING: 'Upcoming', IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted', WON: 'Won', LOST: 'Lost',
};
const STATUS_COLORS: Record<string, string> = {
  UPCOMING: '#38bdf8', IN_PROGRESS: '#eab308',
  SUBMITTED: '#94a3b8', WON: '#22c55e', LOST: '#ef4444',
};
const STATUS_BGS: Record<string, string> = {
  UPCOMING: 'rgba(56,189,248,0.12)', IN_PROGRESS: 'rgba(234,179,8,0.12)',
  SUBMITTED: 'rgba(148,163,184,0.12)', WON: 'rgba(34,197,94,0.12)', LOST: 'rgba(239,68,68,0.12)',
};

// ─── Tender Sheet ─────────────────────────────────────────────────────────────

interface TenderSheetProps {
  editId: string | null;
  form: TenderForm;
  saving: boolean;
  onClose: () => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  onToggleNotify: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

function TenderSheet({ editId, form, saving, onClose, onChange, onToggleNotify, onSubmit }: TenderSheetProps) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 14px', borderBottom: '1px solid #2a3050' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>{editId ? 'Edit Tender' : 'Add Tender'}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: 4 }}>X</button>
      </div>
      <form onSubmit={onSubmit} style={{ padding: '18px 20px 24px' }}>
        <div className="fg" style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 5 }}>Tender Title *</label>
          <input name="title" placeholder="e.g. IT Equipment Supply" value={form.title} onChange={onChange} required style={{ width: '100%', background: '#131722', border: '1px solid #2a3050', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: '0.9rem', outline: 'none' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 5 }}>Organization (Org)</label>
            <input name="organization" placeholder="e.g. Ministry of ICT" value={form.organization} onChange={onChange} style={{ width: '100%', background: '#131722', border: '1px solid #2a3050', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: '0.88rem', outline: 'none' }} />
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 5 }}>Type</label>
            <select name="tender_type" value={form.tender_type} onChange={onChange} style={{ width: '100%', background: '#131722', border: '1px solid #2a3050', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: '0.88rem', outline: 'none', cursor: 'pointer' }}>
              <option value="GOVT">Government</option>
              <option value="PRIVATE">Private</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 5 }}>Published Date (Pub)</label>
            <input type="date" name="published_date" value={form.published_date} onChange={onChange} style={{ width: '100%', background: '#131722', border: '1px solid #2a3050', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: '0.88rem', outline: 'none', colorScheme: 'dark', cursor: 'pointer' }} />
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '0.74rem', color: '#38bdf8', fontWeight: 700, display: 'block', marginBottom: 5 }}>Closing Date *</label>
            <input type="datetime-local" name="submission_deadline" value={form.submission_deadline} onChange={onChange} required style={{ width: '100%', background: '#131722', border: '1px solid #38bdf8', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: '0.88rem', outline: 'none', colorScheme: 'dark', cursor: 'pointer' }} />
          </div>
        </div>
        <div className="fg" style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 5 }}>Estimated Value (৳)</label>
          <input type="number" name="estimated_value" placeholder="0" value={form.estimated_value} onChange={onChange} min="0" style={{ width: '100%', background: '#131722', border: '1px solid #2a3050', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: '0.88rem', outline: 'none' }} />
        </div>
        <div className="fg" style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 5 }}>Documents URL <span style={{ color: '#64748b', fontWeight: 400 }}>(optional)</span></label>
          <input name="documents_url" placeholder="https://drive.google.com/..." value={form.documents_url} onChange={onChange} style={{ width: '100%', background: '#131722', border: '1px solid #2a3050', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: '0.88rem', outline: 'none' }} />
        </div>
        <div className="fg" style={{ marginBottom: 16 }}>
          <label style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 5 }}>Notes <span style={{ color: '#64748b', fontWeight: 400 }}>(optional)</span></label>
          <textarea name="notes" placeholder="Additional notes..." value={form.notes} onChange={onChange} rows={2} style={{ width: '100%', background: '#131722', border: '1px solid #2a3050', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: '0.84rem', fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
        </div>

        {/* Notifications Bell */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#131722', border: '1px solid #2a3050', borderRadius: '10px', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: form.notify_email ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: form.notify_email ? '#eab308' : '#64748b' }}>
              {form.notify_email ? <Bell size={17} /> : <BellOff size={17} />}
            </div>
            <div>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#f1f5f9' }}>Notifications</div>
              <div style={{ fontSize: '0.72rem', color: '#38bdf8' }}>Reminders sent 3 days &amp; 1 day before closing date</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleNotify}
            style={{
              background: form.notify_email ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${form.notify_email ? '#eab308' : '#334155'}`,
              color: form.notify_email ? '#eab308' : '#94a3b8',
              borderRadius: '8px', padding: '7px 14px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5
            }}
          >
            {form.notify_email ? <Bell size={14} /> : <BellOff size={14} />}
            {form.notify_email ? 'ON' : 'OFF'}
          </button>
        </div>

        <button type="submit" style={{ width: '100%', background: 'linear-gradient(135deg, #4f7eff, #6c4fe3)', border: 'none', color: '#fff', borderRadius: '12px', padding: '14px', fontSize: '0.98rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: saving ? 0.6 : 1, transition: 'opacity 0.15s', boxShadow: '0 4px 15px rgba(79,126,255,0.3)' }} disabled={saving}>
          {saving ? 'Saving...' : editId ? 'Update Tender' : 'Save Tender'}
        </button>
      </form>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TendersPage() {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  // Filters
  const [fStatus, setFStatus] = useState('ALL');
  const [fType, setFType] = useState('ALL');

  // Sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TenderForm>(BLANK);
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Tender | null>(null);

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2600); }

  const fetchTenders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tenders');
      const data = await res.json();
      setTenders(Array.isArray(data) ? data : []);
    } catch { showToast('Error loading tenders.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTenders(); }, [fetchTenders]);

  const filtered = tenders.filter(t => {
    if (fStatus !== 'ALL' && t.status !== fStatus) return false;
    if (fType !== 'ALL' && t.tender_type !== fType) return false;
    return true;
  });

  function openAdd() { setEditId(null); setForm(BLANK); setSheetOpen(true); }

  function openEdit(t: Tender) {
    setEditId(t.id);
    const dl = t.submission_deadline ? new Date(t.submission_deadline).toISOString().slice(0, 16) : '';
    setForm({
      title: t.title,
      organization: t.organization || '',
      tender_type: t.tender_type,
      published_date: t.published_date || '',
      submission_deadline: dl,
      estimated_value: String(t.estimated_value || ''),
      documents_url: t.documents_url || '',
      notes: t.notes || '',
      notify_email: t.notify_email ?? 1,
    });
    setSheetOpen(true);
  }

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }, []);

  const handleToggleNotify = useCallback(() => {
    setForm(prev => ({ ...prev, notify_email: prev.notify_email ? 0 : 1 }));
  }, []);

  async function toggleTenderNotify(t: Tender) {
    const nextVal = t.notify_email ? 0 : 1;
    try {
      await fetch(`/api/tenders/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notify_email: nextVal }),
      });
      showToast(`Notifications ${nextVal ? 'enabled' : 'muted'} for tender.`);
      fetchTenders();
    } catch {
      showToast('Failed to update notification setting.');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.submission_deadline) { showToast('Title and closing date are required.'); return; }
    setSaving(true);
    try {
      const url = editId ? `/api/tenders/${editId}` : '/api/tenders';
      const method = editId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title, organization: form.organization,
          tender_type: form.tender_type, published_date: form.published_date || null,
          submission_deadline: new Date(form.submission_deadline).toISOString(),
          estimated_value: parseFloat(form.estimated_value) || 0,
          documents_url: form.documents_url, notes: form.notes,
          notify_email: form.notify_email,
          ...(editId ? {} : { status: 'UPCOMING' }),
        }),
      });
      if (!res.ok) throw new Error('Failed');
      showToast(editId ? 'Tender updated.' : 'Tender saved!');
      setSheetOpen(false);
      fetchTenders();
    } catch { showToast('Error saving tender.'); }
    finally { setSaving(false); }
  }

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      await fetch(`/api/tenders/${id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      showToast('Status updated.');
      fetchTenders();
    } catch { showToast('Error updating status.'); }
  };

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/tenders/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Tender deleted.');
      setDeleteTarget(null);
      fetchTenders();
    } catch { showToast('Error deleting.'); }
  }

  return (
    <>
      <Topbar title="Tender Details" />

      {toast && (
        <div style={{ position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)', background: '#1d2133', border: '1px solid #2a3050', borderRadius: 10, padding: '10px 20px', fontSize: '.84rem', zIndex: 999, color: '#dde2f0', whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,.4)' }}>
          {toast}
        </div>
      )}

      <div className="scroll" style={{ padding: '20px 24px 100px' }}>
        {/* Filters bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filter:</span>
            {['ALL', 'GOVT', 'PRIVATE'].map(tp => (
              <button
                key={tp}
                onClick={() => setFType(tp)}
                style={{
                  padding: '5px 12px', borderRadius: '20px', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                  background: fType === tp ? '#4f7eff' : '#161926',
                  color: fType === tp ? '#fff' : '#94a3b8',
                  borderWidth: 1, borderStyle: 'solid', borderColor: fType === tp ? '#4f7eff' : '#2a3050',
                  transition: 'all 0.15s'
                }}
              >
                {tp === 'ALL' ? 'All Types' : tp === 'GOVT' ? 'Govt' : 'Private'}
              </button>
            ))}
            <div style={{ width: 1, height: 16, background: '#2a3050', margin: '0 4px' }} />
            {['ALL', 'UPCOMING', 'IN_PROGRESS', 'SUBMITTED', 'WON', 'LOST'].map(st => (
              <button
                key={st}
                onClick={() => setFStatus(st)}
                style={{
                  padding: '5px 12px', borderRadius: '20px', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                  background: fStatus === st ? '#4f7eff' : '#161926',
                  color: fStatus === st ? '#fff' : '#94a3b8',
                  borderWidth: 1, borderStyle: 'solid', borderColor: fStatus === st ? '#4f7eff' : '#2a3050',
                  transition: 'all 0.15s'
                }}
              >
                {st === 'ALL' ? 'All Statuses' : STATUS_LABELS[st] || st}
              </button>
            ))}
          </div>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{filtered.length} of {tenders.length} tenders</span>
        </div>

        {/* Table card — styled identically to Daily Tasks Admin View */}
        <div className="card" style={{ background: '#161926', border: '1px solid #2a3050', borderRadius: '12px', overflow: 'hidden' }}>
          <div className="card-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #2a3050' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>Tender Details</h3>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Active Registry</span>
          </div>

          <div className="table-scroll">
            <table style={{ width: '100%', minWidth: '920px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid #2a3050' }}>
                  <th style={{ minWidth: '220px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Title</th>
                  <th style={{ width: '180px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Org</th>
                  <th style={{ width: '120px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Pub</th>
                  <th style={{ width: '130px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Close</th>
                  <th style={{ width: '180px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Deadline</th>
                  <th style={{ width: '140px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Status</th>
                  <th style={{ width: '110px', padding: '12px 16px', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8', fontSize: '0.84rem' }}>Loading tenders…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '44px 20px', color: '#94a3b8', fontSize: '0.85rem' }}>
                      <Briefcase size={26} style={{ opacity: 0.35, display: 'block', margin: '0 auto 10px' }} />
                      No tenders found. Click the + button at bottom right to add a tender.
                    </td>
                  </tr>
                ) : filtered.map(t => {
                  const cd = getCountdown(t.submission_deadline);
                  const isDone = ['SUBMITTED', 'WON', 'LOST'].includes(t.status);
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid rgba(42,48,80,0.6)', transition: 'background 0.15s' }}>
                      {/* Title */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.86rem', color: '#f1f5f9' }}>{t.title}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <span style={{
                            fontSize: '0.66rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, display: 'inline-block',
                            textTransform: 'uppercase', letterSpacing: '.04em',
                            color: t.tender_type === 'GOVT' ? '#38bdf8' : '#f59e0b',
                            background: t.tender_type === 'GOVT' ? 'rgba(56,189,248,0.12)' : 'rgba(245,158,11,0.12)',
                          }}>
                            {t.tender_type === 'GOVT' ? 'Govt' : 'Private'}
                          </span>
                          {t.documents_url && (
                            <a href={t.documents_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.72rem', color: '#4f7eff', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', fontWeight: 600 }}>
                              <DownloadCloud size={12} /> Docs
                            </a>
                          )}
                          {t.estimated_value > 0 && (
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>৳{t.estimated_value.toLocaleString()}</span>
                          )}
                        </div>
                      </td>

                      {/* Org */}
                      <td style={{ padding: '12px 16px', fontSize: '0.84rem', color: '#e2e8f0' }}>
                        {t.organization || <span style={{ color: '#64748b', fontStyle: 'italic' }}>—</span>}
                      </td>

                      {/* Pub */}
                      <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {fmtDateShort(t.published_date)}
                      </td>

                      {/* Close (Countdown badge) */}
                      <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: isDone ? '#94a3b8' : cd.color,
                          background: isDone ? 'rgba(148,163,184,0.1)' : cd.urgent ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                          border: `1px solid ${isDone ? 'rgba(148,163,184,0.2)' : cd.urgent ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`
                        }}>
                          {cd.text}
                        </span>
                      </td>

                      {/* Deadline (Closing Date & Time) */}
                      <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: '#f1f5f9', whiteSpace: 'nowrap' }}>
                        {fmtDateTime(t.submission_deadline)}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <select
                          value={t.status}
                          onChange={e => updateStatus(t.id, e.target.value)}
                          style={{
                            width: 'auto', padding: '6px 10px', borderRadius: 7, fontSize: '0.76rem', fontWeight: 600,
                            border: '1px solid #2a3050', background: STATUS_BGS[t.status],
                            color: STATUS_COLORS[t.status], cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
                          }}
                        >
                          {Object.entries(STATUS_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => toggleTenderNotify(t)}
                            title={t.notify_email ? 'Reminders ON (3d & 1d before closing date)' : 'Reminders OFF (click to turn on)'}
                            style={{
                              background: 'none', border: 'none',
                              color: t.notify_email ? '#eab308' : '#64748b',
                              cursor: 'pointer', padding: '6px', borderRadius: '6px',
                              display: 'inline-flex', alignItems: 'center', transition: 'all 0.15s',
                            }}
                          >
                            {t.notify_email ? <Bell size={16} /> : <BellOff size={16} />}
                          </button>
                          <button
                            onClick={() => openEdit(t)}
                            title="Edit Tender"
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', transition: 'all 0.15s' }}
                            onMouseOver={e => (e.currentTarget.style.color = '#38bdf8')}
                            onMouseOut={e => (e.currentTarget.style.color = '#94a3b8')}
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(t)}
                            title="Delete Tender"
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

      {/* Floating Add Button matching Daily Task View */}
      <button
        id="tender-fab"
        onClick={openAdd}
        title="Add Tender"
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
            <TenderSheet editId={editId} form={form} saving={saving} onClose={() => setSheetOpen(false)} onChange={handleChange} onToggleNotify={handleToggleNotify} onSubmit={handleSubmit} />
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
            <h3 style={{ textAlign: 'center', fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Delete Tender?</h3>
            <p style={{ textAlign: 'center', fontSize: '.88rem', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{deleteTarget.title}</p>
            <p style={{ textAlign: 'center', fontSize: '.76rem', color: 'var(--muted)', marginBottom: 22 }}>{deleteTarget.organization || ''}</p>
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

// Also need PATCH endpoint for tenders — handled in openclaw-mock already via /api/tenders/:id/status
// For full edit, we'll need to add PATCH /api/tenders/:id in openclaw-mock.ts

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer',
  borderRadius: 6, width: 28, height: 28,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background .12s', fontFamily: 'inherit',
};
