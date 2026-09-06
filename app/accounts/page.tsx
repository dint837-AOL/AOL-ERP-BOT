'use client';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Topbar from '../components/Topbar';
import { useAuth } from '../context/AuthContext';
import Cookies from 'js-cookie';

const EXPENSE_HEADS = [
  "Advertising & Promotion","Audit Fees","Bank Charges","Bonus/Festival Allowance",
  "Business Travel","Client Meeting/Gift","Cloud Services (AWS/Server)",
  "Conveyance","Customs Duty & Clearing","Depreciation",
  "Donation & Subscription","Entertainment (Client/Staff)",
  "Freelancer/Contractor Payment","Freight & Shipping",
  "Fuel & Lubricants (Generator/Vehicle)","Hosting & Domain",
  "Indenting Commission","Insurance (Cargo/Marine)","Internet & Telephone",
  "LC (Letter of Credit) Charges","Legal & Professional Fees",
  "Miscellaneous Expense","Office Rent","Office Supplies/Stationery",
  "Overtime","Port/C&F Charges","Printing",
  "Recruitment Cost","Repairs & Maintenance","Sample & Testing",
  "Salaries & Wages","Security/Cleaning","Software Subscription/License",
  "Staff Welfare","Tax & VAT","Tender Documentation Cost",
  "Tools & Equipment (Laptop, etc.)","Trade License/Renewal",
  "Training & Development","Utilities (Electricity, Gas, Water)",
  "Vehicle Maintenance","Warehousing","Website/Social Media",
];

function fmtDate(iso: string) { const [y,m,d]=iso.split('-'); return `${d}-${m}-${y}`; }
function fmtBDT(n: number | string)  { return Number(n).toLocaleString('en-BD',{maximumFractionDigits:0}); }

const H: Record<string, string> ={
  'Utilities (Electricity, Gas, Water)':'Utilities','Internet & Telephone':'Internet',
  'Office Supplies/Stationery':'Stationery','Entertainment (Client/Staff)':'Entertainment',
  'Repairs & Maintenance':'Repairs','Security/Cleaning':'Security',
  'Salaries & Wages':'Salaries','Bonus/Festival Allowance':'Bonus',
  'Training & Development':'Training','Freight & Shipping':'Freight',
  'Customs Duty & Clearing':'Customs','LC (Letter of Credit) Charges':'LC Charges',
  'Insurance (Cargo/Marine)':'Insurance','Sample & Testing':'Testing',
  'Indenting Commission':'Commission','Port/C&F Charges':'Port Charges',
  'Software Subscription/License':'Software','Hosting & Domain':'Hosting',
  'Cloud Services (AWS/Server)':'Cloud','Freelancer/Contractor Payment':'Freelancer',
  'Tools & Equipment (Laptop, etc.)':'Equipment','Advertising & Promotion':'Advertising',
  'Website/Social Media':'Social Media','Business Travel':'Travel',
  'Client Meeting/Gift':'Client Gift','Tender Documentation Cost':'Tender Docs',
  'Legal & Professional Fees':'Legal','Trade License/Renewal':'Trade Lic.',
  'Donation & Subscription':'Donation','Miscellaneous Expense':'Misc.',
  'Fuel & Lubricants (Generator/Vehicle)':'Fuel','Vehicle Maintenance':'Vehicle',
};
function sh(h: string){ return H[h]||h; }

const BLANK = {date:new Date().toISOString().split('T')[0],company_name:'AOD',expense_head:EXPENSE_HEADS[0],description:'',amount:'',payment_method:'Cash'};

// SVG icons
const IconEdit = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);
const IconList = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);

