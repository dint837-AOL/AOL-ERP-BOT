'use client';
import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Check } from 'lucide-react';

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
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [loading, setLoading] = useState(true);

  // Stats
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'DONE').length;
  const due = tasks.filter(t => t.status === 'DUE').length;
  const pending = tasks.filter(t => t.status === 'PENDING').length;

  useEffect(() => {
    fetchTasks();
  }, [currentDate]);

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
    setCurrentDate(d.toISOString().split('T')[0]);
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div className="dnav">
          <button onClick={() => shiftDate(-1)}><ChevronLeft size={18} /></button>
          <div className="dchip">{currentDate === new Date().toISOString().split('T')[0] ? 'Today' : currentDate}</div>
          <button onClick={() => shiftDate(1)}><ChevronRight size={18} /></button>
        </div>
        <button className="btn btn-primary"><Plus size={16} /> Add Task</button>
      </div>

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
      ) : (
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
              </div>
              <div className={`pdot ${t.priority}`}></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
