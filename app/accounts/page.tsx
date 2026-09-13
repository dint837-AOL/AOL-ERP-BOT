/**
 * Accounting — thin cards (tenders / daily-tasks pattern)
 * Card front: Date | Amount | Expense head
 * Detail: Date, Business (Trade/Digital), Expense head, Description, Amount, Payment
 * No reminder fields
 */
'use client';

import { useState, useCallback, useEffect } from 'react';
import { Pencil, Trash2, X, Plus } from 'lucide-react';
import Topbar from '../components/Topbar';
import { useAuth } from '../context/AuthContext';
import Cookies from 'js-cookie';

const EXPENSE_HEADS = [
  'Advertising & Promotion', 'Audit Fees', 'Bank Charges', 'Bonus/Festival Allowance',
  'Business Travel', 'Client Meeting/Gift', 'Cloud Services (AWS/Server)',
  'Conveyance', 'Customs Duty & Clearing', 'Depreciation',
  'Donation & Subscription', 'Entertainment (Client/Staff)',
  'Freelancer/Contractor Payment', 'Freight & Shipping',
  'Fuel & Lubricants (Generator/Vehicle)', 'Hosting & Domain',
  'Indenting Commission', 'Insurance (Cargo/Marine)', 'Internet & Telephone',
  'LC (Letter of Credit) Charges', 'Legal & Professional Fees',
  'Miscellaneous Expense', 'Office Rent', 'Office Supplies/Stationery',
  'Overtime', 'Port/C&F Charges', 'Printing',
  'Recruitment Cost', 'Repairs & Maintenance', 'Sample & Testing',
  'Salaries & Wages', 'Security/Cleaning', 'Software Subscription/License',
  'Staff Welfare', 'Tax & VAT', 'Tender Documentation Cost',
  'Tools & Equipment (Laptop, etc.)', 'Trade License/Renewal',
  'Training & Development', 'Utilities (Electricity, Gas, Water)',
  'Vehicle Maintenance', 'Warehousing', 'Website/Social Media',
];

const SHORT_HEAD: Record<string, string> = {
  'Utilities (Electricity, Gas, Water)': 'Utilities',
  'Internet & Telephone': 'Internet',
  'Office Supplies/Stationery': 'Stationery',
  'Entertainment (Client/Staff)': 'Entertainment',
  'Repairs & Maintenance': 'Repairs',
  'Security/Cleaning': 'Security',
  'Salaries & Wages': 'Salaries',
  'Bonus/Festival Allowance': 'Bonus',
  'Training & Development': 'Training',
  'Freight & Shipping': 'Freight',
  'Customs Duty & Clearing': 'Customs',
  'LC (Letter of Credit) Charges': 'LC Charges',
  'Insurance (Cargo/Marine)': 'Insurance',
  'Sample & Testing': 'Testing',
  'Indenting Commission': 'Commission',
  'Port/C&F Charges': 'Port Charges',
  'Software Subscription/License': 'Software',
  'Hosting & Domain': 'Hosting',
  'Cloud Services (AWS/Server)': 'Cloud',
  'Freelancer/Contractor Payment': 'Freelancer',
  'Tools & Equipment (Laptop, etc.)': 'Equipment',
  'Advertising & Promotion': 'Advertising',
  'Website/Social Media': 'Social Media',
  'Business Travel': 'Travel',
  'Client Meeting/Gift': 'Client Gift',
  'Tender Documentation Cost': 'Tender Docs',
  'Legal & Professional Fees': 'Legal',
  'Trade License/Renewal': 'Trade Lic.',
  'Donation & Subscription': 'Donation',
  'Miscellaneous Expense': 'Misc.',
  'Fuel & Lubricants (Generator/Vehicle)': 'Fuel',
  'Vehicle Maintenance': 'Vehicle',
};

function shortHead(h?: string) {
  if (!h) return '—';
  return SHORT_HEAD[h] || h;
}