// EntrySheet is defined OUTSIDE the component to prevent remount on each render (fixes keyboard dismiss)
interface EntrySheetProps {
  editId: any;
  form: typeof BLANK;
  formLoading: boolean;
  onClose: () => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
}
function EntrySheet({ editId, form, formLoading, onClose, onChange, onSubmit }: EntrySheetProps) {
  return (
    <>
      <div style={{display:'flex',justifyContent:'center',padding:'12px 0 0'}}>
        <div style={{width:36,height:4,borderRadius:2,background:'var(--border)'}}/>
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 20px 12px'}}>
        <h3 style={{fontSize:'1rem',fontWeight:700}}>{editId?'Edit Expense':'New Expense'}</h3>
        <button onClick={onClose} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'1.3rem',lineHeight:1,padding:4}}>X</button>
      </div>
      <form onSubmit={onSubmit} style={{padding:'0 20px 24px'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:13}}>
          <div className="fg" style={{marginBottom:0}}>
            <label>Date</label>
            <input type="date" name="date" value={form.date} onChange={onChange} required/>
          </div>
          <div className="fg" style={{marginBottom:0}}>
            <label>Company</label>
            <select name="company_name" value={form.company_name} onChange={onChange} required>
              <option value="AOD">AOD</option><option value="GSBD">GSBD</option>
            </select>
          </div>
        </div>
        <div className="fg">
          <label>Expense Head</label>
          <select name="expense_head" value={form.expense_head} onChange={onChange} required>
            {EXPENSE_HEADS.map(h=><option key={h} value={h}>{h}</option>)}
          </select>
        </div>
        <div className="fg">
          <label>Description <span style={{color:'var(--muted)',fontWeight:400,textTransform:'none'}}>(optional)</span></label>
          <textarea name="description" placeholder="Short details..." value={form.description} onChange={onChange} rows={2}/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
          <div className="fg" style={{marginBottom:0}}>
            <label>Amount (BDT)</label>
            <input type="number" name="amount" placeholder="e.g. 5000" value={form.amount} onChange={onChange} required min="0" step="0.01" inputMode="decimal"/>
          </div>
          <div className="fg" style={{marginBottom:0}}>
            <label>Payment</label>
            <select name="payment_method" value={form.payment_method} onChange={onChange} required>
              <option value="Cash">Cash</option><option value="Cheque">Cheque</option>
            </select>
          </div>
        </div>
        <button type="submit" className="btn btn-primary" style={{width:'100%',justifyContent:'center',padding:'12px',fontSize:'.95rem',fontWeight:700,borderRadius:10}} disabled={formLoading}>
          {formLoading?'Saving...':'Save'}
        </button>
      </form>
    </>
  );
}

const iconBtn = (onClick: () => void, color: string, bg: string, border: string, children: React.ReactNode, title: string) => (
  <button onClick={onClick} title={title} style={{
    background:bg, border:`1px solid ${border}`, color, borderRadius:8,
    width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center',
    cursor:'pointer', flexShrink:0
  }}>{children}</button>
);

