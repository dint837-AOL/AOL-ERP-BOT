/**
 * Dashboard / Daily Tasks Module
 * 
 * Displays the daily to-do list, date navigation, and overall progress.
 * Fetches data from the /api/tasks REST endpoints.
 * Integrates dynamic priority indicators and progress calculations.
 */
'use client';
import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Check, X } from 'lucide-react';
import Topbar from '../components/Topbar';

type Task = {
  id: number;
  title: string;
  description: string;
  priority: 'GREEN' | 'ORANGE' | 'RED';
  status: 'PENDING' | 'DONE' | 'DUE';
  assigned_to: number | null;
  assignee_name?: string;
  assignee_color?: string;
  task_date: string;
};

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]!);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [loading, setLoading] = useState(true);

  // Members for Task Assignment
  const [members, setMembers] = useState<any[]>([]);

  // Task Modal State
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskData, setTaskData] = useState({ title: '', description: '', priority: 'GREEN', assigned_to: '' });

  const [toastMsg, setToastMsg] = useState('');

  function showToast(m: string) {
    setToastMsg(m);
    setTimeout(() => setToastMsg(''), 2500);
  }

  // Stats
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'DONE').length;
  const due = tasks.filter(t => t.status === 'DUE').length;
  const pending = tasks.filter(t => t.status === 'PENDING').length;

  useEffect(() => {
    fetchTasks();
    fetchMembers();
  }, [currentDate]);

  const fetchMembers = async () => {
    try {
      const res = await fetch('/api/members');
      setMembers(await res.json());
    } catch (e) {
      console.error('Failed to fetch members', e);
    }
  };

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks?date=${currentDate}`);
      const data = await res.json();
      setTasks(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const shiftDate = (days: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + days);
    setCurrentDate(d.toISOString().split('T')[0]!);
  };

  const toggleStatus = async (task: Task) => {
    const newStatus = task.status === 'DONE' ? 'PENDING' : 'DONE';
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    fetchTasks();
  };

  const submitTask = async () => {
    if (!taskData.title) {
      showToast('Task title is required.');
      return;
    }
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...taskData, 
          task_date: currentDate,
          assigned_to: taskData.assigned_to ? parseInt(taskData.assigned_to) : null
        })
      });
      setShowTaskModal(false);
      setTaskData({ title: '', description: '', priority: 'GREEN', assigned_to: '' });
      showToast('Task added!');
      fetchTasks();
    } catch (e) {
      showToast('Failed to add task.');
    }
  };

  return (
    <>
      <Topbar title="Daily Tasks">
        <div className="dnav" style={{ marginRight: 'auto', marginLeft: '20px' }}>
          <button onClick={() => shiftDate(-1)}><ChevronLeft size={18} /></button>
          <div className="dchip">{currentDate === new Date().toISOString().split('T')[0] ? 'Today' : currentDate}</div>
          <button onClick={() => shiftDate(1)}><ChevronRight size={18} /></button>
        </div>
        <button className="btn btn-primary" onClick={() => setShowTaskModal(true)}><Plus size={16} /> Add Task</button>
      </Topbar>

      <div className="scroll">
        <div className="tabs">
          <div className={`tab ${view === 'list' ? 'on' : ''}`} onClick={() => setView('list')}>List View</div>
          <div className={`tab ${view === 'board' ? 'on' : ''}`} onClick={() => setView('board')}>Board View</div>
        </div>

        <div className="stats" style={{ marginTop: '20px' }}>
          <div className="sc"><div className="sc-lbl">Total</div><div className="sc-val" style={{ color: 'var(--text)' }}>{total}</div></div>
          <div className="sc"><div className="sc-lbl">Done</div><div className="sc-val" style={{ color: 'var(--green)' }}>{done}</div></div>
          <div className="sc"><div className="sc-lbl">Overdue</div><div className="sc-val" style={{ color: 'var(--red)' }}>{due}</div></div>
          <div className="sc"><div className="sc-lbl">Pending</div><div className="sc-val" style={{ color: 'var(--orange)' }}>{pending}</div></div>
        </div>

        {loading ? (
          <div style={{ color: 'var(--muted)', textAlign: 'center', marginTop: '40px' }}>Loading tasks...</div>
        ) : view === 'list' ? (
          <div className="tlist" style={{ marginTop: '20px' }}>
            {tasks.length === 0 && <div style={{ color: 'var(--muted)', textAlign: 'center' }}>No tasks for this day.</div>}
            {tasks.map(t => (
              <div key={t.id} className={`tc ${t.status === 'DONE' ? 'done' : ''}`}>
                <div className={`chk ${t.status === 'DONE' ? 'done' : ''}`} onClick={() => toggleStatus(t)}>
                  {t.status === 'DONE' && <Check size={14} />}
                </div>
                <div className="tbody">
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }} className="ttitle">{t.title}</div>
                  {t.description && <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '4px' }}>{t.description}</div>}
                  {t.assignee_name && <div style={{ fontSize: '0.75rem', color: 'var(--primary)', marginTop: '4px' }}>Assignee: {t.assignee_name}</div>}
                </div>
                <div className={`pdot ${t.priority}`}></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="board-container" style={{ marginTop: '20px' }}>
            {[{ id: null, name: 'Unassigned', avatar_color: '#4f7eff' }, ...members].map(member => {
              const memberTasks = tasks.filter(t => t.assigned_to === member.id);
              return (
                <div key={member.id || 'unassigned'} className="board-col">
                  <div className="bc-head">
                    <div className="av-cell">
                      <div className="av" style={{ background: member.avatar_color, width: '24px', height: '24px', fontSize: '0.7rem' }}>
                        {member.name[0].toUpperCase()}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{member.name}</div>
                    </div>
                    <div className="bc-count">{memberTasks.length}</div>
                  </div>
                  <div className="bc-body">
                    {memberTasks.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '0.75rem', textAlign: 'center', marginTop: '20px' }}>No tasks</div>}
                    {memberTasks.map(t => (
                      <div key={t.id} className={`tc board-card ${t.status === 'DONE' ? 'done' : ''}`} style={{ marginBottom: '10px' }}>
                        <div className="tbody">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }} className="ttitle">{t.title}</div>
                            <div className={`chk ${t.status === 'DONE' ? 'done' : ''}`} onClick={() => toggleStatus(t)} style={{ width: '16px', height: '16px', marginTop: '2px' }}>
                              {t.status === 'DONE' && <Check size={10} />}
                            </div>
                          </div>
                          {t.description && <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '4px' }}>{t.description}</div>}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                            <span style={{ fontSize: '0.7rem', color: t.status === 'DONE' ? 'var(--green)' : 'var(--orange)', fontWeight: 600 }}>{t.status}</span>
                            <div className={`pdot ${t.priority}`}></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showTaskModal && (
        <div className="veil on" onClick={(e) => { if (e.target === e.currentTarget) setShowTaskModal(false); }}>
          <div className="modal">
            <div className="mhead">
              <h3>New Task</h3>
              <button className="xbtn" onClick={() => setShowTaskModal(false)}><X size={16} /></button>
            </div>
            <div className="fg">
              <label>Title</label>
              <input type="text" placeholder="Task title..." value={taskData.title} onChange={e => setTaskData({ ...taskData, title: e.target.value })} />
            </div>
            <div className="fg">
              <label>Description</label>
              <textarea placeholder="Task details..." value={taskData.description} onChange={e => setTaskData({ ...taskData, description: e.target.value })}></textarea>
            </div>
            <div className="drow">
              <div className="fg">
                <label>Priority</label>
                <select value={taskData.priority} onChange={e => setTaskData({ ...taskData, priority: e.target.value })}>
                  <option value="GREEN">Low (Green)</option>
                  <option value="ORANGE">Medium (Orange)</option>
                  <option value="RED">High (Red)</option>
                </select>
              </div>
              <div className="fg">
                <label>Assign To</label>
                <select value={taskData.assigned_to} onChange={e => setTaskData({ ...taskData, assigned_to: e.target.value })}>
                  <option value="">Unassigned</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mfooter">
              <button className="btn btn-ghost" onClick={() => setShowTaskModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitTask}>Save Task</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="toast on">{toastMsg}</div>}
    </>
  );
}
