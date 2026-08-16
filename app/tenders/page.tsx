'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Briefcase, Calendar, CheckCircle2, AlertCircle, FileText, DownloadCloud } from 'lucide-react';
import Topbar from '../components/Topbar';

export default function TendersPage() {
  const [tenders, setTenders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState('');

  // Filters
  const [fStatus, setFStatus] = useState('ALL');
  const [fType, setFType] = useState('ALL');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [mTitle, setMTitle] = useState('');
  const [mOrg, setMOrg] = useState('');
  const [mType, setMType] = useState('GOVT');
  const [mPub, setMPub] = useState('');
  const [mSub, setMSub] = useState('');
  const [mVal, setMVal] = useState('');
  const [mDocs, setMDocs] = useState('');

  function showToast(m: string) {
    setToastMsg(m);
    setTimeout(() => setToastMsg(''), 2500);
  }

  const fetchTenders = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tenders');
      const data = await res.json();
      setTenders(data);
    } catch (e) {
      showToast('Error loading tenders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenders();
  }, []);

  const addTender = async () => {
    if (!mTitle || !mSub) {
      showToast('Title and Deadline required.');
      return;
    }
    try {
      await fetch('/api/tenders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: mTitle, organization: mOrg, tender_type: mType,
          published_date: mPub, submission_deadline: mSub,
          estimated_value: parseFloat(mVal) || 0,
          documents_url: mDocs, status: 'UPCOMING'
        })
      });
      setShowModal(false);
      setMTitle(''); setMOrg(''); setMPub(''); setMSub(''); setMVal(''); setMDocs('');
      showToast('Tender saved!');
      fetchTenders();
    } catch (e) {
      showToast('Error saving tender.');
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      await fetch(`/api/tenders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      showToast('Status updated.');
      fetchTenders();
    } catch (e) {
      showToast('Error updating status.');
    }
  };

  const deleteTender = async (id: string) => {
    if (!confirm('Delete this tender?')) return;
    try {
      await fetch('/api/tenders/' + id, { method: 'DELETE' });
      showToast('Tender deleted.');
      fetchTenders();
    } catch (e) {
      showToast('Error deleting.');
    }
  };

  const getCountdown = (deadline: string) => {
    const end = new Date(deadline).getTime();
    const now = new Date().getTime();
    const diff = end - now;
    if (diff < 0) return { text: 'Expired', color: 'var(--red)', urgent: true };
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days === 0) return { text: `${hours}h left`, color: 'var(--orange)', urgent: true };
    return { text: `${days}d left`, color: days <= 3 ? 'var(--orange)' : 'var(--green)', urgent: days <= 3 };
  };

  const filtered = tenders.filter(t => {
    if (fStatus !== 'ALL' && t.status !== fStatus) return false;
    if (fType !== 'ALL' && t.tender_type !== fType) return false;
    return true;
  });

  return (
    <>
      <Topbar title="Tender Management">
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={15} /> Add Tender
        </button>
      </Topbar>

      <div className="scroll">
        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)' }}>
            <option value="ALL">All Statuses</option>
            <option value="UPCOMING">Upcoming</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="WON">Won</option>
            <option value="LOST">Lost</option>
          </select>
          <select value={fType} onChange={e => setFType(e.target.value)} style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)' }}>
            <option value="ALL">All Types</option>
            <option value="GOVT">Government</option>
            <option value="PRIVATE">Private</option>
          </select>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Tender Registry</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Tender Details</th>
                <th>Deadline & Status</th>
                <th>Value</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-r"><td colSpan={4}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr className="empty-r"><td colSpan={4}>No tenders found.</td></tr>
              ) : (
                filtered.map(t => {
                  const cd = getCountdown(t.submission_deadline);
                  const isDone = t.status === 'SUBMITTED' || t.status === 'WON' || t.status === 'LOST';
                  return (
                    <tr key={t.id}>
                      <td>
                        <div className="av-cell">
                          <div className="av" style={{ background: t.tender_type === 'GOVT' ? 'rgba(79,126,255,.1)' : 'rgba(255,159,64,.1)', color: t.tender_type === 'GOVT' ? 'var(--primary)' : 'var(--orange)' }}>
                            <Briefcase size={14} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{t.title}</div>
                            <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: '2px' }}>
                              {t.organization} • {t.tender_type}
                            </div>
                            {t.documents_url && (
                              <a href={t.documents_url} target="_blank" rel="noreferrer" style={{ fontSize: '.7rem', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                <DownloadCloud size={10} /> Docs
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {!isDone && cd.urgent && <AlertCircle size={14} color={cd.color} />}
                          <div>
                            <div style={{ fontWeight: 600, color: isDone ? 'var(--muted)' : cd.color, fontSize: '.9rem' }}>
                              {isDone ? new Date(t.submission_deadline).toLocaleDateString() : cd.text}
                            </div>
                            <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: '2px' }}>
                              Deadline: {new Date(t.submission_deadline).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>৳ {t.estimated_value.toLocaleString('en-BD')}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <select 
                            value={t.status} 
                            onChange={e => updateStatus(t.id, e.target.value)}
                            style={{ 
                              padding: '4px 8px', borderRadius: '6px', fontSize: '.75rem', 
                              border: '1px solid var(--border)', background: 'var(--bg)',
                              color: t.status === 'WON' ? 'var(--green)' : t.status === 'LOST' ? 'var(--red)' : 'inherit'
                            }}
                          >
                            <option value="UPCOMING">Upcoming</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="SUBMITTED">Submitted</option>
                            <option value="WON">Won</option>
                            <option value="LOST">Lost</option>
                          </select>
                          <button onClick={() => deleteTender(t.id)} style={{ color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>
                            <X size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="veil on" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal">
            <div className="mhead">
              <h3>Add Tender</h3>
              <button className="xbtn" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div className="fg"><label>Tender Title</label><input placeholder="e.g. IT Equipment Supply" value={mTitle} onChange={e => setMTitle(e.target.value)} /></div>
            <div className="drow">
              <div className="fg"><label>Organization</label><input placeholder="e.g. Ministry of ICT" value={mOrg} onChange={e => setMOrg(e.target.value)} /></div>
              <div className="fg">
                <label>Type</label>
                <select value={mType} onChange={e => setMType(e.target.value)}>
                  <option value="GOVT">Government</option>
                  <option value="PRIVATE">Private</option>
                </select>
              </div>
            </div>
            <div className="drow">
              <div className="fg"><label>Published Date</label><input type="date" value={mPub} onChange={e => setMPub(e.target.value)} /></div>
              <div className="fg"><label>Deadline</label><input type="datetime-local" value={mSub} onChange={e => setMSub(e.target.value)} /></div>
            </div>
            <div className="fg"><label>Estimated Value (৳)</label><input type="number" placeholder="0" value={mVal} onChange={e => setMVal(e.target.value)} /></div>
            <div className="fg"><label>Documents URL</label><input placeholder="https://drive.google.com/..." value={mDocs} onChange={e => setMDocs(e.target.value)} /></div>
            
            <div className="mfooter">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addTender}>Save</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="toast on">{toastMsg}</div>}
    </>
  );
}
