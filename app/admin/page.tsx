'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Pencil, Trash2, Wifi, Radio, Globe, Shield, Save, Check } from 'lucide-react';
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

  const [wifiSettings, setWifiSettings] = useState({
    office_wifi_ip: '',
    office_wifi_name: 'AlliedOne Office Wi-Fi',
    wifi_auto_attendance_enabled: true,
    auto_checkout_timeout_minutes: 10,
    detected_client_ip: '',
    is_matching_office_wifi: false
  });
  const [savingWifi, setSavingWifi] = useState(false);

  const loadWifiSettings = async () => {
    try {
      const res = await fetch('/api/settings/wifi');
      if (res.ok) {
        const data = await res.json();
        setWifiSettings(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadMembers();
    loadWifiSettings();
  }, []);

  const saveWifiSettings = async () => {
    setSavingWifi(true);
    try {
      const token = localStorage.getItem('erp_token');
      const res = await fetch('/api/settings/wifi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(wifiSettings)
      });
      if (res.ok) {
        showToast('Wi-Fi attendance settings saved successfully!');
        loadWifiSettings();
      } else {
        showToast('Failed to save Wi-Fi settings.');
      }
    } catch {
      showToast('Cannot reach server.');
    } finally {
      setSavingWifi(false);
    }
  };

  const useCurrentIpAsOfficeWifi = () => {
    if (!wifiSettings.detected_client_ip) return;
    const currentIps = wifiSettings.office_wifi_ip ? wifiSettings.office_wifi_ip.split(',').map(s => s.trim()) : [];
    if (!currentIps.includes(wifiSettings.detected_client_ip)) {
      currentIps.push(wifiSettings.detected_client_ip);
    }
    setWifiSettings({ ...wifiSettings, office_wifi_ip: currentIps.join(', ') });
    showToast(`Added current IP (${wifiSettings.detected_client_ip}) to Office Wi-Fi.`);
  };

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

        {/* Office Wi-Fi & Automated Attendance Settings */}
        <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Wifi size={17} style={{ color: 'var(--primary)' }} />
              <h3>Office Wi-Fi & Automated Attendance</h3>
            </div>
            <button className="btn btn-primary btn-sm" onClick={saveWifiSettings} disabled={savingWifi}>
              <Save size={13} /> {savingWifi ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          <div style={{ padding: '20px' }}>
            {/* Status & Current Detected IP Banner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              padding: '14px 18px',
              background: 'rgba(79, 126, 255, 0.08)',
              border: '1px solid rgba(79, 126, 255, 0.2)',
              borderRadius: '10px',
              marginBottom: '20px'
            }}>
              <div>
                <div style={{ fontSize: '.76rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>
                  Your Current Detected Network IP
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{wifiSettings.detected_client_ip || 'Detecting...'}</span>
                  {wifiSettings.is_matching_office_wifi ? (
                    <span style={{ fontSize: '.7rem', background: 'var(--gs)', color: 'var(--green)', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                      ✓ Matches Office Wi-Fi
                    </span>
                  ) : (
                    <span style={{ fontSize: '.7rem', background: 'rgba(255,255,255,.06)', color: 'var(--muted)', padding: '2px 8px', borderRadius: '6px' }}>
                      Not in whitelist
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={useCurrentIpAsOfficeWifi}
                style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
              >
                <Radio size={14} /> Add Current IP to Office Whitelist
              </button>
            </div>

            {/* Config Fields Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div className="fg">
                <label>Office Wi-Fi Public IP / Subnet Whitelist</label>
                <input
                  type="text"
                  placeholder="e.g. 103.145.120.45, 127.0.0.1, ::1"
                  value={wifiSettings.office_wifi_ip}
                  onChange={e => setWifiSettings({ ...wifiSettings, office_wifi_ip: e.target.value })}
                />
                <small style={{ color: 'var(--muted)', fontSize: '.72rem', marginTop: '4px', display: 'block' }}>
                  Comma-separated list of office router public IPs or local subnets.
                </small>
              </div>

              <div className="fg">
                <label>Wi-Fi Network Display Name</label>
                <input
                  type="text"
                  placeholder="e.g. AlliedOne Office Wi-Fi"
                  value={wifiSettings.office_wifi_name}
                  onChange={e => setWifiSettings({ ...wifiSettings, office_wifi_name: e.target.value })}
                />
                <small style={{ color: 'var(--muted)', fontSize: '.72rem', marginTop: '4px', display: 'block' }}>
                  Label shown to employees on the HR attendance screen.
                </small>
              </div>

              <div className="fg">
                <label>Auto Check-Out Timeout (Minutes)</label>
                <input
                  type="number"
                  min={2}
                  max={120}
                  value={wifiSettings.auto_checkout_timeout_minutes}
                  onChange={e => setWifiSettings({ ...wifiSettings, auto_checkout_timeout_minutes: parseInt(e.target.value) || 10 })}
                />
                <small style={{ color: 'var(--muted)', fontSize: '.72rem', marginTop: '4px', display: 'block' }}>
                  Time without Wi-Fi connection before system logs automatic check-out (default: 10 mins).
                </small>
              </div>

              <div className="fg" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <label style={{ marginBottom: '8px' }}>Enable Automated Wi-Fi Attendance</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '.85rem' }}>
                  <input
                    type="checkbox"
                    checked={wifiSettings.wifi_auto_attendance_enabled}
                    onChange={e => setWifiSettings({ ...wifiSettings, wifi_auto_attendance_enabled: e.target.checked })}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                  />
                  <span>Active (Auto Check-In on connection & Auto Check-Out on leave)</span>
                </label>
              </div>
            </div>

            {/* Router Hardware Webhook Integration info */}
            <div style={{
              marginTop: '20px',
              padding: '14px 18px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--text)', fontWeight: 600, fontSize: '.84rem' }}>
                <Globe size={15} style={{ color: 'var(--primary)' }} />
                <span>Optional: Router Hardware Webhook Integration (MikroTik / UniFi / OpenWrt)</span>
              </div>
              <p style={{ fontSize: '.76rem', color: 'var(--muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                You can configure your office router or a local network script to trigger instant check-in/out even if employees close their browser. Send a POST request on device connect/disconnect:
              </p>
              <code style={{ display: 'block', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', fontSize: '.74rem', color: 'var(--primary)', overflowX: 'auto' }}>
                POST /api/attendance/wifi-webhook -d &#123; &quot;email&quot;: &quot;employee@alliedone.com&quot;, &quot;event&quot;: &quot;CONNECT&quot; &#125;
              </code>
            </div>
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
