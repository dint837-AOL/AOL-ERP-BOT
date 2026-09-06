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
import { Briefcase, DownloadCloud, Trash2 } from 'lucide-react';
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
};

const BLANK: TenderForm = {
  title: '', organization: '', tender_type: 'GOVT',
  published_date: '', submission_deadline: '',
  estimated_value: '', documents_url: '', notes: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateShort(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch { return iso; }
}

function getCountdown(deadline: string): { text: string; color: string; urgent: boolean } {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff < 0) return { text: 'Exp.', color: 'var(--red)', urgent: true };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days === 0) return { text: `${hours}h`, color: 'var(--orange)', urgent: true };
  return { text: `${days}d`, color: days <= 3 ? 'var(--orange)' : 'var(--green)', urgent: days <= 3 };
}

const STATUS_LABELS: Record<string, string> = {
  UPCOMING: 'Upcoming', IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted', WON: 'Won', LOST: 'Lost',
};
const STATUS_COLORS: Record<string, string> = {
  UPCOMING: 'var(--primary)', IN_PROGRESS: 'var(--orange)',
  SUBMITTED: 'var(--muted)', WON: 'var(--green)', LOST: 'var(--red)',
};
const STATUS_BGS: Record<string, string> = {
  UPCOMING: 'rgba(79,126,255,.1)', IN_PROGRESS: 'rgba(245,166,35,.1)',
  SUBMITTED: 'rgba(106,117,144,.1)', WON: 'rgba(38,196,134,.1)', LOST: 'rgba(242,92,122,.1)',
};

// ─── Tender Sheet ─────────────────────────────────────────────────────────────