export default function AccountsPage() {
  const { user, token: ctxToken } = useAuth();
  const getToken = useCallback(() =>
    ctxToken || Cookies.get('token') ||
    (typeof window !== 'undefined' ? (localStorage.getItem('erp_token')||localStorage.getItem('token')) : '')||'',
    [ctxToken]);

  const curMonth = new Date().toISOString().substring(0,7);
  const [month, setMonth] = useState(curMonth);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [monthTotal, setMonthTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Entry form
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<any>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [toast, setToast] = useState('');

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  // Manage sheet (individual entries per date)
  const [manageDate, setManageDate] = useState<any>(null); // { date, entries[] }

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/expenses?month='+month, {
        headers: { Authorization: 'Bearer '+getToken() }
      });
      const data = await res.json();
      setExpenses(data);
      setMonthTotal(data.reduce((s: number, r: any) => s+Number(r.amount), 0));
    } catch {}
    setLoading(false);
  }, [month, getToken]);

  useEffect(() => { load(); }, [load]);

  // Group expenses by date — ASCENDING order
  const grouped = useMemo(() => {
    const byDate: Record<string, any> = {};
    expenses.forEach((exp: any) => {
      const d = exp.expense_date;
      if (!byDate[d]) byDate[d] = { date:d, total:0, headAmts:{}, entries:[] };
      byDate[d].total += Number(exp.amount);
      byDate[d].entries.push(exp);
      const hk = exp.expense_head||'Other';
      byDate[d].headAmts[hk] = (byDate[d].headAmts[hk]||0)+Number(exp.amount);
    });
    return Object.values(byDate)
      .map((g: any) => ({ ...g, top3: Object.entries(g.headAmts).sort((a: any, b: any)=>b[1]-a[1]).slice(0,3).map(([h])=>h) }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date)); // ASC
  }, [expenses]);

  // Aggregate top expense heads for the month
  const topHeads = useMemo(() => {
    const headAmts: Record<string, number> = {};
    expenses.forEach((exp: any) => {
      const h = exp.expense_head || 'Other';
      headAmts[h] = (headAmts[h] || 0) + Number(exp.amount);
    });
    return Object.entries(headAmts)
      .map(([head, amt], i) => ({ sl: i+1, head, amt }))
      .sort((a, b) => b.amt - a.amt)
      .map((r, i) => ({ ...r, sl: i+1 }));
  }, [expenses]);

  function openAdd() {
    setEditId(null);
    setForm({...BLANK, date: new Date().toISOString().split('T')[0]});
    setSheetOpen(true);
  }
  function openEdit(exp: any) {
    setEditId(exp.id);
    setForm({
      date: exp.expense_date||BLANK.date,
      company_name: exp.company_name||'AOD',
      expense_head: exp.expense_head||EXPENSE_HEADS[0],
      description: exp.description||'',
      amount: String(exp.amount||''),
      payment_method: exp.payment_method||'Cash'
    });
    setManageDate(null);
    setSheetOpen(true);
  }
  function openManage(group: any) { setManageDate({ date: group.date, entries: group.entries }); }

  function handleDelete(exp: any) {
    setDeleteTarget({ id: exp.id, amount: exp.amount, date: exp.expense_date });
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    await fetch('/api/expenses/'+deleteTarget.id, {method:'DELETE', headers:{Authorization:'Bearer '+getToken()}});
    setDeleteTarget(null);
    setManageDate(null);
    showToast('Expense deleted.');
    load();
  }
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => ({...prev, [e.target.name]: e.target.value}));
  }, []);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount||isNaN(Number(form.amount))||Number(form.amount)<=0) { showToast('Enter a valid amount.'); return; }
    setFormLoading(true);
    try {
      const body = {
        amount: Number(form.amount), description: form.description,
        expense_date: form.date, company_name: form.company_name,
        expense_head: form.expense_head, payment_method: form.payment_method,
        entered_by: user?.id, category_id: null
      };
      const url = editId ? '/api/expenses/'+editId : '/api/expenses';
      const method = editId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method, headers: {'Content-Type':'application/json', Authorization:'Bearer '+getToken()},
        body: JSON.stringify(body)
      });
      if (!res.ok) { const err: any = await res.json().catch(()=>{}); throw new Error(err?.error||'Failed'); }
      showToast(editId ? 'Expense updated.' : 'Expense saved.');
      setSheetOpen(false);
      if (form.date && form.date.substring(0,7)===month) load();
    } catch(err: any) { showToast(err.message||'Error'); }
    setFormLoading(false);
  }

  const thStyle: React.CSSProperties = {
    padding:'8px 10px',fontSize:'.6rem',fontWeight:700,color:'var(--text)',
    textTransform:'uppercase',letterSpacing:'.04em',
    borderBottom:'1px solid var(--border)',
    position:'sticky',top:0,background:'rgba(13,15,24,.98)',zIndex:2,
    whiteSpace:'nowrap'
  };
  const tdStyle: React.CSSProperties = {
    padding:'10px 10px',fontSize:'.78rem',color:'var(--text)',whiteSpace:'nowrap'
  };

  return (
    <>
      <Topbar title="Accounting"/>

      {toast && (
        <div style={{
          position:'fixed',bottom:80,left:'50%',transform:'translateX(-50%)',
          background:'#1d2133',border:'1px solid #2a3050',borderRadius:10,
          padding:'10px 20px',fontSize:'.84rem',zIndex:999,color:'#dde2f0',
          whiteSpace:'nowrap',boxShadow:'0 4px 20px rgba(0,0,0,.4)'
        }}>{toast}</div>
      )}

      <div style={{padding:'12px 16px 16px',overflowY:'auto',height:'calc(100dvh - 56px)',display:'flex',flexDirection:'column',boxSizing:'border-box',gap:12}}>
        {/* Month picker */}
        <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
          <label style={{fontSize:'.72rem',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.04em',whiteSpace:'nowrap'}}>Month</label>
          <input type="month" value={month} onChange={e=>setMonth(e.target.value)}
            style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 10px',color:'var(--text)',fontSize:'.84rem',fontFamily:'inherit',outline:'none',minWidth:160}}/>
          {loading&&<span style={{fontSize:'.72rem',color:'var(--muted)'}}>Loading...</span>}
        </div>

        {/* Expense Summary — section wrapper */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>

          {/* TOP TABLE: Datewise Expense Summary */}
          <div className="card" style={{display:'flex',flexDirection:'column',minWidth:0,marginBottom:0}}>
            <div className="card-head" style={{flexShrink:0}}>
              <h3 style={{fontSize:'.9rem'}}>Datewise Expense Summary</h3>
            </div>
            <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch' as any}}>
              <table style={{width:'100%',borderCollapse:'collapse',tableLayout:'fixed',minWidth:300}}>
                <colgroup>
                  <col style={{width:'28%'}}/><col style={{width:'26%'}}/><col style={{width:'32%'}}/><col style={{width:'14%'}}/>
                </colgroup>
                <thead>
                  <tr>
                    {['Date','Total','Top Heads',''].map((h,i)=>(
                      <th key={i} style={{...thStyle,textAlign:i===1?'right':'left'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grouped.length===0&&!loading&&(
                    <tr><td colSpan={4} style={{textAlign:'center',padding:30,color:'var(--muted)',fontSize:'.82rem'}}>No expenses this month.</td></tr>
                  )}
                  {grouped.map((g,i)=>(
                    <tr key={g.date} style={{borderBottom:i<grouped.length-1?'1px solid var(--border)':'none'}}>
                      <td style={{...tdStyle,fontWeight:600}}>{fmtDate(g.date)}</td>
                      <td style={{...tdStyle,textAlign:'right',fontWeight:700}}>{fmtBDT(g.total)}</td>
                      <td style={{padding:'10px 10px'}}>
                        <div style={{display:'flex',flexDirection:'column',gap:2}}>
                          {g.top3.map((hd: string, j: number)=>(
                            <span key={j} style={{
                              fontSize:'.6rem',fontWeight:600,display:'block',
                              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                              color:'var(--text)'
                            }}>{sh(hd)}</span>
                          ))}
                        </div>
                      </td>
                      <td style={{padding:'6px 8px'}}>
                        <div style={{display:'flex',justifyContent:'flex-end'}}>
                          {iconBtn(()=>openManage(g),'var(--muted)','rgba(255,255,255,.06)','rgba(255,255,255,.12)',<IconList/>,'View entries')}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{padding:'10px 16px',borderTop:'2px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(0,0,0,.15)',flexShrink:0}}>
              <span style={{fontSize:'.74rem',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.04em'}}>Total</span>
              <span style={{fontSize:'1.15rem',fontWeight:800,color:'var(--orange)'}}>{fmtBDT(monthTotal)}</span>
            </div>
          </div>

          {/* BOTTOM TABLE: Top Expense Heads */}
          <div className="card" style={{display:'flex',flexDirection:'column',minWidth:0,marginBottom:0}}>
            <div className="card-head" style={{flexShrink:0}}>
              <h3 style={{fontSize:'.9rem'}}>Top Expense Heads</h3>
            </div>
            <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch' as any}}>
              <table style={{width:'100%',borderCollapse:'collapse',tableLayout:'fixed',minWidth:240}}>
                <colgroup>
                  <col style={{width:'12%'}}/><col style={{width:'58%'}}/><col style={{width:'30%'}}/>
                </colgroup>
                <thead>
                  <tr>
                    <th style={{...thStyle,textAlign:'center'}}>#</th>
                    <th style={thStyle}>Description</th>
                    <th style={{...thStyle,textAlign:'right'}}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {topHeads.length===0&&!loading&&(
                    <tr><td colSpan={3} style={{textAlign:'center',padding:30,color:'var(--muted)',fontSize:'.82rem'}}>No data.</td></tr>
                  )}
                  {topHeads.map((r,i)=>(
                    <tr key={r.head} style={{borderBottom:i<topHeads.length-1?'1px solid var(--border)':'none'}}>
                      <td style={{...tdStyle,textAlign:'center',fontWeight:700,fontSize:'.7rem',color:'var(--muted)'}}>{r.sl}</td>
                      <td style={{...tdStyle,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:'.72rem',fontWeight:600}}>{sh(r.head)}</td>
                      <td style={{...tdStyle,textAlign:'right',fontWeight:700,fontSize:'.76rem'}}>{fmtBDT(r.amt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

      {/* FAB */}
      <button id="acc-fab" onClick={openAdd} style={{
        position:'fixed',bottom:24,right:24,zIndex:800,
        width:56,height:56,borderRadius:'50%',
        background:'var(--primary)',color:'#fff',border:'none',
        fontSize:'1.8rem',cursor:'pointer',
        boxShadow:'0 4px 20px rgba(79,126,255,.5)',
        display:'flex',alignItems:'center',justifyContent:'center'
      }}>+</button>

      {/* Manage (date entries) sheet */}
      {manageDate&&(
        <div onClick={e=>{if(e.target===e.currentTarget)setManageDate(null);}} style={{
          position:'fixed',inset:0,zIndex:900,
          background:'rgba(0,0,0,.65)',backdropFilter:'blur(3px)',
          display:'flex',alignItems:'flex-end',justifyContent:'center'
        }}>
          <div style={{
            background:'var(--surface)',borderRadius:'20px 20px 0 0',
            width:'100%',maxWidth:560,
            paddingBottom:'env(safe-area-inset-bottom,12px)',
            maxHeight:'75dvh',overflowY:'auto',
            boxShadow:'0 -8px 40px rgba(0,0,0,.5)',
            animation:'slideSheet .22s ease-out'
          }}>
            <div style={{display:'flex',justifyContent:'center',padding:'12px 0 0'}}>
              <div style={{width:36,height:4,borderRadius:2,background:'var(--border)'}}/>
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 20px 4px'}}>
              <div>
                <h3 style={{fontSize:'1rem',fontWeight:700}}>{fmtDate(manageDate.date)}</h3>
                <p style={{fontSize:'.74rem',color:'var(--muted)',marginTop:2}}>{manageDate.entries.length} {manageDate.entries.length===1?'entry':'entries'}</p>
              </div>
              <button onClick={()=>setManageDate(null)} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'1.3rem',lineHeight:1,padding:4}}>X</button>
            </div>
            <div style={{padding:'8px 16px 20px',display:'flex',flexDirection:'column',gap:8}}>
              {manageDate.entries.map((exp: any)=>(
                <div key={exp.id} style={{
                  background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,
                  padding:'12px 14px',display:'flex',alignItems:'center',gap:10
                }}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:'.8rem',fontWeight:700,color:'var(--text)',marginBottom:2}}>{fmtBDT(exp.amount)}</div>
                    <div style={{fontSize:'.72rem',fontWeight:600,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sh(exp.expense_head||'-')}</div>
                    {exp.description&&<div style={{fontSize:'.68rem',color:'var(--muted)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{exp.description}</div>}
                    <div style={{fontSize:'.64rem',color:'var(--muted)',marginTop:3}}>{exp.company_name} · {exp.payment_method}</div>
                  </div>
                  <div style={{display:'flex',gap:6,flexShrink:0}}>
                    {iconBtn(()=>openEdit(exp),'var(--primary)','rgba(79,126,255,.12)','rgba(79,126,255,.22)',<IconEdit/>,'Edit')}
                    {iconBtn(()=>handleDelete(exp),'var(--red)','rgba(242,92,122,.1)','rgba(242,92,122,.22)',<IconTrash/>,'Delete')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit entry sheet */}
      {sheetOpen&&(
        <div onClick={e=>{if(e.target===e.currentTarget)setSheetOpen(false);}} style={{
          position:'fixed',inset:0,zIndex:910,
          background:'rgba(0,0,0,.65)',backdropFilter:'blur(3px)',
          display:'flex',alignItems:'flex-end',justifyContent:'center'
        }}>
          <div style={{
            background:'var(--surface)',borderRadius:'20px 20px 0 0',
            width:'100%',maxWidth:560,
            paddingBottom:'env(safe-area-inset-bottom,12px)',
            maxHeight:'92dvh',overflowY:'auto',
            boxShadow:'0 -8px 40px rgba(0,0,0,.5)',
            animation:'slideSheet .22s ease-out'
          }}>
            <EntrySheet
              editId={editId}
              form={form}
              formLoading={formLoading}
              onClose={() => setSheetOpen(false)}
              onChange={handleChange}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget&&(
        <div onClick={e=>{if(e.target===e.currentTarget)setDeleteTarget(null);}} style={{
          position:'fixed',inset:0,zIndex:950,
          background:'rgba(0,0,0,.7)',backdropFilter:'blur(4px)',
          display:'flex',alignItems:'center',justifyContent:'center',padding:20,
          animation:'fadeIn .18s ease-out'
        }}>
          <div style={{
            background:'var(--surface)',border:'1px solid var(--border)',
            borderRadius:16,width:'100%',maxWidth:340,padding:24,
            boxShadow:'0 8px 40px rgba(0,0,0,.5)',animation:'slideUp .2s ease-out'
          }}>
            <div style={{display:'flex',justifyContent:'center',marginBottom:16}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'rgba(242,92,122,.12)',border:'1px solid rgba(242,92,122,.3)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <IconTrash/>
              </div>
            </div>
            <h3 style={{textAlign:'center',fontSize:'1rem',fontWeight:700,marginBottom:8}}>Delete Expense?</h3>
            <p style={{textAlign:'center',fontSize:'.82rem',color:'var(--muted)',marginBottom:6}}>{fmtDate(deleteTarget.date)}</p>
            <p style={{textAlign:'center',fontSize:'1.1rem',fontWeight:700,color:'var(--red)',marginBottom:20}}>{fmtBDT(deleteTarget.amount)}</p>
            <p style={{textAlign:'center',fontSize:'.78rem',color:'var(--muted)',marginBottom:22}}>This action cannot be undone.</p>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setDeleteTarget(null)} style={{flex:1,padding:'11px',borderRadius:10,border:'1px solid var(--border)',background:'var(--card)',color:'var(--text)',fontSize:'.88rem',fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
              <button onClick={confirmDelete} style={{flex:1,padding:'11px',borderRadius:10,border:'none',background:'var(--red)',color:'#fff',fontSize:'.88rem',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideSheet{from{transform:translateY(50px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
      `}</style>
    </>
  );
}
