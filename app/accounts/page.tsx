'use client';
import { useState, useCallback } from 'react';
import Topbar from '../components/Topbar';
import { useAuth } from '../context/AuthContext';
import Cookies from 'js-cookie';

const EXPENSE_HEADS = [
  "Office Rent", "Utilities (Electricity, Gas, Water)", "Internet & Telephone", "Office Supplies/Stationery",
  "Conveyance", "Entertainment (Client/Staff)", "Printing", "Repairs & Maintenance", "Security/Cleaning",
  "Salaries & Wages", "Staff Welfare", "Overtime", "Bonus/Festival Allowance", "Training & Development",
  "Recruitment Cost", "Freight & Shipping", "Customs Duty & Clearing", "LC (Letter of Credit) Charges",
  "Insurance (Cargo/Marine)", "Warehousing", "Sample & Testing", "Indenting Commission", "Port/C&F Charges",
  "Software Subscription/License", "Hosting & Domain", "Cloud Services (AWS/Server)", "Freelancer/Contractor Payment",
  "Tools & Equipment (Laptop, etc.)", "Advertising & Promotion", "Website/Social Media", "Business Travel",
  "Client Meeting/Gift", "Tender Documentation Cost", "Bank Charges", "Legal & Professional Fees", "Audit Fees",
  "Trade License/Renewal", "Tax & VAT", "Donation & Subscription", "Depreciation", "Miscellaneous Expense",
  "Fuel & Lubricants (Generator/Vehicle)", "Vehicle Maintenance"
];

export default function AccountsPage() {
  const { user, token: ctxToken } = useAuth();
  const getAuthToken = useCallback(() => {
    return ctxToken || Cookies.get('token') || (typeof window !== 'undefined' ? (localStorage.getItem('erp_token') || localStorage.getItem('token')) : '') || '';
  }, [ctxToken]);

  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    company_name: 'AOD',
    expense_head: EXPENSE_HEADS[0],
    amount: '',
    description: '',
    payment_method: 'Cash'
  });

  function showToast(m: string) {
    setToastMsg(m);
    setTimeout(() => setToastMsg(''), 2500);
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || isNaN(Number(formData.amount))) {
      showToast('Please enter a valid amount.');
      return;
    }
    
    setLoading(true);
    try {
      const token = getAuthToken();
      const payload = {
        amount: Number(formData.amount),
        description: formData.description,
        expense_date: formData.date,
        company_name: formData.company_name,
        expense_head: formData.expense_head,
        payment_method: formData.payment_method,
        entered_by: user?.id,
        category_id: null // Not using categories table anymore
      };

      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save entry');
      }

      showToast('Expense recorded successfully!');
      setFormData({
        ...formData,
        amount: '',
        description: ''
      });
    } catch (error: any) {
      showToast(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Topbar title="Accounts (Quick Entry)" />
      {toastMsg && (
        <div className="toast-notification">
          {toastMsg}
        </div>
      )}
      <div className="layout-content">
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Quick Entry</h2>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            <div className="fg">
              <label>Date</label>
              <input type="date" name="date" value={formData.date} onChange={handleChange} required />
            </div>

            <div className="fg">
              <label>Company Name</label>
              <select name="company_name" value={formData.company_name} onChange={handleChange} required>
                <option value="AOD">AOD</option>
                <option value="GSBD">GSBD</option>
              </select>
            </div>

            <div className="fg">
              <label>Expense Head</label>
              <select name="expense_head" value={formData.expense_head} onChange={handleChange} required>
                {EXPENSE_HEADS.map(head => (
                  <option key={head} value={head}>{head}</option>
                ))}
              </select>
            </div>

            <div className="fg">
              <label>Amount (৳)</label>
              <input type="number" name="amount" placeholder="e.g. 5000" value={formData.amount} onChange={handleChange} required min="0" step="0.01" />
            </div>

            <div className="fg">
              <label>Payment Method</label>
              <select name="payment_method" value={formData.payment_method} onChange={handleChange} required>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>

            <div className="fg">
              <label>Description (Optional)</label>
              <textarea name="description" placeholder="Short details..." value={formData.description} onChange={handleChange} rows={3}></textarea>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={loading}>
              {loading ? 'Saving...' : 'Save Entry'}
            </button>

          </form>
        </div>
      </div>
    </>
  );
}
