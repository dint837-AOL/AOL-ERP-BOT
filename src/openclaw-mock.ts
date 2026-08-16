import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const db = new sqlite3.Database('./openclaw.db');

function initDB() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT DEFAULT '',
      role TEXT DEFAULT 'Employee',
      avatar_color TEXT DEFAULT '#4f7eff',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    // Migrate: add email if missing (for existing DBs)
    db.run(`ALTER TABLE members ADD COLUMN email TEXT DEFAULT ''`, () => {});
    db.run(`CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER REFERENCES members(id),
      phone_number TEXT,
      action_type TEXT CHECK(action_type IN ('IN','OUT')) NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      deadline TEXT,
      task_date TEXT NOT NULL,
      priority TEXT CHECK(priority IN ('RED','ORANGE','GREEN')) DEFAULT 'GREEN',
      status TEXT CHECK(status IN ('PENDING','DONE','DUE')) DEFAULT 'PENDING',
      assigned_to INTEGER REFERENCES members(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS leave_requests (
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
    db.run(`CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      budget_limit REAL DEFAULT 0,
      color TEXT DEFAULT '#4f7eff'
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER REFERENCES expense_categories(id),
      amount REAL NOT NULL,
      description TEXT DEFAULT '',
      entered_by INTEGER REFERENCES members(id),
      expense_date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
      // Seed default categories if empty
      db.get('SELECT COUNT(*) as c FROM expense_categories', [], (_, row: any) => {
        if (row?.c === 0) {
          const cats = [
            ['IT & Software', 50000, '#4f7eff'],
            ['Office Supplies', 20000, '#2dd4a0'],
            ['Travel', 30000, '#ff9f40'],
            ['Marketing', 40000, '#a78bfa'],
            ['Utilities', 15000, '#f472b6'],
            ['Miscellaneous', 10000, '#8890a8'],
          ];
          cats.forEach(([n, b, c]) => db.run('INSERT OR IGNORE INTO expense_categories (name,budget_limit,color) VALUES(?,?,?)', [n, b, c]));
        }
      });
    });
  });
  console.log('Database initialized.');
}

// Promise helpers
const dbAll = (sql: string, p: any[] = []) => new Promise<any[]>((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
const dbGet = (sql: string, p: any[] = []) => new Promise<any>((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const dbRun = (sql: string, p: any[] = []) => new Promise<{ lastID: number }>((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res({ lastID: this.lastID }); }));

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
    initDB();

    // ── MEMBERS ──────────────────────────────────────────────
    this.app.get('/api/members', async (_, res) => res.json(await dbAll('SELECT * FROM members ORDER BY name')));
    this.app.post('/api/members', async (req, res) => {
      const { name, email, role, avatar_color } = req.body;
      if (!name) return res.status(400).json({ error: 'Name required' });
      const colors = ['#4f7eff','#2dd4a0','#ff4d6a','#ff9f40','#a78bfa','#f472b6'];
      const color = avatar_color || colors[Math.floor(Math.random() * colors.length)];
      const { lastID } = await dbRun('INSERT INTO members(name,email,role,avatar_color) VALUES(?,?,?,?)', [name, email||'', role||'Employee', color]);
      res.status(201).json(await dbGet('SELECT * FROM members WHERE id=?', [lastID]));
    });
    this.app.delete('/api/members/:id', async (req, res) => { await dbRun('DELETE FROM members WHERE id=?', [req.params.id]); res.json({ ok: true }); });

    // ── TASKS ────────────────────────────────────────────────
    this.app.get('/api/tasks', async (req, res) => {
      const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];
      await dbRun(`UPDATE tasks SET status='DUE' WHERE status='PENDING' AND task_date < ?`, [today]);
      res.json(await dbAll(`SELECT t.*,m.name as assignee_name,m.avatar_color as assignee_color FROM tasks t LEFT JOIN members m ON t.assigned_to=m.id WHERE t.task_date=? ORDER BY t.created_at DESC`, [date]));
    });
    this.app.post('/api/tasks', async (req, res) => {
      const { title, description, deadline, priority, assigned_to, task_date } = req.body;
      if (!title) return res.status(400).json({ error: 'Title required' });
      const date = task_date || new Date().toISOString().split('T')[0];
      const { lastID } = await dbRun(`INSERT INTO tasks(title,description,deadline,priority,assigned_to,task_date) VALUES(?,?,?,?,?,?)`,
        [title, description||'', deadline||null, priority||'GREEN', assigned_to||null, date]);
      res.status(201).json(await dbGet(`SELECT t.*,m.name as assignee_name,m.avatar_color as assignee_color FROM tasks t LEFT JOIN members m ON t.assigned_to=m.id WHERE t.id=?`, [lastID]));
    });
    this.app.patch('/api/tasks/:id', async (req, res) => {
      const { status, priority, title, description, deadline, assigned_to } = req.body;
      await dbRun(`UPDATE tasks SET status=COALESCE(?,status),priority=COALESCE(?,priority),title=COALESCE(?,title),description=COALESCE(?,description),deadline=COALESCE(?,deadline),assigned_to=COALESCE(?,assigned_to) WHERE id=?`,
        [status, priority, title, description, deadline, assigned_to, req.params.id]);
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
