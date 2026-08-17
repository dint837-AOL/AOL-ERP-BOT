/**
 * Accounts & Expenses Module
 * 
 * Handles logging and displaying financial expenses.
 * Includes a summary of total expenses for the selected month.
 * Interfaces with the /api/accounts REST endpoints.
 */
'use client';

import { useState, useEffect } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import Topbar from '../components/Topbar';

export default function AccountsPage() {
  const [cats, setCats] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  
  const [curMonth, setCurMonth] = useState(() => {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  });

  const [summary, setSummary] = useState<any[]>([]);
  const [toastMsg, setToastMsg] = useState('');

  // Quick Add State
  const [qAmt, setQAmt] = useState('');
  const [qCat, setQCat] = useState('');
  const [qDesc, setQDesc] = useState('');
  const [qDate, setQDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [mAmt, setMAmt] = useState('');
  const [mCat, setMCat] = useState('');
  const [mDesc, setMDesc] = useState('');
  const [mDate, setMDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [mBy, setMBy] = useState('');

  const fmt = (n: number) => Math.round(n).toLocaleString('en-BD');
  const hexA = (c: string) => c ? (c + '22') : 'rgba(79,126,255,.12)';

  function showToast(m: string) {
    setToastMsg(m);
    setTimeout(() => setToastMsg(''), 2500);
  }

  const loadAll = async () => {
    try {
      const [cRes, mRes, eRes, sRes] = await Promise.all([
        fetch('/api/expense-categories').then(r => r.json()),
        fetch('/api/members').then(r => r.json()),
        fetch('/api/expenses?month=' + curMonth).then(r => r.json()),
        fetch('/api/expenses/summary?month=' + curMonth).then(r => r.json())
      ]);
      setCats(cRes);
      setMembers(mRes);
      setExpenses(eRes);
      setSummary(sRes);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 60000);
    return () => clearInterval(interval);
  }, [curMonth]);

  const quickAdd = async () => {
    const amt = parseFloat(qAmt);
    if (!amt || !qCat) {
      showToast('Amount and category are required.');
      return;
    }
    try {
      await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: qCat, amount: amt, description: qDesc, expense_date: qDate })
      });
      setQAmt(''); setQDesc('');
      showToast('Expense saved!');
      loadAll();
    } catch (e) {
      showToast('Error saving expense.');
    }
  };

  const addExpense = async () => {
    const amt = parseFloat(mAmt);
    if (!amt || !mCat) {
      showToast('Amount and category are required.');
      return;
    }
    try {
      await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: mCat, amount: amt, description: mDesc, expense_date: mDate, entered_by: mBy || null })
      });
      setShowModal(false);
      setMAmt(''); setMDesc('');
      showToast('Expense logged!');
      loadAll();
    } catch (e) {
      showToast('Error saving expense.');
    }
  };

  const delExp = async (id: string) => {
    if (!confirm('Delete this expense?')) return;
    try {
      await fetch('/api/expenses/' + id, { method: 'DELETE' });
      showToast('Deleted.');
      loadAll();
    } catch (e) {
      showToast('Error deleting.');
    }
  };

  const totalSpent = summary.reduce((s, c) => s + c.total, 0);
  const totalBudget = cats.reduce((s, c) => s + c.budget_limit, 0);
  const monthLbl = new Date(curMonth + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <>
      <Topbar title="Accounts & Expenses">
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={15} /> Log Expense
        </button>
      </Topbar>

      <div className="scroll">
        <div className="month-bar">
          <label style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 500 }}>Month</label>
          <input 
            type="month" 
            value={curMonth} 
            onChange={e => setCurMonth(e.target.value)} 
            style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px', color: 'var(--text)', outline: 'none' }} 
          />
        </div>

        <div className="stats">
          <div className="s-card"><div className="s-lbl">Total Spent</div><div className="s-val" style={{ color: 'var(--red)' }}>{fmt(totalSpent)} ৳</div></div>
          <div className="s-card"><div className="s-lbl">This Month Budget</div><div className="s-val" style={{ color: 'var(--primary)' }}>{fmt(totalBudget)} ৳</div></div>
          <div className="s-card"><div className="s-lbl">Entries</div><div className="s-val" style={{ color: 'var(--green)' }}>{expenses.length}</div></div>
        </div>

        <div className="grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
          <div className="card">
            <div className="card-head"><h3>By Category</h3></div>
            <div className="cat-list" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto' }}>
              {summary.length === 0 ? (
                <p style={{ color: 'var(--muted)', padding: '8px', fontSize: '.8rem' }}>No expenses this month.</p>
              ) : (
                summary.map(c => {
                  const pct = c.budget_limit > 0 ? Math.min(100, Math.round(c.total / c.budget_limit * 100)) : 0;
                  const over = c.budget_limit > 0 && c.total > c.budget_limit;
                  return (
                    <div className="cat-row" key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px' }}>
                      <div className="cat-dot" style={{ background: c.color, width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 }}></div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '.83rem', fontWeight: 500 }}>{c.name}</span>
                          <span style={{ fontSize: '.85rem', fontWeight: 600, color: over ? 'var(--red)' : 'var(--text)' }}>{fmt(c.total)} ৳</span>
                        </div>
                        {c.budget_limit > 0 && (
                          <>
                            <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', borderRadius: '2px', width: `${pct}%`, background: over ? 'var(--red)' : c.color }}></div>
                            </div>
                            <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: '1px' }}>
                              {pct}% of {fmt(c.budget_limit)} ৳ budget {over && '· OVER BUDGET'}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Quick Entry</h3></div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="fg" style={{ margin: 0 }}><label>Amount (৳)</label><input type="number" placeholder="0.00" value={qAmt} onChange={e => setQAmt(e.target.value)} /></div>
              <div className="fg" style={{ margin: 0 }}>
                <label>Category</label>
                <select value={qCat} onChange={e => setQCat(e.target.value)}>
                  <option value="">Select...</option>
                  {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="fg" style={{ margin: 0 }}><label>Description</label><input placeholder="What was this for?" value={qDesc} onChange={e => setQDesc(e.target.value)} /></div>
              <div className="fg" style={{ margin: 0 }}><label>Date</label><input type="date" value={qDate} onChange={e => setQDate(e.target.value)} /></div>
              <button className="btn btn-primary" onClick={quickAdd}><Save size={14} /> Save Expense</button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Expense Log</h3>
            <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>{monthLbl}</span>
          </div>
          <div className="table-scroll"><table>
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr className="empty-r"><td colSpan={5}>No expenses recorded this month. Click "Log Expense" to add one.</td></tr>
              ) : (
                expenses.map(e => (
                  <tr key={e.id}>
                    <td style={{ color: 'var(--muted)', fontSize: '.78rem' }}>
                      {new Date(e.expense_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </td>
                    <td>
                      <span className="badge" style={{ background: hexA(e.category_color), color: e.category_color || 'var(--primary)' }}>
                        {e.category_name || 'Misc'}
                      </span>
                    </td>
                    <td>{e.description || '—'}</td>
                    <td style={{ fontWeight: 600, color: 'var(--red)' }}>{fmt(e.amount)} ৳</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" style={{ border: 'none' }} onClick={() => delExp(e.id)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table></div>
        </div>
      </div>

      {showModal && (
        <div className="veil on" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal">
            <div className="mhead">
              <h3>Log Expense</h3>
              <button className="xbtn" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div className="fg"><label>Amount (৳)</label><input type="number" placeholder="0.00" value={mAmt} onChange={e => setMAmt(e.target.value)} /></div>
            <div className="fg">
              <label>Category</label>
              <select value={mCat} onChange={e => setMCat(e.target.value)}>
                <option value="">Select...</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="fg"><label>Description</label><input placeholder="What was this expense for?" value={mDesc} onChange={e => setMDesc(e.target.value)} /></div>
            <div className="fg"><label>Date</label><input type="date" value={mDate} onChange={e => setMDate(e.target.value)} /></div>
            <div className="fg">
              <label>Logged By (optional)</label>
              <select value={mBy} onChange={e => setMBy(e.target.value)}>
                <option value="">Select...</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="mfooter">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addExpense}>Save</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="toast on">{toastMsg}</div>}
    </>
  );
}
