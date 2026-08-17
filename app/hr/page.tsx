/**
 * HR & Attendance Management Module
 * 
 * Manages employee check-ins, check-outs, and leave requests.
 * Connects to the /api/hr endpoints to fetch and submit records.
 * Built with a responsive layout featuring tabs and live statistics.
 */
'use client';

import { useState, useEffect } from 'react';
import { LogIn, LogOut, Plus, ChevronLeft, ChevronRight, X } from 'lucide-react';
import Topbar from '../components/Topbar';

export default function HRPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [att, setAtt] = useState<any[]>([]);
  
  const [activeTab, setActiveTab] = useState('att');
  const [curDate, setCurDate] = useState(() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  });

  const [selectedMember, setSelectedMember] = useState('');
  
  // Leave Modal State
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveData, setLeaveData] = useState({ member_id: '', leave_type: 'SICK', start_date: '', end_date: '', reason: '' });

  const [toastMsg, setToastMsg] = useState('');

  const todayStr = (() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  })();

  function showToast(m: string) {
    setToastMsg(m);
    setTimeout(() => setToastMsg(''), 2500);
  }

  function shiftDate(delta: number) {
    const d = new Date(curDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setCurDate(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  }

  function fmtDate(d: string) {
    const dt = new Date(d + 'T00:00:00'), t = new Date(todayStr + 'T00:00:00');
    const diff = Math.round((dt.getTime() - t.getTime()) / 86400000);
    const s = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    if (diff === 0) return 'Today, ' + s;
    if (diff === 1) return 'Tomorrow, ' + s;
    if (diff === -1) return 'Yesterday, ' + s;
    return s;
  }

  const loadAll = async () => {
    try {
      const [mRes, aRes, lRes] = await Promise.all([
        fetch('/api/members').then(r => r.json()),
        fetch('/api/attendance?date=' + curDate).then(r => r.json()),
        fetch('/api/leaves').then(r => r.json())
      ]);
      setMembers(mRes);
      setAtt(aRes);
      setLeaves(lRes);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 30000);
    return () => clearInterval(interval);
  }, [curDate]);

  const markAttendance = async (type: string) => {
    if (!selectedMember) {
      showToast('Please select your name first.');
      return;
    }
    const name = members.find(m => m.id == selectedMember)?.name || 'Unknown';
    try {
      await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: selectedMember, action_type: type })
      });
      showToast(name + ' — ' + type + ' recorded!');
      loadAll();
    } catch (e) {
      showToast('Cannot reach server.');
    }
  };

  const submitLeave = async () => {
    if (!leaveData.member_id || !leaveData.start_date || !leaveData.end_date) {
      showToast('Fill all required fields.');
      return;
    }
    try {
      await fetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leaveData)
      });
      setShowLeaveModal(false);
      showToast('Leave request submitted!');
      loadAll();
    } catch (e) {
      showToast('Cannot reach server.');
    }
  };

  const reviewLeave = async (id: string, status: string) => {
    try {
      await fetch('/api/leaves/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      showToast(status === 'APPROVED' ? 'Leave approved.' : 'Leave rejected.');
      loadAll();
    } catch (e) {
      showToast('Cannot reach server.');
    }
  };

  const presentCount = new Set(att.filter(a => a.action_type === 'IN').map(a => a.member_id)).size;
  const pendingLeaves = leaves.filter(l => l.status === 'PENDING').length;

  return (
    <>
      <Topbar title="HR & Attendance">
        <div className="date-nav">
          <button onClick={() => shiftDate(-1)}><ChevronLeft size={16} /></button>
          <div className={'date-chip' + (curDate === todayStr ? ' today' : '')}>
            {fmtDate(curDate)}
          </div>
          <button onClick={() => shiftDate(1)}><ChevronRight size={16} /></button>
        </div>
        <button className="btn btn-primary" onClick={() => setShowLeaveModal(true)}>
          <Plus size={15} /> Leave Request
        </button>
      </Topbar>

      <div className="scroll">
        <div className="checkin-widget">
          <div className="cw-title">Mark Attendance</div>
          <div className="cw-row">
            <select className="cw-select" value={selectedMember} onChange={e => setSelectedMember(e.target.value)}>
              <option value="">Select your name...</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name} {m.email ? '— ' + m.email : ''}</option>
              ))}
            </select>
            <div className="cw-btns">
              <button className="btn btn-green" onClick={() => markAttendance('IN')}><LogIn size={15} /> Check In</button>
              <button className="btn btn-red" onClick={() => markAttendance('OUT')}><LogOut size={15} /> Check Out</button>
            </div>
          </div>
        </div>

        <div className="stats">
          <div className="s-card"><div className="s-lbl">Present Today</div><div className="s-val" style={{ color: 'var(--green)' }}>{presentCount}</div></div>
          <div className="s-card"><div className="s-lbl">Pending Leaves</div><div className="s-val" style={{ color: 'var(--orange)' }}>{pendingLeaves}</div></div>
          <div className="s-card"><div className="s-lbl">Total Members</div><div className="s-val" style={{ color: 'var(--primary)' }}>{members.length}</div></div>
        </div>

        <div className="tabs">
          <div className={'tab ' + (activeTab === 'att' ? 'on' : '')} onClick={() => setActiveTab('att')}>Attendance Log</div>
          <div className={'tab ' + (activeTab === 'leave' ? 'on' : '')} onClick={() => setActiveTab('leave')}>Leave Requests</div>
          <div className={'tab ' + (activeTab === 'team' ? 'on' : '')} onClick={() => setActiveTab('team')}>Team</div>
        </div>

        {activeTab === 'att' && (
          <div className="card">
            <div className="card-head">
              <h3>Check-In / Check-Out Log</h3>
              <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>{fmtDate(curDate)}</span>
            </div>
            <div className="table-scroll"><table>
              <thead><tr><th>Member</th><th>Action</th><th>Time</th></tr></thead>
              <tbody>
                {att.length === 0 ? (
                  <tr className="empty-r"><td colSpan={3}>No check-ins for this date.</td></tr>
                ) : (
                  att.map(a => (
                    <tr key={a.id}>
                      <td>
                        <div className="av-cell">
                          <div className="av" style={{ background: a.avatar_color || '#4f7eff' }}>
                            {(a.member_name || '?')[0].toUpperCase()}
                          </div>
                          <div>{a.member_name || 'Unknown'}</div>
                        </div>
                      </td>
                      <td><span className={'badge ' + a.action_type}>{a.action_type}</span></td>
                      <td style={{ color: 'var(--muted)' }}>
                        {new Date(a.timestamp).toLocaleTimeString('en-BD', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table></div>
          </div>
        )}

        {activeTab === 'leave' && (
          <div className="card">
            <div className="card-head">
              <h3>Leave Requests</h3>
              <button className="btn btn-primary btn-sm" onClick={() => setShowLeaveModal(true)}><Plus size={13} /> New</button>
            </div>
            <div className="table-scroll"><table>
              <thead><tr><th>Employee</th><th>Type</th><th>Period</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {leaves.length === 0 ? (
                  <tr className="empty-r"><td colSpan={5}>No leave requests yet.</td></tr>
                ) : (
                  leaves.map(l => (
                    <tr key={l.id}>
                      <td>
                        <div className="av-cell">
                          <div className="av" style={{ background: l.avatar_color || '#4f7eff' }}>
                            {(l.member_name || '?')[0]}
                          </div>
                          {l.member_name || '?'}
                        </div>
                      </td>
                      <td><span className={'badge ' + l.leave_type}>{l.leave_type}</span></td>
                      <td style={{ color: 'var(--muted)', fontSize: '.76rem' }}>{l.start_date} to {l.end_date}</td>
                      <td><span className={'badge ' + l.status}>{l.status}</span></td>
                      <td>
                        {l.status === 'PENDING' ? (
                          <>
                            <button className="btn btn-green btn-sm" style={{ marginRight: '4px' }} onClick={() => reviewLeave(l.id, 'APPROVED')}>Approve</button>
                            <button className="btn btn-red btn-sm" onClick={() => reviewLeave(l.id, 'REJECTED')}>Reject</button>
                          </>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: '.76rem' }}>Reviewed</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table></div>
          </div>
        )}

        {activeTab === 'team' && (
          <div className="card">
            <div className="card-head"><h3>Team Members</h3></div>
            <div className="table-scroll"><table>
              <thead><tr><th>Name</th><th>Role</th><th>Added</th></tr></thead>
              <tbody>
                {members.length === 0 ? (
                  <tr className="empty-r"><td colSpan={3}>No members yet. Add from Team Members in dashboard.</td></tr>
                ) : (
                  members.map(m => (
                    <tr key={m.id}>
                      <td>
                        <div className="av-cell">
                          <div className="av" style={{ background: m.avatar_color }}>{m.name[0].toUpperCase()}</div>
                          <div>
                            <div>{m.name}</div>
                            <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{m.email || ''}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ color: 'var(--muted)' }}>{m.role}</td>
                      <td style={{ color: 'var(--muted)', fontSize: '.76rem' }}>
                        {new Date(m.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table></div>
          </div>
        )}
      </div>

      {showLeaveModal && (
        <div className="veil on" onClick={(e) => { if (e.target === e.currentTarget) setShowLeaveModal(false); }}>
          <div className="modal">
            <div className="mhead">
              <h3>Leave Request</h3>
              <button className="xbtn" onClick={() => setShowLeaveModal(false)}><X size={16} /></button>
            </div>
            <div className="fg">
              <label>Employee</label>
              <select value={leaveData.member_id} onChange={e => setLeaveData({ ...leaveData, member_id: e.target.value })}>
                <option value="">Select...</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                ))}
              </select>
            </div>
            <div className="fg">
              <label>Leave Type</label>
              <select value={leaveData.leave_type} onChange={e => setLeaveData({ ...leaveData, leave_type: e.target.value })}>
                <option value="SICK">Sick Leave</option>
                <option value="CASUAL">Casual Leave</option>
                <option value="ANNUAL">Annual Leave</option>
              </select>
            </div>
            <div className="drow">
              <div className="fg"><label>From</label><input type="date" value={leaveData.start_date} onChange={e => setLeaveData({ ...leaveData, start_date: e.target.value })} /></div>
              <div className="fg"><label>To</label><input type="date" value={leaveData.end_date} onChange={e => setLeaveData({ ...leaveData, end_date: e.target.value })} /></div>
            </div>
            <div className="fg"><label>Reason</label><textarea placeholder="Optional..." value={leaveData.reason} onChange={e => setLeaveData({ ...leaveData, reason: e.target.value })}></textarea></div>
            <div className="mfooter">
              <button className="btn btn-ghost" onClick={() => setShowLeaveModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitLeave}>Submit</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="toast on">{toastMsg}</div>}
    </>
  );
}
