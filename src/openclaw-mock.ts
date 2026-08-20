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

export function getCleanClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.headers['cf-connecting-ip'];
  let rawIp = '';
  if (typeof forwarded === 'string') {
    rawIp = (forwarded.split(',')[0] || '').trim();
  } else if (Array.isArray(forwarded) && forwarded.length > 0) {
    rawIp = String(forwarded[0] || '').trim();
  } else {
    rawIp = req.socket?.remoteAddress || '';
  }
  if (rawIp.startsWith('::ffff:')) {
    rawIp = rawIp.substring(7);
  }
  if (!rawIp || rawIp === '::1') {
    rawIp = '127.0.0.1';
  }
  return rawIp;
}

export function isIpMatching(clientIp: string, allowedIpsStr: string): boolean {
  if (!clientIp || !allowedIpsStr) return false;
  const list = allowedIpsStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const cleanClient = clientIp.toLowerCase();
  for (const item of list) {
    if (item === cleanClient) return true;
    if ((item === '127.0.0.1' || item === '::1' || item === 'localhost') && (cleanClient === '127.0.0.1' || cleanClient === '::1')) return true;
    if (item.endsWith('*') && cleanClient.startsWith(item.slice(0, -1))) return true;
    if (item.endsWith('.') && cleanClient.startsWith(item)) return true;
  }
  return false;
}

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
  
  // Always ensure default Admin and Employee accounts exist with correct passwords
  const adminHash    = await bcrypt.hash('Admin@123', 10);
  const employeeHash = await bcrypt.hash('Employee@123', 10);

  const defaultAccounts = [
    { name: 'System Admin', email: 'admin@alliedone.com', role: 'Admin', color: '#ff4d4f', hash: adminHash },
    { name: 'Ahsan Kabir', email: 'ahsankabir@alliedone.com', role: 'Employee', color: '#a78bfa', hash: employeeHash },
    { name: 'Tajimur Rafi', email: 'rafi@alliedone.com', role: 'Employee', color: '#4f7eff', hash: employeeHash },
    { name: 'Orko', email: 'orko@alliedone.com', role: 'Employee', color: '#26c486', hash: employeeHash },
    { name: 'Kamrul Islam', email: 'kamrul@alliedone.com', role: 'Employee', color: '#f5a623', hash: employeeHash },
  ];

  for (const acc of defaultAccounts) {
    const existing = await db.get('SELECT id FROM members WHERE LOWER(TRIM(email)) = LOWER(?)', [acc.email]) as any;
    if (!existing) {
      await db.run(
        `INSERT INTO members (name, email, password_hash, role, avatar_color) VALUES (?, ?, ?, ?, ?)`,
        [acc.name, acc.email, acc.hash, acc.role, acc.color]
      );
    } else {
      await db.run(
        `UPDATE members SET password_hash = ?, role = ?, name = ? WHERE id = ?`,
        [acc.hash, acc.role, acc.name, existing.id]
      );
    }
  }
  console.log('Default credentials verified and ready.');


  
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

  // Settings table for Wi-Fi IP and system configs
  await db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // Active Wi-Fi presence sessions
  await db.exec(`CREATE TABLE IF NOT EXISTS active_sessions (
    member_id INTEGER PRIMARY KEY,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip TEXT,
    is_wifi INTEGER DEFAULT 1,
    hostname TEXT DEFAULT '',
    os_name TEXT DEFAULT '',
    device_type TEXT DEFAULT 'BROWSER'
  )`);
  try { await db.exec(`ALTER TABLE active_sessions ADD COLUMN hostname TEXT DEFAULT ''`); } catch (e) {}
  try { await db.exec(`ALTER TABLE active_sessions ADD COLUMN os_name TEXT DEFAULT ''`); } catch (e) {}
  try { await db.exec(`ALTER TABLE active_sessions ADD COLUMN device_type TEXT DEFAULT 'BROWSER'`); } catch (e) {}

  // Seed default settings if missing
  const settingsRows = await db.all('SELECT key FROM settings') as any[];
  const existingSettingsKeys = new Set(settingsRows.map(r => r.key));
  if (!existingSettingsKeys.has('office_wifi_ip')) {
    await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['office_wifi_ip', '127.0.0.1,::1']);
  }
  if (!existingSettingsKeys.has('office_wifi_name')) {
    await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['office_wifi_name', 'AlliedOne Office Wi-Fi']);
  }
  if (!existingSettingsKeys.has('wifi_auto_attendance_enabled')) {
    await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['wifi_auto_attendance_enabled', 'true']);
  }
  if (!existingSettingsKeys.has('auto_checkout_timeout_minutes')) {
    await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['auto_checkout_timeout_minutes', '10']);
  }

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
      let token = '';
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1] || '';
      } else if (authHeader) {
        token = authHeader;
      }

      // Check cookie header if not in Authorization header
      if (!token && req.headers.cookie) {
        const cookieMatch = req.headers.cookie.match(/(?:^|;\s*)token=([^;]+)/);
        if (cookieMatch && cookieMatch[1]) {
          token = decodeURIComponent(cookieMatch[1]);
        }
      }

      // Check query or body token fallback
      if (!token && req.query?.token) {
        token = String(req.query.token);
      }
      if (!token && req.body?.token) {
        token = String(req.body.token);
      }

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
      const cleanEmail = (email || '').trim().toLowerCase();
      const cleanPassword = (password || '').trim();
      if (!cleanEmail || !cleanPassword) return res.status(400).json({ error: 'Email and password required' });

      try {
        const member = await dbGet('SELECT * FROM members WHERE LOWER(TRIM(email)) = ?', [cleanEmail]) as any;
        if (!member) return res.status(401).json({ error: 'Invalid credentials' });

        const validPassword = await bcrypt.compare(cleanPassword, member.password_hash || '');
        if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: member.id, email: member.email, role: member.role, name: member.name }, JWT_SECRET, { expiresIn: '7d' });
        
        // Remove password hash from response
        const { password_hash, ...memberData } = member;
        res.json({ token, user: memberData });
      } catch (err: any) {
        res.status(500).json({ error: 'Login failed', details: err.message });
      }
    });

    // ── AUTH MIDDLEWARE FILTER ──────────────────────────────
    // Protected by authenticateToken, bypassing login, public network probes and settings query
    this.app.use('/api', (req, res, next) => {
      if (
        req.path.startsWith('/auth/login') ||
        req.path.startsWith('/attendance/wifi-webhook') ||
        req.path.startsWith('/attendance/wifi-status') ||
        req.path.startsWith('/attendance/client-ping') ||
        req.path.startsWith('/attendance/download-script') ||
        req.path.startsWith('/settings/wifi')
      ) {
        return next();
      }
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
    // Monthly attendance for a specific member (used by HR calendar)
    this.app.get('/api/attendance/monthly', async (req, res) => {
      const { member_id, month } = req.query as { member_id: string; month: string };
      if (!member_id || !month) return res.status(400).json({ error: 'member_id and month (YYYY-MM) required' });
      const rows = await dbAll(
        `SELECT date(a.timestamp) as att_date, a.action_type, a.timestamp
         FROM attendance a
         WHERE a.member_id=? AND strftime('%Y-%m', a.timestamp)=?
         ORDER BY a.timestamp ASC`,
        [member_id, month]
      );
      res.json(rows);
    });
    this.app.post('/api/attendance', async (req, res) => {
      const { member_id, action_type } = req.body;
      if (!action_type || !['IN','OUT'].includes(action_type)) return res.status(400).json({ error: 'action_type must be IN or OUT' });
      const nowIso = new Date().toISOString();
      const { lastID } = await dbRun('INSERT INTO attendance(member_id,action_type,timestamp) VALUES(?,?,?)', [member_id||null, action_type, nowIso]);
      res.status(201).json(await dbGet(`SELECT a.*,m.name as member_name FROM attendance a LEFT JOIN members m ON a.member_id=m.id WHERE a.id=?`, [lastID]));
    });

    // ── WI-FI SETTINGS ENDPOINTS ─────────────────────────────
    this.app.get('/api/settings/wifi', async (req, res) => {
      const rows = await dbAll('SELECT key, value FROM settings WHERE key IN ("office_wifi_ip","office_wifi_name","wifi_auto_attendance_enabled","auto_checkout_timeout_minutes")') as any[];
      const config: Record<string, string> = {};
      rows.forEach(r => { config[r.key] = r.value; });
      const clientIp = getCleanClientIp(req);
      res.json({
        office_wifi_ip: config['office_wifi_ip'] || '',
        office_wifi_name: config['office_wifi_name'] || 'AlliedOne Office Wi-Fi',
        wifi_auto_attendance_enabled: config['wifi_auto_attendance_enabled'] !== 'false',
        auto_checkout_timeout_minutes: parseInt(config['auto_checkout_timeout_minutes'] || '10', 10),
        detected_client_ip: clientIp,
        is_matching_office_wifi: isIpMatching(clientIp, config['office_wifi_ip'] || '')
      });
    });

    this.app.post('/api/settings/wifi', async (req, res) => {
      try {
        let token = '';
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.split(' ')[1] || '';
        } else if (authHeader) {
          token = authHeader;
        }
        if (!token && req.headers.cookie) {
          const cookieMatch = req.headers.cookie.match(/(?:^|;\s*)token=([^;]+)/);
          if (cookieMatch && cookieMatch[1]) token = decodeURIComponent(cookieMatch[1]);
        }
        if (!token && req.body?.token) token = req.body.token;
        if (!token && req.query?.token) token = String(req.query.token);

        if (token) {
          try { (req as any).user = jwt.verify(token, JWT_SECRET); } catch {}
        }
        const user = (req as any).user;
        if (user && user.role && user.role !== 'Admin') {
          return res.status(403).json({ error: 'Access denied. Admin role required.' });
        }

        const { office_wifi_ip, office_wifi_name, wifi_auto_attendance_enabled, auto_checkout_timeout_minutes } = req.body;
        if (office_wifi_ip !== undefined) {
          await dbRun('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['office_wifi_ip', String(office_wifi_ip).trim()]);
        }
        if (office_wifi_name !== undefined) {
          await dbRun('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['office_wifi_name', String(office_wifi_name).trim()]);
        }
        if (wifi_auto_attendance_enabled !== undefined) {
          await dbRun('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['wifi_auto_attendance_enabled', String(wifi_auto_attendance_enabled)]);
        }
        if (auto_checkout_timeout_minutes !== undefined) {
          await dbRun('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['auto_checkout_timeout_minutes', String(auto_checkout_timeout_minutes)]);
        }
        res.json({ ok: true, message: 'Wi-Fi settings updated successfully.' });
      } catch (err: any) {
        console.error('Error saving wifi settings:', err);
        res.status(500).json({ error: 'Failed to save settings: ' + (err?.message || 'DB Error') });
      }
    });

    // ── WI-FI ATTENDANCE PROBE & HEARTBEAT ───────────────────
    this.app.get('/api/attendance/wifi-status', async (req, res) => {
      const clientIp = getCleanClientIp(req);
      const rows = await dbAll('SELECT key, value FROM settings WHERE key IN ("office_wifi_ip","office_wifi_name","wifi_auto_attendance_enabled")') as any[];
      const config: Record<string, string> = {};
      rows.forEach(r => { config[r.key] = r.value; });

      const isMatching = isIpMatching(clientIp, config['office_wifi_ip'] || '');
      const isEnabled = config['wifi_auto_attendance_enabled'] !== 'false';

      res.json({
        client_ip: clientIp,
        office_wifi_name: config['office_wifi_name'] || 'AlliedOne Office Wi-Fi',
        is_office_wifi: isMatching,
        is_auto_enabled: isEnabled,
      });
    });

    this.app.post('/api/attendance/wifi-heartbeat', async (req, res) => {
      const user = (req as any).user;
      if (!user?.id) return res.status(401).json({ error: 'Authentication required' });

      const clientIp = getCleanClientIp(req);
      const rows = await dbAll('SELECT key, value FROM settings WHERE key IN ("office_wifi_ip","wifi_auto_attendance_enabled")') as any[];
      const config: Record<string, string> = {};
      rows.forEach(r => { config[r.key] = r.value; });

      const isMatching = isIpMatching(clientIp, config['office_wifi_ip'] || '');
      const isEnabled = config['wifi_auto_attendance_enabled'] !== 'false';

      if (!isEnabled) {
        return res.json({ is_office_wifi: isMatching, is_auto_enabled: false, auto_checked_in: false });
      }

      const todayDhaka = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });

      if (isMatching) {
        // Connected to Office Wi-Fi!
        // 1. Check if user already checked in today
        const existingIn = await dbGet(
          `SELECT * FROM attendance WHERE member_id = ? AND date(timestamp) = ? AND action_type = 'IN'`,
          [user.id, todayDhaka]
        ) as any;

        let autoCheckedIn = false;
        if (!existingIn) {
          const nowIso = new Date().toISOString();
          await dbRun('INSERT INTO attendance (member_id, action_type, timestamp) VALUES (?, ?, ?)', [user.id, 'IN', nowIso]);
          autoCheckedIn = true;
          console.log(`[WIFI AUTO-CHECKIN] Member #${user.id} (${user.name}) automatically checked in via Office Wi-Fi (${clientIp}).`);
        }

        // 2. Upsert active presence session
        await dbRun(
          `INSERT INTO active_sessions (member_id, last_seen, ip, is_wifi)
           VALUES (?, CURRENT_TIMESTAMP, ?, 1)
           ON CONFLICT(member_id) DO UPDATE SET last_seen = CURRENT_TIMESTAMP, ip = excluded.ip, is_wifi = 1`,
          [user.id, clientIp]
        );

        return res.json({
          success: true,
          is_office_wifi: true,
          auto_checked_in: autoCheckedIn,
          message: autoCheckedIn ? 'Checked in automatically via Office Wi-Fi' : 'Heartbeat active'
        });
      } else {
        return res.json({
          success: true,
          is_office_wifi: false,
          auto_checked_in: false
        });
      }
    });

    // ── ROUTER / DHCP WEBHOOK ───────────────────────────────
    // Allows office router scripts (MikroTik / UniFi / OpenWrt) to notify connect/disconnect
    this.app.post('/api/attendance/wifi-webhook', async (req, res) => {
      const { member_id, email, phone_number, event, ip } = req.body;
      if (!event || !['CONNECT', 'DISCONNECT'].includes(event)) {
        return res.status(400).json({ error: 'event must be CONNECT or DISCONNECT' });
      }

      let member: any = null;
      if (member_id) member = await dbGet('SELECT * FROM members WHERE id = ?', [member_id]);
      else if (email) member = await dbGet('SELECT * FROM members WHERE LOWER(TRIM(email)) = LOWER(?)', [email]);
      else if (phone_number) member = await dbGet('SELECT * FROM members WHERE phone_number = ?', [phone_number]);

      if (!member) {
        return res.status(404).json({ error: 'Member not found for provided identifier' });
      }

      const todayDhaka = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
      const nowIso = new Date().toISOString();

      if (event === 'CONNECT') {
        const existingIn = await dbGet(
          `SELECT * FROM attendance WHERE member_id = ? AND date(timestamp) = ? AND action_type = 'IN'`,
          [member.id, todayDhaka]
        );
        if (!existingIn) {
          await dbRun('INSERT INTO attendance (member_id, action_type, timestamp) VALUES (?, ?, ?)', [member.id, 'IN', nowIso]);
          console.log(`[ROUTER WEBHOOK] Auto checked in ${member.name} on Wi-Fi CONNECT`);
        }
        await dbRun(
          `INSERT INTO active_sessions (member_id, last_seen, ip, is_wifi)
           VALUES (?, CURRENT_TIMESTAMP, ?, 1)
           ON CONFLICT(member_id) DO UPDATE SET last_seen = CURRENT_TIMESTAMP, ip = excluded.ip, is_wifi = 1`,
          [member.id, ip || 'Router-Webhook']
        );
        return res.json({ ok: true, action: 'IN', member_name: member.name });
      } else {
        // DISCONNECT
        const existingIn = await dbGet(
          `SELECT * FROM attendance WHERE member_id = ? AND date(timestamp) = ? AND action_type = 'IN'`,
          [member.id, todayDhaka]
        );
        const existingOut = await dbGet(
          `SELECT * FROM attendance WHERE member_id = ? AND date(timestamp) = ? AND action_type = 'OUT'`,
          [member.id, todayDhaka]
        );
        if (existingIn && !existingOut) {
          await dbRun('INSERT INTO attendance (member_id, action_type, timestamp) VALUES (?, ?, ?)', [member.id, 'OUT', nowIso]);
          console.log(`[ROUTER WEBHOOK] Auto checked out ${member.name} on Wi-Fi DISCONNECT`);
        }
        await dbRun('DELETE FROM active_sessions WHERE member_id = ?', [member.id]);
        return res.json({ ok: true, action: 'OUT', member_name: member.name });
      }
    });

    // ── LAPTOP ZERO-BROWSER BACKGROUND AGENT PING ───────────
    this.app.post('/api/attendance/client-ping', async (req, res) => {
      const token = (req.headers.authorization?.replace(/^Bearer\s+/, '') || req.body.token || '') as string;
      if (!token) {
        return res.status(401).json({ error: 'Token required for laptop background agent' });
      }

      let user: any = null;
      try {
        user = jwt.verify(token, JWT_SECRET);
      } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      const member = await dbGet('SELECT * FROM members WHERE id = ?', [user.id]) as any;
      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      const action = req.body.action || 'PING'; // 'PING' or 'SHUTDOWN'
      const hostname = String(req.body.hostname || '').slice(0, 100);
      const os_name = String(req.body.os || req.body.os_name || 'Windows').slice(0, 50);
      const clientIp = getCleanClientIp(req);

      const rows = await dbAll('SELECT key, value FROM settings WHERE key IN ("office_wifi_ip","wifi_auto_attendance_enabled")') as any[];
      const config: Record<string, string> = {};
      rows.forEach(r => { config[r.key] = r.value; });

      const isMatching = isIpMatching(clientIp, config['office_wifi_ip'] || '');
      const isEnabled = config['wifi_auto_attendance_enabled'] !== 'false';
      const todayDhaka = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
      const nowIso = new Date().toISOString();

      if (action === 'SHUTDOWN') {
        const existingIn = await dbGet(
          `SELECT * FROM attendance WHERE member_id = ? AND date(timestamp) = ? AND action_type = 'IN'`,
          [member.id, todayDhaka]
        );
        const existingOut = await dbGet(
          `SELECT * FROM attendance WHERE member_id = ? AND date(timestamp) = ? AND action_type = 'OUT'`,
          [member.id, todayDhaka]
        );

        let autoCheckedOut = false;
        if (existingIn && !existingOut) {
          await dbRun('INSERT INTO attendance (member_id, action_type, timestamp) VALUES (?, ?, ?)', [member.id, 'OUT', nowIso]);
          autoCheckedOut = true;
          console.log(`[LAPTOP SHUTDOWN] Member #${member.id} (${member.name}) checked out via laptop shutdown hook (${hostname || clientIp}).`);
        }

        await dbRun('DELETE FROM active_sessions WHERE member_id = ?', [member.id]);
        return res.json({
          success: true,
          action: 'OUT',
          auto_checked_out: autoCheckedOut,
          member_name: member.name,
          message: autoCheckedOut ? 'Checked out on laptop shutdown' : 'Session closed'
        });
      }

      // Action is 'PING'
      if (isMatching && isEnabled) {
        const existingIn = await dbGet(
          `SELECT * FROM attendance WHERE member_id = ? AND date(timestamp) = ? AND action_type = 'IN'`,
          [member.id, todayDhaka]
        );

        let autoCheckedIn = false;
        if (!existingIn) {
          await dbRun('INSERT INTO attendance (member_id, action_type, timestamp) VALUES (?, ?, ?)', [member.id, 'IN', nowIso]);
          autoCheckedIn = true;
          console.log(`[LAPTOP AUTO-CHECKIN] Member #${member.id} (${member.name}) automatically checked in via Laptop Agent (${hostname || clientIp}).`);
        }

        await dbRun(
          `INSERT INTO active_sessions (member_id, last_seen, ip, is_wifi, hostname, os_name, device_type)
           VALUES (?, CURRENT_TIMESTAMP, ?, 1, ?, ?, 'LAPTOP')
           ON CONFLICT(member_id) DO UPDATE SET 
             last_seen = CURRENT_TIMESTAMP, 
             ip = excluded.ip, 
             is_wifi = 1,
             hostname = excluded.hostname,
             os_name = excluded.os_name,
             device_type = 'LAPTOP'`,
          [member.id, clientIp, hostname, os_name]
        );

        return res.json({
          success: true,
          is_office_wifi: true,
          auto_checked_in: autoCheckedIn,
          member_name: member.name,
          message: autoCheckedIn ? 'Checked in automatically via Office Wi-Fi' : 'Presence active'
        });
      } else {
        return res.json({
          success: true,
          is_office_wifi: false,
          auto_checked_in: false,
          member_name: member.name,
          message: 'Connected to remote network'
        });
      }
    });

    // ── DOWNLOAD ZERO-BROWSER LAPTOP SCRIPT ──────────────────
    this.app.get('/api/attendance/download-script', async (req, res) => {
      const token = (req.query.token as string || req.headers.authorization?.replace(/^Bearer\s+/, '') || '') as string;
      if (!token) return res.status(401).send('Authentication token required');

      let user: any = null;
      try {
        user = jwt.verify(token, JWT_SECRET);
      } catch {
        return res.status(401).send('Invalid or expired token');
      }

      const member = await dbGet('SELECT * FROM members WHERE id = ?', [user.id]) as any;
      if (!member) return res.status(404).send('Member not found');

      const os = (req.query.os as string || 'windows').toLowerCase();
      const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
      const host = req.headers.host || 'localhost:3000';
      const serverUrl = `${protocol}://${host}`;

      if (os === 'windows' || os === 'bat') {
        const psScriptRaw = `# AlliedOne ERP Background Attendance Service
$serverUrl = "${serverUrl}"
$token = "${token}"
$employeeName = "${member.name}"
$hostname = $env:COMPUTERNAME
$os = "Windows"

function Send-AttendancePing($action) {
    try {
        $body = @{ token = $token; action = $action; hostname = $hostname; os = $os } | ConvertTo-Json
        $res = Invoke-RestMethod -Uri "$serverUrl/api/attendance/client-ping" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
        return $res
    } catch {
        return $null
    }
}

function Show-Notification($title, $msg) {
    try {
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
        $template = "<toast><visual><binding template='ToastGeneric'><text>$title</text><text>$msg</text></binding></visual></toast>"
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml($template)
        $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("AlliedOne ERP").Show($toast)
    } catch {}
}

# Register shutdown event hook
Register-EngineEvent -SourceIdentifier ([System.Management.Automation.PsEngineEvent]::Exiting) -Action {
    Send-AttendancePing "SHUTDOWN"
} | Out-Null

# Initial check-in on startup/wake
$initResp = Send-AttendancePing "PING"
if ($initResp -and $initResp.auto_checked_in) {
    Show-Notification "AlliedOne ERP" "Good morning $employeeName! Automatically checked in via Office Wi-Fi."
}

# Main background presence loop
while ($true) {
    Start-Sleep -Seconds 60
    $pResp = Send-AttendancePing "PING"
    if ($pResp -and $pResp.auto_checked_in) {
        Show-Notification "AlliedOne ERP" "Good morning $employeeName! Automatically checked in via Office Wi-Fi."
    }
}
`;
        const psScriptBase64 = Buffer.from(psScriptRaw, 'utf8').toString('base64');
        const vbsScriptRaw = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & CreateObject("WScript.Shell").ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\\AlliedOneERP\\aol-attendance.ps1""", 0, False
`;
        const vbsScriptBase64 = Buffer.from(vbsScriptRaw, 'utf8').toString('base64');

        const batContent = `@echo off
title AlliedOne ERP - Zero-Browser Laptop Attendance Setup
echo ==============================================================
echo   AlliedOne ERP - Automated Laptop Attendance Setup
echo   Employee: ${member.name}
echo ==============================================================
echo.

set "TARGET_DIR=%LOCALAPPDATA%\\AlliedOneERP"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

set "PS_SCRIPT=%TARGET_DIR%\\aol-attendance.ps1"
set "VBS_SCRIPT=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\AlliedOneAttendance.vbs"

echo [1/3] Installing background presence service...
powershell -NoProfile -Command "$b64='${psScriptBase64}'; [System.IO.File]::WriteAllBytes('%PS_SCRIPT%', [System.Convert]::FromBase64String($b64))"

echo [2/3] Registering silent Windows startup service...
powershell -NoProfile -Command "$b64='${vbsScriptBase64}'; [System.IO.File]::WriteAllBytes('%VBS_SCRIPT%', [System.Convert]::FromBase64String($b64))"

echo [3/3] Starting background service now...
wscript.exe "%VBS_SCRIPT%"

echo.
echo ==============================================================
echo   SUCCESS! Automated Laptop Attendance is now active.
echo   - When you turn on/open your laptop at the office: AUTO CHECK-IN
echo   - When you turn off or shut down your laptop: AUTO CHECK-OUT
echo   - Zero browser needed!
echo ==============================================================
echo.
pause
`;
        res.setHeader('Content-Disposition', `attachment; filename="AlliedOne-Attendance-${member.name.replace(/[^a-zA-Z0-9]/g, '_')}.bat"`);
        res.setHeader('Content-Type', 'application/x-bat');
        return res.send(batContent);
      } else {
        // macOS / Linux script
        const shContent = `#!/bin/bash
# AlliedOne ERP - Zero-Browser Laptop Attendance Setup (macOS/Linux)
# Employee: ${member.name} (${member.email})

SERVER_URL="${serverUrl}"
TOKEN="${token}"
EMPLOYEE_NAME="${member.name}"
HOSTNAME="$(hostname)"
OS_NAME="$(uname -s)"

AGENT_DIR="$HOME/.alliedone_erp"
mkdir -p "$AGENT_DIR"
SCRIPT_PATH="$AGENT_DIR/aol-attendance.sh"

cat << 'EOF' > "$SCRIPT_PATH"
#!/bin/bash
SERVER_URL="${serverUrl}"
TOKEN="${token}"
EMPLOYEE_NAME="${member.name}"
HOSTNAME="$(hostname)"
OS_NAME="$(uname -s)"

send_ping() {
  ACTION="$1"
  curl -s -X POST "$SERVER_URL/api/attendance/client-ping" \\
    -H "Content-Type: application/json" \\
    -d "{\\"token\\":\\"$TOKEN\\",\\"action\\":\\"$ACTION\\",\\"hostname\\":\\"$HOSTNAME\\",\\"os\\":\\"$OS_NAME\\"}"
}

trap 'send_ping "SHUTDOWN"' EXIT SIGTERM

# Initial Ping
RESP=$(send_ping "PING")
if echo "$RESP" | grep -q '"auto_checked_in":true'; then
  command -v osascript >/dev/null 2>&1 && osascript -e 'display notification "Automatically checked in via Office Wi-Fi" with title "AlliedOne ERP"'
fi

while true; do
  sleep 60
  RESP=$(send_ping "PING")
  if echo "$RESP" | grep -q '"auto_checked_in":true'; then
    command -v osascript >/dev/null 2>&1 && osascript -e 'display notification "Automatically checked in via Office Wi-Fi" with title "AlliedOne ERP"'
  fi
done
EOF

chmod +x "$SCRIPT_PATH"

# Run in background
nohup "$SCRIPT_PATH" >/dev/null 2>&1 &

echo "=============================================================="
echo "  AlliedOne ERP Background Attendance installed and running!"
echo "=============================================================="
`;
        res.setHeader('Content-Disposition', `attachment; filename="AlliedOne-Attendance-${member.name.replace(/[^a-zA-Z0-9]/g, '_')}.sh"`);
        res.setHeader('Content-Type', 'text/x-shellscript');
        return res.send(shContent);
      }
    });

    // ── ACTIVE LAPTOP DEVICES (Admin View) ───────────────────
    this.app.get('/api/attendance/active-devices', requireRole('Admin'), async (_, res) => {
      const rows = await dbAll(`
        SELECT a.*, m.name as member_name, m.email, m.avatar_color
        FROM active_sessions a
        JOIN members m ON a.member_id = m.id
        WHERE a.is_wifi = 1
        ORDER BY a.last_seen DESC
      `);
      res.json(rows);
    });

    // ── LEAVE ────────────────────────────────────────────────
    this.app.get('/api/leaves', async (req, res) => {
      // Optionally filter by member_id for employee self-view
      const memberId = req.query.member_id as string;
      if (memberId) {
        res.json(await dbAll(`SELECT l.*,m.name as member_name,m.avatar_color FROM leave_requests l JOIN members m ON l.member_id=m.id WHERE l.member_id=? ORDER BY l.created_at DESC`, [memberId]));
      } else {
        res.json(await dbAll(`SELECT l.*,m.name as member_name,m.avatar_color FROM leave_requests l JOIN members m ON l.member_id=m.id ORDER BY l.created_at DESC`));
      }
    });
    // Monthly leaves for a specific member (used by HR calendar)
    this.app.get('/api/leaves/monthly', async (req, res) => {
      const { member_id, month } = req.query as { member_id: string; month: string };
      if (!member_id || !month) return res.status(400).json({ error: 'member_id and month (YYYY-MM) required' });
      const rows = await dbAll(
        `SELECT * FROM leave_requests
         WHERE member_id=?
           AND (
             strftime('%Y-%m', start_date)=? OR
             strftime('%Y-%m', end_date)=? OR
             (start_date <= ? AND end_date >= ?)
           )
         ORDER BY start_date ASC`,
        [member_id, month, month, month + '-01', month + '-31']
      );
      res.json(rows);
    });
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

      // 4. Wi-Fi Auto Check-Out Engine (runs every minute)
      try {
        const timeoutRow = await dbGet("SELECT value FROM settings WHERE key='auto_checkout_timeout_minutes'") as any;
        const enabledRow = await dbGet("SELECT value FROM settings WHERE key='wifi_auto_attendance_enabled'") as any;
        const isAutoEnabled = enabledRow?.value !== 'false';
        const timeoutMinutes = parseInt(timeoutRow?.value || '10', 10);

        if (isAutoEnabled) {
          const expiredSessions = await dbAll(
            `SELECT a.member_id, a.last_seen, m.name
             FROM active_sessions a
             JOIN members m ON a.member_id = m.id
             WHERE a.is_wifi = 1
               AND (strftime('%s', 'now') - strftime('%s', a.last_seen)) > ?`,
            [timeoutMinutes * 60]
          ) as any[];

          for (const s of expiredSessions) {
            const todayDhaka = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
            const hasIn = await dbGet(`SELECT id FROM attendance WHERE member_id = ? AND date(timestamp) = ? AND action_type = 'IN'`, [s.member_id, todayDhaka]);
            const hasOut = await dbGet(`SELECT id FROM attendance WHERE member_id = ? AND date(timestamp) = ? AND action_type = 'OUT'`, [s.member_id, todayDhaka]);

            if (hasIn && !hasOut) {
              const nowIso = new Date().toISOString();
              await dbRun('INSERT INTO attendance (member_id, action_type, timestamp) VALUES (?, ?, ?)', [s.member_id, 'OUT', nowIso]);
              console.log(`[WIFI AUTO-CHECKOUT] Member #${s.member_id} (${s.name}) automatically checked out after ${timeoutMinutes}m Wi-Fi disconnection.`);
            }
            await dbRun('DELETE FROM active_sessions WHERE member_id = ?', [s.member_id]);
          }
        }
      } catch (err) {
        console.error('Error in Wi-Fi auto-checkout cron:', err);
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
