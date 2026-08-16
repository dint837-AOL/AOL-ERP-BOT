'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Calendar, User, Clock, Trash2 } from 'lucide-react';
import Topbar from '../components/Topbar';

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState('');

  // Modal State for New Meeting
  const [showModal, setShowModal] = useState(false);
  const [mTitle, setMTitle] = useState('');
  const [mContact, setMContact] = useState('');
  const [mScheduledAt, setMScheduledAt] = useState('');
  const [mReminderMins, setMReminderMins] = useState('30, 15');

  function showToast(m: string) {
    setToastMsg(m);
    setTimeout(() => setToastMsg(''), 2500);
  }

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/meetings');
      const data = await res.json();
      setMeetings(data);
    } catch (e) {
      showToast('Error loading meetings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, []);

  const addMeeting = async () => {
    if (!mTitle || !mScheduledAt) {
      showToast('Title and Scheduled Time are required.');
      return;
    }
    try {
      await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: mTitle, 
          contact_name: mContact, 
          scheduled_at: new Date(mScheduledAt).toISOString(),
          reminder_minutes_before: mReminderMins
        })
      });
      setShowModal(false);
      setMTitle(''); setMContact(''); setMScheduledAt(''); setMReminderMins('30, 15');
      showToast('Meeting added!');
      fetchMeetings();
    } catch (e) {
      showToast('Error saving meeting.');
    }
  };

  const deleteMeeting = async (id: string) => {
    if (!confirm('Delete this meeting?')) return;
    try {
      await fetch('/api/meetings/' + id, { method: 'DELETE' });
      showToast('Deleted.');
      fetchMeetings();
    } catch (e) {
      showToast('Error deleting.');
    }
  };

  const formatDateTime = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  return (
    <>
      <Topbar title="Meetings & Contacts">
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={15} /> Add Meeting
        </button>
      </Topbar>

      <div className="scroll">
        <div className="stats" style={{ marginBottom: '20px' }}>
          <div className="s-card"><div className="s-lbl">Scheduled Meetings</div><div className="s-val" style={{ color: 'var(--primary)' }}>{meetings.length}</div></div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Upcoming Meetings</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Contact</th>
                <th>Scheduled For</th>
                <th>Reminders (Mins Before)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-r"><td colSpan={5}>Loading...</td></tr>
              ) : meetings.length === 0 ? (
                <tr className="empty-r"><td colSpan={5}>No meetings scheduled.</td></tr>
              ) : (
                meetings.map(m => (
                  <tr key={m.id}>
                    <td>
                      <div className="av-cell">
                        <div className="av" style={{ background: 'rgba(79,126,255,.1)', color: 'var(--primary)' }}>
                          <Calendar size={14} />
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{m.title}</div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <User size={14} color="var(--muted)" />
                        {m.contact_name || '—'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{formatDateTime(m.scheduled_at)}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '.8rem', color: 'var(--orange)' }}>
                        <Clock size={14} /> {m.reminder_minutes_before}
                      </div>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" style={{ border: 'none' }} onClick={() => deleteMeeting(m.id)}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="veil on" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal">
            <div className="mhead">
              <h3>Schedule Meeting</h3>
              <button className="xbtn" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div className="fg"><label>Meeting Title</label><input placeholder="e.g. Client Pitch" value={mTitle} onChange={e => setMTitle(e.target.value)} /></div>
            <div className="fg"><label>Contact Name</label><input placeholder="e.g. John Doe" value={mContact} onChange={e => setMContact(e.target.value)} /></div>
            <div className="fg"><label>Scheduled Date & Time</label><input type="datetime-local" value={mScheduledAt} onChange={e => setMScheduledAt(e.target.value)} /></div>
            <div className="fg">
              <label>Reminders (Minutes Before)</label>
              <input placeholder="e.g. 30, 15" value={mReminderMins} onChange={e => setMReminderMins(e.target.value)} />
              <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: '4px' }}>Comma separated minutes before meeting to alert you.</div>
            </div>
            
            <div className="mfooter">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addMeeting}>Schedule</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="toast on">{toastMsg}</div>}
    </>
  );
}
