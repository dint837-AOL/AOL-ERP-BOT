'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Pencil, Trash2, Wifi, Radio, Globe, Shield, Save, Check, Laptop } from 'lucide-react';
import Topbar from '../components/Topbar';
import { useAuth } from '../context/AuthContext';
import Cookies from 'js-cookie';

export default function AdminPage() {
  const { token: ctxToken } = useAuth();
  const getAuthToken = useCallback(() => {
    return ctxToken || Cookies.get('token') || (typeof window !== 'undefined' ? (localStorage.getItem('erp_token') || localStorage.getItem('token')) : '') || '';
  }, [ctxToken]);

  const [members, setMembers] = useState<any[]>([]);
  
  // Modal States
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [memberData, setMemberData] = useState({ name: '', email: '', role: 'Employee', telegram_chat_id: '' });

  const [toastMsg, setToastMsg] = useState('');

  function showToast(m: string) {
    setToastMsg(m);
    setTimeout(() => setToastMsg(''), 2500);
  }

  const loadMembers = async () => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/members', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
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
  const [detectingIp, setDetectingIp] = useState(false);
  const [activeDevices, setActiveDevices] = useState<any[]>([]);

  const detectIpDirectly = async (): Promise<string | null> => {
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      if (res.ok) {
        const data = await res.json();
        if (data.ip) return data.ip;
      }
    } catch {
      try {
        const res2 = await fetch('https://icanhazip.com');
        if (res2.ok) {
          const text = (await res2.text()).trim();
          if (text) return text;
        }
      } catch {}
    }
    return null;
  };

  const loadWifiSettings = async () => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/settings/wifi', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      let serverIp = '';
      if (res.ok) {
        const data = await res.json();
        serverIp = data.detected_client_ip;
        setWifiSettings(prev => ({
          ...prev,
          ...data,
          detected_client_ip: serverIp || prev.detected_client_ip
        }));
      }
      
      // If server IP was localhost or empty, also check public IP
      if (!serverIp || serverIp === '127.0.0.1' || serverIp === '::1') {
        const directIp = await detectIpDirectly();
        if (directIp) {
          setWifiSettings(prev => ({
            ...prev,
            detected_client_ip: directIp
          }));
        }
      }
    } catch (e) {
      console.error(e);
      const directIp = await detectIpDirectly();
      if (directIp) {
        setWifiSettings(prev => ({ ...prev, detected_client_ip: directIp }));
      }
    }
  };

  const loadActiveDevices = async () => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/attendance/active-devices', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        setActiveDevices(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadMembers();
    loadWifiSettings();
    loadActiveDevices();
    const iv = setInterval(loadActiveDevices, 20000);
    return () => clearInterval(iv);
  }, []);

  const saveWifiSettings = async () => {
    setSavingWifi(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/settings/wifi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          ...wifiSettings,
          token
        })
      });
      if (res.ok) {
        showToast('Wi-Fi attendance settings saved successfully!');
        loadWifiSettings();
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'Failed to save Wi-Fi settings.');
      }
    } catch {
      showToast('Cannot reach server.');
    } finally {
      setSavingWifi(false);
    }
  };

  const useCurrentIpAsOfficeWifi = async () => {
    setDetectingIp(true);
    let ip = wifiSettings.detected_client_ip;
    if (!ip || ip === 'Detecting...') {
      ip = (await detectIpDirectly()) || '';
    }
    setDetectingIp(false);

    if (!ip) {
      showToast('Could not auto-detect IP. Please type your office IP manually in the box.');
      return;
    }

    const currentIps = wifiSettings.office_wifi_ip
      ? wifiSettings.office_wifi_ip.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    if (!currentIps.includes(ip)) {
      currentIps.push(ip);
    }

    setWifiSettings(prev => ({
      ...prev,
      detected_client_ip: ip,
      office_wifi_ip: currentIps.join(', ')
    }));
    showToast(`Added IP (${ip})! Click "Save Settings" to apply.`);
  };

  const openAddModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setMemberData({ name: '', email: '', role: 'Employee', telegram_chat_id: '' });
    setShowMemberModal(true);
  };

  const openEditModal = (m: any) => {
    setIsEditing(true);
    setEditingId(m.id);
    setMemberData({ name: m.name, email: m.email || '', role: m.role, telegram_chat_id: m.telegram_chat_id || '' });
    setShowMemberModal(true);
  };

  const submitMember = async () => {
    if (!memberData.name || !memberData.role) {
      showToast('Name and Role are required.');
      return;
    }
    try {
      const token = getAuthToken();
      const authHeaders = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
      if (isEditing && editingId) {
        await fetch(`/api/members/${editingId}`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify(memberData)
        });
        showToast('Member updated!');
      } else {
        await fetch('/api/members', {
          method: 'POST',
          headers: authHeaders,
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
      const token = getAuthToken();
      await fetch(`/api/members/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      showToast('Member removed.');
      loadMembers();
    } catch (e) {
      showToast('Failed to delete member.');
    }
  };

  const testTelegram = async () => {
    if (!memberData.telegram_chat_id) {
      showToast('Please enter a Chat ID first.');
      return;
    }
    showToast('Sending test message...');
    try {
      const token = getAuthToken();
      const res = await fetch('/api/test-telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ chat_id: memberData.telegram_chat_id })
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ Test message sent successfully!');
      } else {
        showToast('❌ Failed: ' + (data.error || 'Unknown error'));
        console.error('Telegram Error:', data.error);
      }
    } catch (e) {
      showToast('Failed to reach server.');
    }
  };

  const testEnv = async () => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/debug-env', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      const data = await res.json();
      const telegramKeys = data.keys.filter((k: string) => k.toUpperCase().includes('TELEGRAM'));
      if (data.hasToken) {
        showToast('✅ TELEGRAM_BOT_TOKEN is present on the server!');
      } else {
        if (telegramKeys.length > 0) {
          showToast(`❌ Found weird token keys: ${telegramKeys.join(', ')}`);
        } else {
          showToast('❌ Server CANNOT see TELEGRAM_BOT_TOKEN completely.');
        }
      }
      console.log('Server Env Keys:', data.keys);
    } catch (e) {
      showToast('Failed to check env.');
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
                disabled={detectingIp}
                style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
              >
                <Radio size={14} /> {detectingIp ? 'Detecting IP...' : 'Add Current IP to Office Whitelist'}
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

            {/* Active Laptop Devices Table */}
            <div style={{ marginTop: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Laptop size={16} style={{ color: 'var(--primary)' }} />
                  <h4 style={{ margin: 0, fontSize: '.9rem', fontWeight: 600 }}>Active Laptop Presence (Zero-Browser Agents)</h4>
                </div>
                <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>
                  {activeDevices.length} device{activeDevices.length === 1 ? '' : 's'} online
                </span>
              </div>

              <div className="table-scroll" style={{ border: '1px solid var(--border)', borderRadius: '8px' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Device / Hostname</th>
                      <th>OS / Type</th>
                      <th>IP Address</th>
                      <th>Last Heartbeat</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDevices.length === 0 ? (
                      <tr className="empty-r">
                        <td colSpan={6} style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: '.8rem' }}>
                          No laptop agents currently active. Employees can download the 1-click installer from the HR Attendance page.
                        </td>
                      </tr>
                    ) : (
                      activeDevices.map(d => (
                        <tr key={d.member_id}>
                          <td>
                            <div className="av-cell">
                              <div className="av" style={{ background: d.avatar_color || '#4f7eff', width: '24px', height: '24px', fontSize: '.7rem' }}>
                                {d.member_name ? d.member_name[0].toUpperCase() : 'E'}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600 }}>{d.member_name}</div>
                                <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{d.email || ''}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ fontSize: '.8rem', fontFamily: 'monospace' }}>{d.hostname || 'Laptop'}</td>
                          <td style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{d.os_name || d.device_type || 'Windows'}</td>
                          <td style={{ fontSize: '.78rem', fontFamily: 'monospace', color: 'var(--muted)' }}>{d.ip || '-'}</td>
                          <td style={{ fontSize: '.76rem', color: 'var(--muted)' }}>
                            {new Date(d.last_seen).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Dhaka' })}
                          </td>
                          <td>
                            <span style={{ fontSize: '.7rem', background: 'var(--gs)', color: 'var(--green)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                              🟢 Online
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
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
            <div className="fg">
              <label>Telegram Chat ID</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input style={{ flex: 1 }} type="text" placeholder="123456789" value={memberData.telegram_chat_id} onChange={e => setMemberData({ ...memberData, telegram_chat_id: e.target.value })} />
                <button type="button" className="btn btn-primary" onClick={testTelegram} style={{ padding: '0 12px', whiteSpace: 'nowrap' }}>Test</button>
                <button type="button" className="btn btn-ghost" onClick={testEnv} style={{ padding: '0 12px', whiteSpace: 'nowrap' }}>Debug Env</button>
              </div>
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
