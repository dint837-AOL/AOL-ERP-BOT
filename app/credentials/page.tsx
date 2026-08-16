'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Globe, Key, Clock, Trash2, Mail, Link as LinkIcon, Edit3 } from 'lucide-react';
import Topbar from '../components/Topbar';

export default function CredentialsPage() {
  const [creds, setCreds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState('');

  // Modal State for New Credential
  const [showModal, setShowModal] = useState(false);
  const [mName, setMName] = useState('');
  const [mType, setMType] = useState('OTHER');
  const [mUrl, setMUrl] = useState('');
  const [mUsername, setMUsername] = useState('');
  const [mExpiry, setMExpiry] = useState('');
  const [mLastChanged, setMLastChanged] = useState('');
  const [mReminderDays, setMReminderDays] = useState('5, 2, 1');

  function showToast(m: string) {
    setToastMsg(m);
    setTimeout(() => setToastMsg(''), 2500);
  }

  const fetchCreds = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/credentials');
      const data = await res.json();
      setCreds(data);
    } catch (e) {
      showToast('Error loading credentials.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCreds();
  }, []);

  const addCred = async () => {
    if (!mName) {
      showToast('Name is required.');
      return;
    }
    try {
      await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: mName, cred_type: mType, url: mUrl, 
          username: mUsername, expiry_date: mExpiry, 
          last_changed_date: mLastChanged, reminder_days_before: mReminderDays 
        })
      });
      setShowModal(false);
      setMName(''); setMUrl(''); setMUsername(''); setMExpiry(''); setMLastChanged(''); setMReminderDays('5, 2, 1');
      showToast('Credential added!');
      fetchCreds();
    } catch (e) {
      showToast('Error saving credential.');
    }
  };

  const deleteCred = async (id: string) => {
    if (!confirm('Delete this credential?')) return;
    try {
      await fetch('/api/credentials/' + id, { method: 'DELETE' });
      showToast('Deleted.');
      fetchCreds();
    } catch (e) {
      showToast('Error deleting.');
    }
  };

  return (
    <>
      <Topbar title="Credentials & Keys">
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={15} /> Add Credential
        </button>
      </Topbar>

      <div className="scroll">
        <div className="stats" style={{ marginBottom: '20px' }}>
          <div className="s-card"><div className="s-lbl">Total Credentials</div><div className="s-val" style={{ color: 'var(--primary)' }}>{creds.length}</div></div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Credential Vault</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name / Type</th>
                <th>URL / Username</th>
                <th>Important Dates</th>
                <th>Reminders (Days Before)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-r"><td colSpan={5}>Loading...</td></tr>
              ) : creds.length === 0 ? (
                <tr className="empty-r"><td colSpan={5}>No credentials saved yet.</td></tr>
              ) : (
                creds.map(c => {
                  const Icon = c.cred_type === 'EMAIL' ? Mail : c.cred_type === 'API_KEY' ? Key : c.cred_type === 'SOCIAL' ? Globe : LinkIcon;
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="av-cell">
                          <div className="av" style={{ background: 'rgba(79,126,255,.1)', color: 'var(--primary)' }}>
                            <Icon size={14} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{c.name}</div>
                            <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: '2px' }}>{c.cred_type}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '.8rem' }}>{c.url || '—'}</div>
                        <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>User: {c.username || '—'}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Expiry: {c.expiry_date || '—'}</div>
                        <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Last Chg: {c.last_changed_date || '—'}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '.8rem', color: 'var(--green)' }}>
                          <Clock size={14} /> {c.reminder_days_before}
                        </div>
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" style={{ border: 'none' }} onClick={() => deleteCred(c.id)}>
                          <Trash2 size={15} />
                        </button>
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
              <h3>Add Credential</h3>
              <button className="xbtn" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div className="fg"><label>Name</label><input placeholder="e.g. Gmail Password" value={mName} onChange={e => setMName(e.target.value)} /></div>
            <div className="drow">
              <div className="fg">
                <label>Type</label>
                <select value={mType} onChange={e => setMType(e.target.value)}>
                  <option value="EMAIL">Email</option>
                  <option value="SOCIAL">Social Media</option>
                  <option value="API_KEY">API Key</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="fg"><label>Username / Email</label><input placeholder="user@domain.com" value={mUsername} onChange={e => setMUsername(e.target.value)} /></div>
            </div>
            <div className="fg"><label>URL</label><input placeholder="https://..." value={mUrl} onChange={e => setMUrl(e.target.value)} /></div>
            <div className="drow">
              <div className="fg"><label>Expiry Date</label><input type="date" value={mExpiry} onChange={e => setMExpiry(e.target.value)} /></div>
              <div className="fg"><label>Last Changed</label><input type="date" value={mLastChanged} onChange={e => setMLastChanged(e.target.value)} /></div>
            </div>
            <div className="fg">
              <label>Reminders (Days Before)</label>
              <input placeholder="e.g. 5, 2, 1" value={mReminderDays} onChange={e => setMReminderDays(e.target.value)} />
              <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: '4px' }}>Comma separated days before expiry to alert you.</div>
            </div>
            
            <div className="mfooter">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addCred}>Save Credential</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="toast on">{toastMsg}</div>}
    </>
  );
}
