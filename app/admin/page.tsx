'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Pencil, Trash2 } from 'lucide-react';
import Topbar from '../components/Topbar';

export default function AdminPage() {
  const [members, setMembers] = useState<any[]>([]);
  
  // Modal States
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [memberData, setMemberData] = useState({ name: '', email: '', role: 'Employee' });

  const [toastMsg, setToastMsg] = useState('');

  function showToast(m: string) {
    setToastMsg(m);
    setTimeout(() => setToastMsg(''), 2500);
  }

  const loadMembers = async () => {
    try {
      const res = await fetch('/api/members');
      setMembers(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadMembers();
  }, []);

  const openAddModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setMemberData({ name: '', email: '', role: 'Employee' });
    setShowMemberModal(true);
  };

  const openEditModal = (m: any) => {
    setIsEditing(true);
    setEditingId(m.id);
    setMemberData({ name: m.name, email: m.email || '', role: m.role });
    setShowMemberModal(true);
  };

  const submitMember = async () => {
    if (!memberData.name || !memberData.role) {
      showToast('Name and Role are required.');
      return;
    }
    try {
      if (isEditing && editingId) {
        await fetch(`/api/members/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(memberData)
        });
        showToast('Member updated!');
      } else {
        await fetch('/api/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(memberData)
        });
        showToast('Member added!');
      }
      setShowMemberModal(false);
      loadMembers();
    } catch (e) {
      showToast('Cannot reach server.');
    }
  };

  const deleteMember = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name}? Tasks assigned to them will be moved to Unassigned.`)) return;
    try {
      await fetch(`/api/members/${id}`, { method: 'DELETE' });
      showToast('Member removed.');
      loadMembers();
    } catch (e) {
      showToast('Failed to delete member.');
    }
  };

  return (
    <>
      <Topbar title="Admin Section" />

      <div className="scroll">
        <div className="card" style={{ marginTop: '20px' }}>
          <div className="card-head">
            <h3>Team Members</h3>
            <button className="btn btn-primary btn-sm" onClick={openAddModal}>
              <Plus size={13} /> New Member
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Added</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr className="empty-r"><td colSpan={4}>No members yet.</td></tr>
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
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEditModal(m)}><Pencil size={14} /></button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', borderColor: 'var(--rs)' }} onClick={() => deleteMember(m.id, m.name)}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showMemberModal && (
        <div className="veil on" onClick={(e) => { if (e.target === e.currentTarget) setShowMemberModal(false); }}>
          <div className="modal">
            <div className="mhead">
              <h3>{isEditing ? 'Edit Team Member' : 'New Team Member'}</h3>
              <button className="xbtn" onClick={() => setShowMemberModal(false)}><X size={16} /></button>
            </div>
            <div className="fg">
              <label>Name</label>
              <input type="text" placeholder="John Doe" value={memberData.name} onChange={e => setMemberData({ ...memberData, name: e.target.value })} />
            </div>
            <div className="fg">
              <label>Role</label>
              <input type="text" placeholder="Employee, Manager, etc." value={memberData.role} onChange={e => setMemberData({ ...memberData, role: e.target.value })} />
            </div>
            <div className="fg">
              <label>Email</label>
              <input type="email" placeholder="john@example.com" value={memberData.email} onChange={e => setMemberData({ ...memberData, email: e.target.value })} />
            </div>
            <div className="mfooter">
              <button className="btn btn-ghost" onClick={() => setShowMemberModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitMember}>{isEditing ? 'Save Changes' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="toast on">{toastMsg}</div>}
    </>
  );
}