type ExpenseForm = {
  date: string;
  company_name: string;
  expense_head: string;
  description: string;
  amount: string;
  payment_method: string;
};

const BLANK: ExpenseForm = {
  date: new Date().toISOString().split('T')[0]!,
  company_name: 'Trade',
  expense_head: EXPENSE_HEADS[0]!,
  description: '',
  amount: '',
  payment_method: 'Cash',
};

const WHITE = '#ffffff';
const MUTED_LABEL = 'rgba(255,255,255,0.55)';
const BLUE = '#4f7eff';
const BLUE_BG = 'rgba(79,126,255,0.15)';
const BLUE_GRAD = 'linear-gradient(135deg, #4f7eff, #6c4fe3)';

const fieldInputSt: React.CSSProperties = {
  background: '#131722',
  border: '1px solid #2a3050',
  borderRadius: 7,
  color: WHITE,
  fontSize: '0.78rem',
  padding: '6px 9px',
  width: '100%',
  outline: 'none',
  fontFamily: 'inherit',
};
const fieldEditSt: React.CSSProperties = { ...fieldInputSt, border: '1px solid #3a4568' };
const fieldSelectSt: React.CSSProperties = { ...fieldEditSt, cursor: 'pointer' };
const labelSt: React.CSSProperties = {
  fontSize: '0.62rem',
  color: MUTED_LABEL,
  textTransform: 'uppercase',
  marginBottom: 2,
  fontWeight: 600,
  letterSpacing: '0.04em',
};
const valueSt: React.CSSProperties = {
  color: WHITE,
  fontWeight: 500,
  fontSize: '0.82rem',
  lineHeight: 1.25,
};

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <div style={labelSt}>
      {children}
      {optional ? ' (optional)' : ''}
    </div>
  );
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try {
    const [y, m, d] = iso.split('-');
    if (y && m && d) return `${d}-${m}-${y}`;
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function fmtDateShort(iso?: string) {
  if (!iso) return '—';
  try {
    const d = new Date(iso + (iso.includes('T') ? '' : 'T12:00:00'));
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
}

function fmtBDT(n: number | string) {
  return `৳ ${Number(n || 0).toLocaleString('en-BD', { maximumFractionDigits: 0 })}`;
}

function normalizeBusiness(v?: string) {
  if (!v) return 'Trade';
  if (v === 'Trade' || v === 'Digital') return v;
  // legacy AOD / GSBD → Trade
  return 'Trade';
}

function expenseToForm(exp: any): ExpenseForm {
  return {
    date: exp.expense_date || BLANK.date,
    company_name: normalizeBusiness(exp.company_name),
    expense_head: exp.expense_head || EXPENSE_HEADS[0]!,
    description: exp.description || '',
    amount: String(exp.amount ?? ''),
    payment_method: exp.payment_method || 'Cash',
  };
}

// ─── Compact card: Date | Amount | Top exp ───────────────────────────────────

function CompactExpenseCard({ expense, onClick }: { expense: any; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: '#161926',
        border: '1px solid #2a3050',
        borderRadius: 12,
        padding: '13px 16px',
        marginBottom: 10,
        cursor: 'pointer',
        transition: 'all 0.15s',
        userSelect: 'none',
      }}
      onMouseOver={e => {
        e.currentTarget.style.borderColor = '#4f7eff';
        e.currentTarget.style.background = 'rgba(79,126,255,0.04)';
      }}
      onMouseOut={e => {
        e.currentTarget.style.borderColor = '#2a3050';
        e.currentTarget.style.background = '#161926';
      }}
    >
      <div style={{ fontSize: '0.82rem', color: WHITE, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>
        {fmtDateShort(expense.expense_date)}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontSize: '0.92rem',
          color: WHITE,
          fontWeight: 600,
          textAlign: 'center',
        }}
      >
        {fmtBDT(expense.amount)}
      </div>
      <div
        style={{
          maxWidth: '38%',
          fontSize: '0.82rem',
          color: WHITE,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontWeight: 600,
          flexShrink: 0,
          marginLeft: 40,
          textAlign: 'right',
        }}
      >
        {shortHead(expense.expense_head)}
      </div>
    </div>
  );
}