interface TenderSheetProps {
  editId: string | null;
  form: TenderForm;
  saving: boolean;
  onClose: () => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function TenderSheet({ editId, form, saving, onClose, onChange, onSubmit }: TenderSheetProps) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 12px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{editId ? 'Edit Tender' : 'Add Tender'}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1, padding: 4 }}>X</button>
      </div>
      <form onSubmit={onSubmit} style={{ padding: '0 20px 24px' }}>
        <div className="fg">
          <label>Tender Title</label>
          <input name="title" placeholder="e.g. IT Equipment Supply" value={form.title} onChange={onChange} required />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 13 }}>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label>Organization</label>
            <input name="organization" placeholder="e.g. Ministry of ICT" value={form.organization} onChange={onChange} />
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label>Type</label>
            <select name="tender_type" value={form.tender_type} onChange={onChange}>
              <option value="GOVT">Government</option>
              <option value="PRIVATE">Private</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 13 }}>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label>Published Date</label>
            <input type="date" name="published_date" value={form.published_date} onChange={onChange} />
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label>Deadline</label>
            <input type="datetime-local" name="submission_deadline" value={form.submission_deadline} onChange={onChange} required />
          </div>
        </div>
        <div className="fg">
          <label>Estimated Value (৳)</label>
          <input type="number" name="estimated_value" placeholder="0" value={form.estimated_value} onChange={onChange} min="0" />
        </div>
        <div className="fg">
          <label>Documents URL <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
          <input name="documents_url" placeholder="https://drive.google.com/..." value={form.documents_url} onChange={onChange} />
        </div>
        <div className="fg">
          <label>Notes <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
          <textarea name="notes" placeholder="Additional notes..." value={form.notes} onChange={onChange} rows={2} style={{ width: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: '.84rem', fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
        </div>
        <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '.95rem', fontWeight: 700, borderRadius: 10 }} disabled={saving}>
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
    // Convert ISO deadline to datetime-local format
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
    });
    setSheetOpen(true);
  }

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.submission_deadline) { showToast('Title and deadline are required.'); return; }
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

  // ── table styles ──────────────────────────────────────────────────────────
  const th: React.CSSProperties = {
    padding: '8px 10px', fontSize: '.62rem', fontWeight: 700, color: 'var(--muted)',
    textTransform: 'uppercase', letterSpacing: '.04em',
    borderBottom: '1px solid var(--border)',
    background: 'rgba(0,0,0,.1)', textAlign: 'left', whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    padding: '10px 10px', fontSize: '.78rem', color: 'var(--text)', verticalAlign: 'middle',
  };

  // ── filter pill style ─────────────────────────────────────────────────────
  const pill = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: 20, fontSize: '.74rem', fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'inherit',
    background: active ? 'var(--primary)' : 'var(--card)',
    color: active ? '#fff' : 'var(--muted)',
    transition: 'all .15s',
  });

  return (
    <>
      <Topbar title="Tender Management" />

      {toast && (
        <div style={{ position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)', background: '#1d2133', border: '1px solid #2a3050', borderRadius: 10, padding: '10px 20px', fontSize: '.84rem', zIndex: 999, color: '#dde2f0', whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,.4)' }}>
          {toast}
        </div>
      )}

      <div style={{ padding: '12px 16px 100px', overflowY: 'auto', overflowX: 'hidden', height: 'calc(100dvh - 56px)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Table card */}
        <div className="card" style={{ marginBottom: 0, flex: 1 }}>
          <div className="card-head">
            <h3>Tender Registry</h3>
            <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{filtered.length} of {tenders.length}</span>
          </div>

          {/* Fixed-layout table — fits viewport, zero horizontal scroll */}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              {/* Title | Type | Deadline | Status | Actions */}
              <col style={{ width: '22%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '35%' }} />
              <col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={th}>Title</th>
                <th style={th}>Type</th>
                <th style={{ ...th, textAlign: 'center' }}>Deadline</th>
                <th style={{ ...th, textAlign: 'center' }}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)', fontSize: '.82rem' }}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)', fontSize: '.82rem' }}>
                  <Briefcase size={22} style={{ opacity: .3, display: 'block', margin: '0 auto 8px' }} />
                  No tenders found.
                </td></tr>
              ) : filtered.map((t, i) => {
                const cd = getCountdown(t.submission_deadline);
                const isDone = ['SUBMITTED', 'WON', 'LOST'].includes(t.status);
                return (
                  <tr key={t.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    {/* Title */}
                    <td style={td}>
                      <div style={{ fontWeight: 600, fontSize: '.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                      {t.documents_url && (
                        <a href={t.documents_url} target="_blank" rel="noreferrer" style={{ fontSize: '.66rem', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                          <DownloadCloud size={10} /> Docs
                        </a>
                      )}
                    </td>
                    {/* Type badge */}
                    <td style={td}>
                      <span style={{
                        fontSize: '.66rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, display: 'inline-block',
                        textTransform: 'uppercase', letterSpacing: '.04em',
                        color: t.tender_type === 'GOVT' ? 'var(--primary)' : 'var(--orange)',
                        background: t.tender_type === 'GOVT' ? 'rgba(79,126,255,.1)' : 'rgba(245,166,35,.1)',
                      }}>
                        {t.tender_type === 'GOVT' ? 'Govt' : 'Private'}
                      </span>
                    </td>
                    {/* Deadline — centered countdown */}
                    <td style={{ ...td, textAlign: 'center', fontSize: '.76rem', fontWeight: 700, whiteSpace: 'nowrap', color: isDone ? 'var(--muted)' : cd.color }}>
                      {cd.text}
                    </td>
                    {/* Status dropdown — centered with left gap */}
                    <td style={{ ...td, padding: '6px 8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', paddingLeft: 10 }}>
                        <select
                          value={t.status}
                          onChange={e => updateStatus(t.id, e.target.value)}
                          style={{
                            width: 'auto', padding: '5px 6px', borderRadius: 6, fontSize: '.68rem', fontWeight: 600,
                            border: '1px solid var(--border)', background: STATUS_BGS[t.status],
                            color: STATUS_COLORS[t.status], cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
                          }}
                        >
                          {Object.entries(STATUS_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    {/* Actions */}
                    <td style={{ ...td, textAlign: 'right', padding: '6px 8px' }}>
                      <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                        <button onClick={() => openEdit(t)} title="Edit" style={iconBtn}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={() => setDeleteTarget(t)} title="Delete" style={{ ...iconBtn, color: 'var(--red)' }}>
                          <Trash2 size={13} />
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

      {/* FAB */}
      <button id="tender-fab" onClick={openAdd} style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 800, width: 56, height: 56, borderRadius: '50%', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: '1.8rem', cursor: 'pointer', boxShadow: '0 4px 20px rgba(79,126,255,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        +
      </button>

      {/* Add/Edit bottom sheet */}
      {sheetOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) setSheetOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 910, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, paddingBottom: 'env(safe-area-inset-bottom,12px)', maxHeight: '92dvh', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,.5)', animation: 'slideSheet .22s ease-out' }}>
            <TenderSheet editId={editId} form={form} saving={saving} onClose={() => setSheetOpen(false)} onChange={handleChange} onSubmit={handleSubmit} />
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
