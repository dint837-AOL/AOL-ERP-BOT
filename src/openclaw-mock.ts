/**
 * openclaw-mock.ts
 * 
 * Central API router and Database controller for AlliedOne ERP.
 * Exposes REST APIs for Mobile Apps and Web Clients.
 * Contains:
 *  - SQLite database schemas and queries
 *  - Express route handlers for all modules (HR, Accounts, Tenders, Meetings, etc.)
 *  - 1-minute precision cron jobs for reminders and alerts
 * 
 * NOTE: Fully maintainable and designed to be scalable for future Mobile App transitions.
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

let db: Database;

// Add default secret if not provided
const JWT_SECRET = process.env.JWT_SECRET || 'alliedone_super_secret_key_123!';

async function initDB() {
  db = await open({
    filename: './openclaw.db',
    driver: sqlite3.Database
  });

  await db.exec(`CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT DEFAULT '',
    password_hash TEXT DEFAULT '',
    role TEXT DEFAULT 'Employee',
    avatar_color TEXT DEFAULT '#4f7eff',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  try { await db.exec(`ALTER TABLE members ADD COLUMN email TEXT DEFAULT ''`); } catch (e) {}
  try { await db.exec(`ALTER TABLE members ADD COLUMN password_hash TEXT DEFAULT ''`); } catch (e) {}
  
  // Seed initial Admin if members table is empty
  const memberCountRow = await db.get('SELECT COUNT(*) as count FROM members') as any;
  if (memberCountRow && memberCountRow.count === 0) {
    const defaultPasswordHash = await bcrypt.hash('password123', 10);
    await db.run(`
      INSERT INTO members (name, email, password_hash, role, avatar_color)
      VALUES (?, ?, ?, ?, ?)
    `, ['System Admin', 'admin@alliedone.com', defaultPasswordHash, 'Admin', '#ff4d4f']);
    console.log('✅ Created default Admin user (admin@alliedone.com / password123)');
  }
  
  await db.exec(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER REFERENCES members(id),
    phone_number TEXT,
    action_type TEXT CHECK(action_type IN ('IN','OUT')) NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.exec(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    action_type TEXT DEFAULT 'ASSIGN',
    recipient TEXT DEFAULT '',
    deadline TEXT,
    task_date TEXT NOT NULL,
    priority TEXT DEFAULT 'GREEN',
    status TEXT DEFAULT 'DONE',
    assigned_to INTEGER REFERENCES members(id),
    is_archived INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // Migrations for tasks table
  try { await db.exec(`ALTER TABLE tasks ADD COLUMN action_type TEXT DEFAULT 'ASSIGN'`); } catch (e) {}
  try { await db.exec(`ALTER TABLE tasks ADD COLUMN recipient TEXT DEFAULT ''`); } catch (e) {}
  try { await db.exec(`ALTER TABLE tasks ADD COLUMN is_archived INTEGER DEFAULT 0`); } catch (e) {}
  try {
    const tableSql: any = await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'");
    if (tableSql && tableSql.sql && tableSql.sql.includes("CHECK(status IN ('PENDING','DONE','DUE'))")) {
      await db.exec(`
        CREATE TABLE tasks_temp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT DEFAULT '',
          action_type TEXT DEFAULT 'ASSIGN',
          recipient TEXT DEFAULT '',
          deadline TEXT,
          task_date TEXT NOT NULL,
          priority TEXT DEFAULT 'GREEN',
          status TEXT DEFAULT 'DONE',
          assigned_to INTEGER REFERENCES members(id),
          is_archived INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO tasks_temp SELECT id, title, description, action_type, recipient, deadline, task_date, priority, CASE WHEN status='DUE' THEN 'WIP' ELSE status END, assigned_to, is_archived, created_at FROM tasks;
        DROP TABLE tasks;
        ALTER TABLE tasks_temp RENAME TO tasks;
      `);
    }
  } catch (e) {}
  await db.exec(`CREATE TABLE IF NOT EXISTS leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES members(id),
    leave_type TEXT CHECK(leave_type IN ('SICK','CASUAL','ANNUAL')) NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    reason TEXT DEFAULT '',
    status TEXT CHECK(status IN ('PENDING','APPROVED','REJECTED')) DEFAULT 'PENDING',
    reviewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.exec(`CREATE TABLE IF NOT EXISTS expense_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    budget_limit REAL DEFAULT 0,
    color TEXT DEFAULT '#4f7eff'
  )`);
  await db.exec(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER REFERENCES expense_categories(id),
    amount REAL NOT NULL,
    description TEXT DEFAULT '',
    entered_by INTEGER REFERENCES members(id),
    expense_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const row = await db.get('SELECT COUNT(*) as c FROM expense_categories') as any;
  if (row?.c === 0) {
    const cats = [
      ['IT & Software', 50000, '#4f7eff'],
      ['Office Supplies', 20000, '#2dd4a0'],
      ['Travel', 30000, '#ff9f40'],
      ['Marketing', 40000, '#a78bfa'],
      ['Utilities', 15000, '#f472b6'],
      ['Miscellaneous', 10000, '#8890a8'],
    ];
    for (const [n, b, c] of cats) {
      await db.run('INSERT OR IGNORE INTO expense_categories (name,budget_limit,color) VALUES(?,?,?)', [n, b, c]);
    }
  }

  await db.exec('DROP TABLE IF EXISTS it_assets');
  await db.exec('DROP TABLE IF EXISTS password_reminders');
  await db.exec(`CREATE TABLE IF NOT EXISTS credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cred_type TEXT DEFAULT 'OTHER',
    url TEXT DEFAULT '',
    username TEXT DEFAULT '',
    cost REAL DEFAULT 0,
    expiry_date TEXT,
    last_changed_date TEXT,
    reminder_days_before TEXT DEFAULT '5,2,1',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.exec(`CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    contact_name TEXT DEFAULT '',
    scheduled_at DATETIME NOT NULL,
    reminder_minutes_before TEXT DEFAULT '30,15',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.exec(`CREATE TABLE IF NOT EXISTS tenders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    organization TEXT DEFAULT '',
    tender_type TEXT CHECK(tender_type IN ('GOVT','PRIVATE')) DEFAULT 'PRIVATE',
    published_date TEXT,
    submission_deadline TEXT NOT NULL,
    estimated_value REAL DEFAULT 0,
    status TEXT CHECK(status IN ('UPCOMING','IN_PROGRESS','SUBMITTED','WON','LOST')) DEFAULT 'UPCOMING',
    documents_url TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    assigned_to INTEGER REFERENCES members(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log('Database initialized.');
}

// Promise helpers
export const dbAll = async (sql: string, p: any[] = []) => db.all(sql, p.map(v => v === undefined ? null : v));
export const dbGet = async (sql: string, p: any[] = []) => db.get(sql, p.map(v => v === undefined ? null : v));
export const dbRun = async (sql: string, p: any[] = []) => { const info = await db.run(sql, p.map(v => v === undefined ? null : v)); return { lastID: info.lastID }; };

export class WhatsAppGateway { config: any; constructor(c: any) { this.config = c; } }
export class Tool { config: any; constructor(c: any) { this.config = c; } }

export class OpenClaw {
  config: any; systemPrompt = ''; app: express.Application; tools: Tool[];
  constructor(config: any) {
    this.config = config; this.tools = config.tools || [];
    this.app = express();
    this.app.use(express.json());
    this.app.get('/', (req, res) => res.redirect('/dashboard'));
    this.app.use(express.static(path.join(__dirname, '../public')));
  }
  setSystemPrompt(p: string) { this.systemPrompt = p; }

  async start(port: number, listen = true) {
    await initDB();

    // ── AUTH MIDDLEWARES ─────────────────────────────────────
    const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      if (!token) return res.status(401).json({ error: 'Access denied. Token required.' });

      jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
        (req as any).user = user;
        next();
      });
    };

    const requireRole = (role: string) => {
      return (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const user = (req as any).user;
        if (!user || user.role !== role) {
          return res.status(403).json({ error: `Access denied. ${role} role required.` });
        }
        next();
      };
    };

    // ── AUTH ENDPOINTS ───────────────────────────────────────
    this.app.post('/api/auth/login', async (req, res) => {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

      try {
        const member = await dbGet('SELECT * FROM members WHERE email = ?', [email]) as any;
        if (!member) return res.status(401).json({ error: 'Invalid credentials' });

        const validPassword = await bcrypt.compare(password, member.password_hash || '');
        if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: member.id, email: member.email, role: member.role, name: member.name }, JWT_SECRET, { expiresIn: '7d' });
        
        // Remove password hash from response
        const { password_hash, ...memberData } = member;
        res.json({ token, user: memberData });
      } catch (err: any) {
        res.status(500).json({ error: 'Login failed', details: err.message });
      }
    });

    // ── MEMBERS ──────────────────────────────────────────────
    // Protected by authenticateToken
    this.app.use('/api', (req, res, next) => {
      if (req.path.startsWith('/auth/login')) return next();
      authenticateToken(req, res, next);
    });

    this.app.get('/api/members', async (_, res) => res.json(await dbAll('SELECT id, name, email, role, avatar_color, created_at FROM members ORDER BY name')));
    
    // Only Admin can add members
    this.app.post('/api/members', requireRole('Admin'), async (req, res) => {
      const { name, email, role, avatar_color, password } = req.body;
      if (!name) return res.status(400).json({ error: 'Name required' });
      const colors = ['#4f7eff','#2dd4a0','#ff4d6a','#ff9f40','#a78bfa','#f472b6'];
      const color = avatar_color || colors[Math.floor(Math.random() * colors.length)];
      
      const pwdHash = password ? await bcrypt.hash(password, 10) : await bcrypt.hash('password123', 10);
      
      const { lastID } = await dbRun('INSERT INTO members(name,email,role,avatar_color,password_hash) VALUES(?,?,?,?,?)', [name, email||'', role||'Employee', color, pwdHash]);
      res.json({ id: lastID });
    });
    // Only Admin can edit members
    this.app.put('/api/members/:id', requireRole('Admin'), async (req, res) => {
      const { name, email, role, password } = req.body;
      if (!name) return res.status(400).json({ error: 'Name required' });
      
      if (password) {
        const pwdHash = await bcrypt.hash(password, 10);
        await dbRun('UPDATE members SET name=?, email=?, role=?, password_hash=? WHERE id=?', [name, email || '', role || 'Employee', pwdHash, req.params.id]);
      } else {
        await dbRun('UPDATE members SET name=?, email=?, role=? WHERE id=?', [name, email || '', role || 'Employee', req.params.id]);
      }
      res.json({ success: true });
    });
    // Only Admin can delete members
    this.app.delete('/api/members/:id', requireRole('Admin'), async (req, res) => {
      // Unassign tasks assigned to this member
      await dbRun('UPDATE tasks SET assigned_to = NULL WHERE assigned_to = ?', [req.params.id]);
      
      // We'll leave attendance/leave records alone or maybe they should cascade, but for now just delete the member
      await dbRun('DELETE FROM members WHERE id=?', [req.params.id]);
      res.json({ success: true });
    });

    // ── TASKS ────────────────────────────────────────────────
    this.app.get('/api/tasks', async (req, res) => {
      const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const includeArchived = req.query.archived === 'true';
      const archivedFilter = includeArchived ? 't.is_archived=1' : '(t.is_archived=0 OR t.is_archived IS NULL)';
      res.json(await dbAll(`SELECT t.*,m.name as assignee_name,m.avatar_color as assignee_color FROM tasks t LEFT JOIN members m ON t.assigned_to=m.id WHERE date(t.task_date)=date(?) AND ${archivedFilter} ORDER BY t.created_at DESC`, [date]));
    });
    this.app.post('/api/tasks', async (req, res) => {
      const { title, description, deadline, priority, assigned_to, task_date, action_type, recipient, status } = req.body;
      if (!title) return res.status(400).json({ error: 'Title required' });
      const date = task_date || new Date().toISOString().split('T')[0];
      const { lastID } = await dbRun(`INSERT INTO tasks(title,description,deadline,priority,assigned_to,task_date,action_type,recipient,status) VALUES(?,?,?,?,?,?,?,?,?)`,
        [title, description||'', deadline||null, priority||'GREEN', assigned_to||null, date, action_type||'ASSIGN', recipient||'', status||'DONE']);
      res.status(201).json(await dbGet(`SELECT t.*,m.name as assignee_name,m.avatar_color as assignee_color FROM tasks t LEFT JOIN members m ON t.assigned_to=m.id WHERE t.id=?`, [lastID]));
    });
    this.app.patch('/api/tasks/:id', async (req, res) => {
      const allowed = ['status', 'priority', 'title', 'description', 'deadline', 'assigned_to', 'action_type', 'recipient', 'is_archived'];
      const updates: string[] = [];
      const values: any[] = [];
      for (const key of allowed) {
        if (key in req.body) {
          updates.push(`${key} = ?`);
          values.push(req.body[key] ?? null);
        }
      }
      if (updates.length > 0) {
        values.push(req.params.id);
        await dbRun(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, values);
      }
      res.json(await dbGet(`SELECT t.*,m.name as assignee_name,m.avatar_color as assignee_color FROM tasks t LEFT JOIN members m ON t.assigned_to=m.id WHERE t.id=?`, [req.params.id]));
    });
    this.app.delete('/api/tasks/:id', async (req, res) => { await dbRun('DELETE FROM tasks WHERE id=?', [req.params.id]); res.json({ ok: true }); });

    // ── ATTENDANCE ───────────────────────────────────────────
    this.app.get('/api/attendance', async (req, res) => {
      const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
      res.json(await dbAll(`SELECT a.*,m.name as member_name,m.avatar_color FROM attendance a LEFT JOIN members m ON a.member_id=m.id WHERE date(a.timestamp)=? ORDER BY a.timestamp DESC`, [date]));
    });
    this.app.post('/api/attendance', async (req, res) => {
      const { member_id, action_type } = req.body;
      if (!action_type || !['IN','OUT'].includes(action_type)) return res.status(400).json({ error: 'action_type must be IN or OUT' });
      const { lastID } = await dbRun('INSERT INTO attendance(member_id,action_type) VALUES(?,?)', [member_id||null, action_type]);
      res.status(201).json(await dbGet(`SELECT a.*,m.name as member_name FROM attendance a LEFT JOIN members m ON a.member_id=m.id WHERE a.id=?`, [lastID]));
    });

    // ── LEAVE ────────────────────────────────────────────────
    this.app.get('/api/leaves', async (_, res) => res.json(await dbAll(`SELECT l.*,m.name as member_name,m.avatar_color FROM leave_requests l JOIN members m ON l.member_id=m.id ORDER BY l.created_at DESC`)));
    this.app.post('/api/leaves', async (req, res) => {
      const { member_id, leave_type, start_date, end_date, reason } = req.body;
      if (!member_id || !leave_type || !start_date || !end_date) return res.status(400).json({ error: 'Missing required fields' });
      const { lastID } = await dbRun(`INSERT INTO leave_requests(member_id,leave_type,start_date,end_date,reason) VALUES(?,?,?,?,?)`, [member_id, leave_type, start_date, end_date, reason||'']);
      res.status(201).json(await dbGet(`SELECT l.*,m.name as member_name FROM leave_requests l JOIN members m ON l.member_id=m.id WHERE l.id=?`, [lastID]));
    });
    this.app.patch('/api/leaves/:id', async (req, res) => {
      const { status } = req.body;
      await dbRun(`UPDATE leave_requests SET status=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`, [status, req.params.id]);
      res.json(await dbGet('SELECT * FROM leave_requests WHERE id=?', [req.params.id]));
    });

    // ── EXPENSES ─────────────────────────────────────────────
    this.app.get('/api/expense-categories', async (_, res) => res.json(await dbAll('SELECT * FROM expense_categories ORDER BY name')));
    this.app.get('/api/expenses', async (req, res) => {
      const month = (req.query.month as string) || new Date().toISOString().substring(0, 7);
      res.json(await dbAll(`SELECT e.*,c.name as category_name,c.color as category_color,c.budget_limit,m.name as member_name FROM expenses e LEFT JOIN expense_categories c ON e.category_id=c.id LEFT JOIN members m ON e.entered_by=m.id WHERE e.expense_date LIKE ? ORDER BY e.expense_date DESC`, [month+'%']));
    });
    this.app.get('/api/expenses/summary', async (req, res) => {
      const month = (req.query.month as string) || new Date().toISOString().substring(0, 7);
      res.json(await dbAll(`SELECT c.id,c.name,c.color,c.budget_limit,COALESCE(SUM(e.amount),0) as total FROM expense_categories c LEFT JOIN expenses e ON e.category_id=c.id AND e.expense_date LIKE ? GROUP BY c.id ORDER BY total DESC`, [month+'%']));
    });
    this.app.post('/api/expenses', async (req, res) => {
      const { category_id, amount, description, entered_by, expense_date } = req.body;
      if (!amount || !category_id) return res.status(400).json({ error: 'amount and category_id required' });
      const date = expense_date || new Date().toISOString().split('T')[0];
      const { lastID } = await dbRun(`INSERT INTO expenses(category_id,amount,description,entered_by,expense_date) VALUES(?,?,?,?,?)`, [category_id, amount, description||'', entered_by||null, date]);
      res.status(201).json(await dbGet('SELECT e.*,c.name as category_name FROM expenses e LEFT JOIN expense_categories c ON e.category_id=c.id WHERE e.id=?', [lastID]));
    });
    this.app.delete('/api/expenses/:id', async (req, res) => { await dbRun('DELETE FROM expenses WHERE id=?', [req.params.id]); res.json({ ok: true }); });

    // ── CREDENTIALS ──────────────────────────────────────────
    this.app.get('/api/credentials', async (_, res) => res.json(await dbAll('SELECT * FROM credentials ORDER BY created_at DESC')));
    this.app.post('/api/credentials', async (req, res) => {
      const { name, cred_type, url, username, cost, expiry_date, last_changed_date, reminder_days_before } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const { lastID } = await dbRun(
        `INSERT INTO credentials(name,cred_type,url,username,cost,expiry_date,last_changed_date,reminder_days_before) VALUES(?,?,?,?,?,?,?,?)`, 
        [name, cred_type||'OTHER', url||'', username||'', cost||0, expiry_date||null, last_changed_date||null, reminder_days_before||'5,2,1']
      );
      res.status(201).json(await dbGet('SELECT * FROM credentials WHERE id=?', [lastID]));
    });
    this.app.delete('/api/credentials/:id', async (req, res) => { await dbRun('DELETE FROM credentials WHERE id=?', [req.params.id]); res.json({ ok: true }); });

    // ── MEETINGS ─────────────────────────────────────────────
    this.app.get('/api/meetings', async (_, res) => res.json(await dbAll('SELECT * FROM meetings ORDER BY scheduled_at ASC')));
    this.app.post('/api/meetings', async (req, res) => {
      const { title, contact_name, scheduled_at, reminder_minutes_before } = req.body;
      if (!title || !scheduled_at) return res.status(400).json({ error: 'Title and scheduled_at required' });
      const { lastID } = await dbRun(
        `INSERT INTO meetings(title,contact_name,scheduled_at,reminder_minutes_before) VALUES(?,?,?,?)`, 
        [title, contact_name||'', scheduled_at, reminder_minutes_before||'30,15']
      );
      res.status(201).json(await dbGet('SELECT * FROM meetings WHERE id=?', [lastID]));
    });
    this.app.delete('/api/meetings/:id', async (req, res) => { await dbRun('DELETE FROM meetings WHERE id=?', [req.params.id]); res.json({ ok: true }); });

    // ── TENDERS ──────────────────────────────────────────────
    this.app.get('/api/tenders', async (_, res) => res.json(await dbAll('SELECT * FROM tenders ORDER BY submission_deadline ASC')));
    this.app.post('/api/tenders', async (req, res) => {
      const { title, organization, tender_type, published_date, submission_deadline, estimated_value, status, documents_url, notes, assigned_to } = req.body;
      if (!title || !submission_deadline) return res.status(400).json({ error: 'Title and deadline required' });
      const { lastID } = await dbRun(
        `INSERT INTO tenders(title, organization, tender_type, published_date, submission_deadline, estimated_value, status, documents_url, notes, assigned_to) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [title, organization||'', tender_type||'PRIVATE', published_date||null, submission_deadline, estimated_value||0, status||'UPCOMING', documents_url||'', notes||'', assigned_to||null]
      );
      res.status(201).json(await dbGet('SELECT * FROM tenders WHERE id=?', [lastID]));
    });
    this.app.patch('/api/tenders/:id/status', async (req, res) => {
      const { status } = req.body;
      await dbRun('UPDATE tenders SET status=? WHERE id=?', [status, req.params.id]);
      res.json(await dbGet('SELECT * FROM tenders WHERE id=?', [req.params.id]));
    });
    this.app.delete('/api/tenders/:id', async (req, res) => { await dbRun('DELETE FROM tenders WHERE id=?', [req.params.id]); res.json({ ok: true }); });

    // ── CHAT (Attendance Simulator) ──────────────────────────
    this.app.post('/api/chat', async (req, res) => {
      const msg = req.body.message.toLowerCase();
      let reply = "I am the ERP assistant. Try: 'I just arrived' or 'heading home now'.";
      const tool = this.tools.find(t => t.config.name === 'log_attendance');
      if (tool) {
        if (/\b(in|office|arrived|morning|check.?in)\b/.test(msg)) {
          try { await tool.config.execute({ action_type: 'IN', phone_number: '+8801736635727' }); reply = "Good morning! Check-in logged."; } catch (e) { reply = String(e); }
        } else if (/\b(out|home|leave|bye|check.?out|clocking)\b/.test(msg)) {
          try { await tool.config.execute({ action_type: 'OUT', phone_number: '+8801736635727' }); reply = "Goodbye! Check-out logged."; } catch (e) { reply = String(e); }
        }
      }
      res.json({ reply });
    });

    // ── CRON: Automated Reminder Engine (Every 1 Minute) ───────
    const runCron = async () => {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0]!;
      const today = new Date(todayStr);

      // 1. Check Credentials (run once a day logically, but checked here)
      // To prevent spamming every minute, we'll only print credential alerts if the time is exactly 09:00, 
      // but for this mock, we'll just check them (in reality you'd track 'last_alerted' in DB).
      // Since it's a mock, we will just evaluate the logic and let the user see it.
      const creds = await dbAll('SELECT * FROM credentials') as any[];
      for (const c of creds) {
        if (!c.reminder_days_before) continue;
        const daysToAlert = c.reminder_days_before.split(',').map((d: string) => parseInt(d.trim()));
        
        // Expiry alerts
        if (c.expiry_date) {
          const exp = new Date(c.expiry_date);
          const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (daysToAlert.includes(diffDays)) {
            // We'll log it if the current minute is 00 (top of the hour) to avoid spamming the console
            if (now.getMinutes() === 0) console.log(`[ALERT] Credential '${c.name}' expires in ${diffDays} day(s)!`);
          }
        }
      }

      // 2. Check Meetings (minute-level precision)
      const meetings = await dbAll('SELECT * FROM meetings') as any[];
      for (const m of meetings) {
        if (!m.reminder_minutes_before) continue;
        const minutesToAlert = m.reminder_minutes_before.split(',').map((minuteStr: string) => parseInt(minuteStr.trim()));
        
        const scheduledTime = new Date(m.scheduled_at);
        const diffMinutes = Math.floor((scheduledTime.getTime() - now.getTime()) / (1000 * 60));
        
        if (minutesToAlert.includes(diffMinutes)) {
          // Exact minute match!
          console.log(`[ALERT] Meeting '${m.title}' with ${m.contact_name} is in exactly ${diffMinutes} minutes!`);
        }
      }

      // 3. Check Tenders (daily precision for 7, 3, 1 days)
      const tenders = await dbAll('SELECT * FROM tenders') as any[];
      for (const t of tenders) {
        if (!t.submission_deadline || ['SUBMITTED','WON','LOST'].includes(t.status)) continue;
        const deadline = new Date(t.submission_deadline);
        const diffDays = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if ([7, 3, 1].includes(diffDays)) {
          if (now.getMinutes() === 0) console.log(`[ALERT] Tender '${t.title}' submission is due in ${diffDays} day(s)!`);
        }
      }
    };
    
    // Run on startup then every 1 minute
    runCron();
    setInterval(runCron, 60 * 1000);

    return new Promise<void>(resolve => {
      if (!listen) return resolve();
      this.app.listen(port, () => {
        console.log('='.repeat(60));
        console.log('ALLIEDONE ERP SYSTEM READY');
        console.log(`Dashboard  → http://localhost:${port}/dashboard.html`);
        console.log(`HR Page    → http://localhost:${port}/hr.html`);
        console.log(`Accounts   → http://localhost:${port}/accounts.html`);
        console.log('='.repeat(60));
        resolve();
      });
    });
  }
}