// ─── Shared fields ───────────────────────────────────────────────────────────

function ExpenseFields({
  form,
  editMode,
  onChange,
  viewSource,
}: {
  form: ExpenseForm;
  editMode: boolean;
  onChange: (field: keyof ExpenseForm, val: string) => void;
  viewSource?: any;
}) {
  const v = viewSource;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <FieldLabel>Date</FieldLabel>
          {editMode ? (
            <input type="date" value={form.date} onChange={e => onChange('date', e.target.value)} style={{ ...fieldEditSt, colorScheme: 'dark' }} />
          ) : (
            <div style={valueSt}>{fmtDate(v?.expense_date)}</div>
          )}
        </div>
        <div>
          <FieldLabel>Business</FieldLabel>
          {editMode ? (
            <select value={form.company_name} onChange={e => onChange('company_name', e.target.value)} style={fieldSelectSt}>
              <option value="Trade">Trade</option>
              <option value="Digital">Digital</option>
            </select>
          ) : (
            <div style={valueSt}>{normalizeBusiness(v?.company_name)}</div>
          )}
        </div>
      </div>

      <div>
        <FieldLabel>Expense Head</FieldLabel>
        {editMode ? (
          <select value={form.expense_head} onChange={e => onChange('expense_head', e.target.value)} style={fieldSelectSt}>
            {EXPENSE_HEADS.map(h => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        ) : (
          <div style={valueSt}>{v?.expense_head || '—'}</div>
        )}
      </div>

      <div>
        <FieldLabel optional>Description</FieldLabel>
        {editMode ? (
          <textarea
            value={form.description}
            onChange={e => onChange('description', e.target.value)}
            rows={2}
            placeholder="Short details..."
            style={{ ...fieldEditSt, resize: 'none' }}
          />
        ) : (
          <div style={{ ...valueSt, whiteSpace: 'pre-wrap' }}>{v?.description || '—'}</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <FieldLabel>Amount (BDT)</FieldLabel>
          {editMode ? (
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={form.amount}
              onChange={e => onChange('amount', e.target.value)}
              style={fieldEditSt}
              placeholder="0"
            />
          ) : (
            <div style={valueSt}>{fmtBDT(v?.amount)}</div>
          )}
        </div>
        <div>
          <FieldLabel>Payment</FieldLabel>
          {editMode ? (
            <select value={form.payment_method} onChange={e => onChange('payment_method', e.target.value)} style={fieldSelectSt}>
              <option value="Cash">Cash</option>
              <option value="Cheque">Cheque</option>
            </select>
          ) : (
            <div style={valueSt}>{v?.payment_method || '—'}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const { user, token: ctxToken } = useAuth();
  const getToken = useCallback(
    () =>
      ctxToken ||
      Cookies.get('token') ||
      (typeof window !== 'undefined' ? localStorage.getItem('erp_token') || localStorage.getItem('token') : '') ||
      '',
    [ctxToken]
  );

  const curMonth = new Date().toISOString().substring(0, 7);
  const [month, setMonth] = useState(curMonth);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [monthTotal, setMonthTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');

  const [selected, setSelected] = useState<any>(null);
  const [draft, setDraft] = useState<ExpenseForm>(BLANK);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<ExpenseForm>(BLANK);
  const [savingAdd, setSavingAdd] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  function showToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(''), 2600);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/expenses?month=' + month, {
        headers: { Authorization: 'Bearer ' + getToken() },
      });
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setExpenses(list);
      setMonthTotal(list.reduce((s: number, r: any) => s + Number(r.amount), 0));
    } catch {
      showToast('Error loading expenses.');
    }
    setLoading(false);
  }, [month, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  function openDetail(exp: any) {
    setSelected(exp);
    setDraft(expenseToForm(exp));
    setEditMode(false);
  }

  function closeDetail() {
    setSelected(null);
    setEditMode(false);
  }

  async function saveDraft() {
    if (!selected) return;
    if (!draft.amount || isNaN(Number(draft.amount)) || Number(draft.amount) <= 0) {
      showToast('Enter a valid amount.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/expenses/' + selected.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
        body: JSON.stringify({
          amount: Number(draft.amount),
          description: draft.description,
          expense_date: draft.date,
          company_name: draft.company_name,
          expense_head: draft.expense_head,
          payment_method: draft.payment_method,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json();
      showToast('Expense updated.');
      setEditMode(false);
      await load();
      setSelected(updated);
      setDraft(expenseToForm(updated));
    } catch {
      showToast('Error saving expense.');
    } finally {
      setSaving(false);
    }
  }

  async function submitAdd() {
    if (!addForm.amount || isNaN(Number(addForm.amount)) || Number(addForm.amount) <= 0) {
      showToast('Enter a valid amount.');
      return;
    }
    setSavingAdd(true);
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
        body: JSON.stringify({
          amount: Number(addForm.amount),
          description: addForm.description,
          expense_date: addForm.date,
          company_name: addForm.company_name,
          expense_head: addForm.expense_head,
          payment_method: addForm.payment_method,
          entered_by: user?.id,
          category_id: null,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      showToast('Expense saved.');
      setShowAdd(false);
      setAddForm({ ...BLANK, date: new Date().toISOString().split('T')[0]! });
      if (addForm.date.substring(0, 7) === month) load();
      else setMonth(addForm.date.substring(0, 7));
    } catch {
      showToast('Error saving expense.');
    } finally {
      setSavingAdd(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await fetch('/api/expenses/' + deleteTarget.id, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + getToken() },
      });
      showToast('Expense deleted.');
      setDeleteTarget(null);
      closeDetail();
      load();
    } catch {
      showToast('Error deleting.');
    }
  }

  const active = selected ? expenses.find(e => e.id === selected.id) || selected : null;

  return (
    <>
      <Topbar title="Accounting" />

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 88,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1d2133',
            border: '1px solid #2a3050',
            borderRadius: 10,
            padding: '10px 20px',
            fontSize: '.84rem',
            zIndex: 99999,
            color: WHITE,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 20px rgba(0,0,0,.4)',
          }}
        >
          {toast}
        </div>
      )}

      <div
        style={{
          padding: '12px 14px 100px',
          overflowY: 'auto',
          height: 'calc(100dvh - 56px)',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: MUTED_LABEL, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Month
          </label>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            style={{ ...fieldInputSt, width: 'auto', minWidth: 150, colorScheme: 'dark' }}
          />
          <div style={{ marginLeft: 'auto', fontSize: '0.84rem', fontWeight: 700, color: WHITE }}>
            {fmtBDT(monthTotal)}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: WHITE, opacity: 0.6, fontSize: '0.85rem' }}>Loading...</div>
        ) : expenses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: WHITE, opacity: 0.6, fontSize: '0.85rem' }}>
            No expenses this month. Tap + to add one.
          </div>
        ) : (
          expenses.map(exp => <CompactExpenseCard key={exp.id} expense={exp} onClick={() => openDetail(exp)} />)
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => {
          setAddForm({ ...BLANK, date: new Date().toISOString().split('T')[0]! });
          setShowAdd(true);
        }}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 20,
          zIndex: 700,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: BLUE_GRAD,
          border: 'none',
          color: WHITE,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 22px rgba(79,126,255,0.45)',
        }}
        title="Add expense"
      >
        <Plus size={24} />
      </button>

      {/* Detail sheet */}
      {active && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
          onClick={closeDetail}
        >
          <div
            style={{
              background: '#161926',
              borderTop: '1px solid #2a3050',
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              padding: '14px 16px 16px',
              paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '100dvh',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ position: 'absolute', top: 10, right: 12, display: 'flex', gap: 8, zIndex: 2 }}>
              {!editMode && (
                <button
                  onClick={() => setEditMode(true)}
                  style={{
                    background: BLUE_BG,
                    border: 'none',
                    color: BLUE,
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Pencil size={15} />
                </button>
              )}
              {!editMode && (
                <button
                  onClick={() => {
                    setDeleteTarget(active);
                    closeDetail();
                  }}
                  style={{
                    background: 'rgba(239,68,68,0.12)',
                    border: 'none',
                    color: '#ef4444',
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                onClick={closeDetail}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  color: '#94a3b8',
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                fontSize: '0.68rem',
                color: WHITE,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 10,
                fontWeight: 700,
                paddingRight: 110,
                opacity: 0.7,
              }}
            >
              {editMode ? 'Edit Expense' : 'Expense Details'}
            </div>

            <ExpenseFields
              form={draft}
              editMode={editMode}
              onChange={(field, val) => setDraft(prev => ({ ...prev, [field]: val }))}
              viewSource={editMode ? undefined : active}
            />

            {editMode && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(expenseToForm(active));
                    setEditMode(false);
                  }}
                  style={{
                    padding: '10px',
                    borderRadius: 9,
                    border: '1px solid #2a3050',
                    background: '#131722',
                    color: WHITE,
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveDraft}
                  disabled={saving}
                  style={{
                    padding: '10px',
                    borderRadius: 9,
                    border: 'none',
                    background: BLUE_GRAD,
                    color: WHITE,
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: '0 4px 15px rgba(79,126,255,0.3)',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add sheet */}
      {showAdd && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 800,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
          <div onClick={() => setShowAdd(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }} />
          <div
            style={{
              position: 'relative',
              background: '#161926',
              borderRadius: '18px 18px 0 0',
              border: '1px solid #2a3050',
              borderBottom: 'none',
              padding: '12px 16px 16px',
              paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
              width: '100%',
              maxWidth: 560,
              maxHeight: '100dvh',
              overflow: 'hidden',
            }}
          >
            <div style={{ width: 36, height: 3, background: '#2a3050', borderRadius: 2, margin: '0 auto 10px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: WHITE, margin: 0 }}>Add Expense</h3>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: WHITE, cursor: 'pointer', padding: 4, opacity: 0.7 }}>
                <X size={18} />
              </button>
            </div>

            <ExpenseFields form={addForm} editMode onChange={(field, val) => setAddForm(p => ({ ...p, [field]: val }))} />

            <button
              type="button"
              onClick={submitAdd}
              disabled={savingAdd}
              style={{
                width: '100%',
                marginTop: 12,
                padding: '11px',
                borderRadius: 9,
                border: 'none',
                background: BLUE_GRAD,
                color: WHITE,
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 4px 15px rgba(79,126,255,0.3)',
                opacity: savingAdd ? 0.7 : 1,
              }}
            >
              {savingAdd ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div
          onClick={e => {
            if (e.target === e.currentTarget) setDeleteTarget(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            background: 'rgba(0,0,0,.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              background: '#161926',
              border: '1px solid #2a3050',
              borderRadius: 16,
              width: '100%',
              maxWidth: 340,
              padding: 22,
            }}
          >
            <h3 style={{ textAlign: 'center', fontSize: '1rem', fontWeight: 700, marginBottom: 8, color: WHITE }}>Delete Expense?</h3>
            <p style={{ textAlign: 'center', fontSize: '.88rem', color: WHITE, marginBottom: 4 }}>{fmtDate(deleteTarget.expense_date)}</p>
            <p style={{ textAlign: 'center', fontSize: '1rem', fontWeight: 700, color: WHITE, marginBottom: 20 }}>{fmtBDT(deleteTarget.amount)}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: 10,
                  border: '1px solid #2a3050',
                  background: '#131722',
                  color: WHITE,
                  fontSize: '.88rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: 10,
                  border: 'none',
                  background: BLUE_GRAD,
                  color: WHITE,
                  fontSize: '.88rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: '0 4px 15px rgba(79,126,255,0.3)',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
