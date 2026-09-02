import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { initDB, dbAll, dbGet, dbRun, isPostgres } from './db.js';
import { sendTelegramMessage } from './telegram.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Re-export database helpers for tools and external modules
export { initDB, dbAll, dbGet, dbRun, isPostgres };

// Add default secret if not provided
const JWT_SECRET = process.env.JWT_SECRET || 'alliedone_super_secret_key_123!';

async function notifyMember(memberId: number, message: string, link: string = '') {
  await dbRun(`INSERT INTO notifications(member_id,message,link) VALUES(?,?,?)`, [memberId, message, link]);
  
  // Telegram Integration
  const member = await dbGet('SELECT telegram_chat_id FROM members WHERE id=?', [memberId]) as any;
  let chatId = member?.telegram_chat_id?.trim();
  if (!chatId && process.env.TELEGRAM_CHAT_ID) {
    chatId = process.env.TELEGRAM_CHAT_ID.trim();
  }

  if (chatId) {
    sendTelegramMessage(chatId, message).catch(console.error);
  }
}

async function notifyAdmins(message: string, link: string = '') {
  const admins = await dbAll("SELECT id, telegram_chat_id FROM members WHERE role = 'Admin'") as any[];
  
  let fallbackChatId = process.env.TELEGRAM_CHAT_ID?.trim() || '';
  if (!fallbackChatId) {
    const anyChat = await dbGet("SELECT telegram_chat_id FROM members WHERE telegram_chat_id IS NOT NULL AND telegram_chat_id != '' LIMIT 1") as any;
    if (anyChat && anyChat.telegram_chat_id) fallbackChatId = anyChat.telegram_chat_id.trim();
  }

  const sentChatIds = new Set<string>();

  for (const admin of admins) {
    await dbRun(`INSERT INTO notifications(member_id,message,link) VALUES(?,?,?)`, [admin.id, message, link]);
    const cid = admin.telegram_chat_id?.trim() || fallbackChatId;
    if (cid && !sentChatIds.has(cid)) {
      sentChatIds.add(cid);
      sendTelegramMessage(cid, message).catch(console.error);
    }
  }

  if (fallbackChatId && !sentChatIds.has(fallbackChatId)) {
    sendTelegramMessage(fallbackChatId, message).catch(console.error);
  }
}

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

export function parseDbDate(raw: string | Date): Date {
  if (!raw) return new Date();
  if (raw instanceof Date) return raw;
  let s = String(raw).trim();
  if (s.endsWith('Z') || s.includes('+') || (s.includes('-') && s.lastIndexOf('-') > 10)) {
    return new Date(s);
  }
  if (s.includes('T')) return new Date(s + 'Z');
  return new Date(s.replace(' ', 'T') + 'Z');
}

export class WhatsAppGateway { config: any; constructor(c: any) { this.config = c; } }
export class Tool { config: any; constructor(c: any) { this.config = c; } }

export class OpenClaw {
  config: any; systemPrompt = ''; app: express.Application; tools: Tool[];
  constructor(config: any) {
    this.config = config; this.tools = config.tools || [];
    this.app = express();
    this.app.use(express.json());
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
        req.path.startsWith('/attendance/active-devices') ||
        req.path.startsWith('/settings/wifi')
      ) {
        return next();
      }
      authenticateToken(req, res, next);
    });

    this.app.get('/api/members', async (_, res) => res.json(await dbAll('SELECT id, name, email, role, avatar_color, whatsapp_number, telegram_chat_id, created_at FROM members ORDER BY name')));
    
    // Only Admin can add members
    this.app.post('/api/members', requireRole('Admin'), async (req, res) => {
      const { name, email, role, avatar_color, password, whatsapp_number, telegram_chat_id } = req.body;
      if (!name) return res.status(400).json({ error: 'Name required' });
      const colors = ['#4f7eff','#2dd4a0','#ff4d6a','#ff9f40','#a78bfa','#f472b6'];
      const color = avatar_color || colors[Math.floor(Math.random() * colors.length)];
      
      const pwdHash = password ? await bcrypt.hash(password, 10) : await bcrypt.hash('password123', 10);
      
      const { lastID } = await dbRun('INSERT INTO members(name,email,role,avatar_color,password_hash,whatsapp_number,telegram_chat_id) VALUES(?,?,?,?,?,?,?)', [name, email||'', role||'Employee', color, pwdHash, whatsapp_number||'', telegram_chat_id||'']);
      res.json({ id: lastID });
    });
    // Only Admin can edit members
    this.app.put('/api/members/:id', requireRole('Admin'), async (req, res) => {
      const { name, email, role, password, whatsapp_number, telegram_chat_id } = req.body;
      if (!name) return res.status(400).json({ error: 'Name required' });
      
      if (password) {
        const pwdHash = await bcrypt.hash(password, 10);
        await dbRun('UPDATE members SET name=?, email=?, role=?, password_hash=?, whatsapp_number=?, telegram_chat_id=? WHERE id=?', [name, email || '', role || 'Employee', pwdHash, whatsapp_number || '', telegram_chat_id || '', req.params.id]);
      } else {
        await dbRun('UPDATE members SET name=?, email=?, role=?, whatsapp_number=?, telegram_chat_id=? WHERE id=?', [name, email || '', role || 'Employee', whatsapp_number || '', telegram_chat_id || '', req.params.id]);
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
      res.json(await dbAll(`SELECT t.*,m.name as assignee_name,m.avatar_color as assignee_color FROM tasks t LEFT JOIN members m ON t.assigned_to=m.id WHERE (date(t.task_date) = date(?) OR (date(t.task_date) < date(?) AND t.status != 'DONE')) AND ${archivedFilter} ORDER BY t.task_date DESC, t.created_at DESC`, [date, date]));
    });
    this.app.post('/api/tasks', async (req, res) => {
      const { title, description, deadline, priority, assigned_to, task_date, action_type, recipient, status } = req.body;
      if (!title) return res.status(400).json({ error: 'Title required' });
      const date = task_date || new Date().toISOString().split('T')[0];
      const { lastID } = await dbRun(`INSERT INTO tasks(title,description,deadline,priority,assigned_to,task_date,action_type,recipient,status) VALUES(?,?,?,?,?,?,?,?,?)`,
        [title, description||'', deadline||null, priority||'GREEN', assigned_to||null, date, action_type||'STUDY', recipient||'', status||'DONE']);
      
      const newTask = await dbGet(`SELECT t.*,m.name as assignee_name,m.avatar_color as assignee_color FROM tasks t LEFT JOIN members m ON t.assigned_to=m.id WHERE t.id=?`, [lastID]);
      
      if (assigned_to) {
        const assignee = await dbGet('SELECT name FROM members WHERE id=?', [assigned_to]) as any;
        await notifyMember(assigned_to, `📋 New Task Assigned: "${title}"`, '/dashboard');
        await notifyAdmins(`📋 New Task: "${title}" (Assigned to ${assignee?.name || 'employee'}).`, '/dashboard');
      } else {
        await notifyAdmins(`📋 New Task Created: "${title}" (Unassigned).`, '/dashboard');
      }

      res.status(201).json(newTask);
    });
    this.app.patch('/api/tasks/:id', async (req, res) => {
      const oldTask = await dbGet(`SELECT t.*, m.name as assignee_name FROM tasks t LEFT JOIN members m ON t.assigned_to=m.id WHERE t.id=?`, [req.params.id]) as any;

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
      
      const updatedTask = await dbGet(`SELECT t.*,m.name as assignee_name,m.avatar_color as assignee_color FROM tasks t LEFT JOIN members m ON t.assigned_to=m.id WHERE t.id=?`, [req.params.id]) as any;
      
      if (oldTask && updatedTask) {
        const user = (req as any).user;
        
        // If status changed, notify admins and assignee
        if (req.body.status && req.body.status !== oldTask.status) {
          const statusIcon = req.body.status === 'DONE' ? '✅' : '🔄';
          await notifyAdmins(`${statusIcon} Task Status: "${updatedTask.title}" marked as ${req.body.status} by ${user?.name || 'employee'}.`, '/dashboard');
        }
        
        // If task was re-assigned to someone else
        if (req.body.assigned_to && req.body.assigned_to !== oldTask.assigned_to) {
          await notifyMember(req.body.assigned_to, `📋 You have been assigned a task: "${updatedTask.title}"`, '/dashboard');
        }
      }

      res.json(updatedTask);
    });
    this.app.delete('/api/tasks/:id', async (req, res) => { await dbRun('DELETE FROM tasks WHERE id=?', [req.params.id]); res.json({ ok: true }); });

    // ── TELEGRAM TEST ─────────────────────────────────────────
    this.app.post('/api/test-telegram', requireRole('Admin'), async (req, res) => {
      const { chat_id } = req.body;
      if (!chat_id) return res.status(400).json({ error: 'chat_id is required' });
      
      const result = await sendTelegramMessage(chat_id, '🔔 Test message from AOL ERP Bot! If you receive this, notifications are working.');
      res.json(result);
    });

    this.app.post('/api/debug-env', requireRole('Admin'), async (req, res) => {
      res.json({ keys: Object.keys(process.env), hasToken: !!process.env.TELEGRAM_BOT_TOKEN });
    });

    // ── ATTENDANCE ───────────────────────────────────────────
    this.app.get('/api/attendance', async (req, res) => {
      const targetDate = (req.query.date as string) || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
      const rows = await dbAll(
        `SELECT a.*, m.name as member_name, m.avatar_color 
         FROM attendance a 
         LEFT JOIN members m ON a.member_id=m.id 
         ORDER BY a.timestamp DESC`
      ) as any[];
      const filtered = rows.filter(r => {
        const dt = new Date(r.timestamp);
        const dStr = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
        return dStr === targetDate;
      });
      res.json(filtered);
    });
    // Monthly attendance for a specific member (used by HR calendar)
    this.app.get('/api/attendance/monthly', async (req, res) => {
      const { member_id, month } = req.query as { member_id: string; month: string };
      if (!member_id || !month) return res.status(400).json({ error: 'member_id and month (YYYY-MM) required' });
      const rows = await dbAll(
        `SELECT a.id, a.member_id, a.action_type, a.timestamp
         FROM attendance a
         WHERE a.member_id=?
         ORDER BY a.timestamp ASC`,
        [member_id]
      ) as any[];
      const filtered = rows.filter(r => {
        const dt = parseDbDate(r.timestamp);
        const dStr = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
        return dStr.startsWith(month);
      }).map(r => ({
        ...r,
        att_date: parseDbDate(r.timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' })
      }));
      res.json(filtered);
    });
    
    // Monthly summary for all members
    this.app.get('/api/attendance/summary', async (req, res) => {
      const { month } = req.query as { month: string };
      if (!month) return res.status(400).json({ error: 'month (YYYY-MM) required' });
      const rows = await dbAll(
        `SELECT a.id, a.member_id, a.action_type, a.timestamp
         FROM attendance a
         ORDER BY a.timestamp ASC`
      ) as any[];
      const filtered = rows.filter(r => {
        const dt = parseDbDate(r.timestamp);
        const dStr = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
        return dStr.startsWith(month);
      }).map(r => ({
        ...r,
        att_date: parseDbDate(r.timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' })
      }));
      res.json(filtered);
    });
    this.app.post('/api/attendance', async (req, res) => {
      const { member_id, action_type } = req.body;
      if (!action_type || !['IN','OUT'].includes(action_type)) return res.status(400).json({ error: 'action_type must be IN or OUT' });
      const nowIso = new Date().toISOString();
      const { lastID } = await dbRun('INSERT INTO attendance(member_id,action_type,timestamp) VALUES(?,?,?)', [member_id||null, action_type, nowIso]);
      const rec = await dbGet(`SELECT a.*,m.name as member_name FROM attendance a LEFT JOIN members m ON a.member_id=m.id WHERE a.id=?`, [lastID]) as any;
      
      const empName = rec?.member_name || 'An employee';
      const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Dhaka' });
      if (action_type === 'IN') {
        await notifyAdmins(`🟢 Check-In: ${empName} checked in at ${timeStr}.`, '/hr?tab=att');
      } else {
        await notifyAdmins(`🔴 Check-Out: ${empName} checked out at ${timeStr}.`, '/hr?tab=att');
      }

      res.status(201).json(rec);
    });

    // ── WI-FI SETTINGS ENDPOINTS ─────────────────────────────
    this.app.get('/api/settings/wifi', async (req, res) => {
      const rows = await dbAll("SELECT key, value FROM settings WHERE key IN ('office_wifi_ip','office_wifi_name','wifi_auto_attendance_enabled','auto_checkout_timeout_minutes')") as any[];
      const config: Record<string, string> = {};
      rows.forEach(r => { config[r.key] = r.value; });
      const clientIp = getCleanClientIp(req);
      res.json({
        office_wifi_ip: config['office_wifi_ip'] || '',
        office_wifi_name: config['office_wifi_name'] || 'AlliedOne Office Wi-Fi',
        wifi_auto_attendance_enabled: config['wifi_auto_attendance_enabled'] !== 'false',
        auto_checkout_timeout_minutes: parseInt(config['auto_checkout_timeout_minutes'] || '40', 10),
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
      const rows = await dbAll("SELECT key, value FROM settings WHERE key IN ('office_wifi_ip','office_wifi_name','wifi_auto_attendance_enabled')") as any[];
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
      const rows = await dbAll("SELECT key, value FROM settings WHERE key IN ('office_wifi_ip','wifi_auto_attendance_enabled')") as any[];
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
        const userRows = await dbAll('SELECT * FROM attendance WHERE member_id = ?', [user.id]) as any[];
        const existingIn = userRows.find(r => {
          const d = parseDbDate(r.timestamp);
          return d && d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }) === todayDhaka && r.action_type === 'IN';
        });

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

      const memberAtt = await dbAll('SELECT * FROM attendance WHERE member_id = ?', [member.id]) as any[];
      const todayRecords = memberAtt.filter(r => {
        const d = parseDbDate(r.timestamp);
        return d ? d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }) === todayDhaka : false;
      });
      const existingIn = todayRecords.find(r => r.action_type === 'IN');
      const existingOut = todayRecords.find(r => r.action_type === 'OUT');

      if (event === 'CONNECT') {
        if (!existingIn) {
          await dbRun('INSERT INTO attendance (member_id, action_type, timestamp) VALUES (?, ?, ?)', [member.id, 'IN', nowIso]);
          console.log(`[ROUTER WEBHOOK] Auto checked in ${member.name} on Wi-Fi CONNECT`);
          await notifyAdmins(`⚡ Wi-Fi Auto Check-In: ${member.name} connected to Office Wi-Fi.`, '/hr?tab=att');
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
        if (existingIn && !existingOut) {
          await dbRun('INSERT INTO attendance (member_id, action_type, timestamp) VALUES (?, ?, ?)', [member.id, 'OUT', nowIso]);
          console.log(`[ROUTER WEBHOOK] Auto checked out ${member.name} on Wi-Fi DISCONNECT`);
          await notifyAdmins(`⚡ Wi-Fi Auto Check-Out: ${member.name} disconnected from Office Wi-Fi.`, '/hr?tab=att');
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

      const rows = await dbAll("SELECT key, value FROM settings WHERE key IN ('office_wifi_ip','wifi_auto_attendance_enabled')") as any[];
      const config: Record<string, string> = {};
      rows.forEach(r => { config[r.key] = r.value; });

      const isMatching = isIpMatching(clientIp, config['office_wifi_ip'] || '');
      const isEnabled = config['wifi_auto_attendance_enabled'] !== 'false';
      const todayDhaka = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
      const nowIso = new Date().toISOString();

      const memberAtt = await dbAll('SELECT * FROM attendance WHERE member_id = ?', [member.id]) as any[];
      const todayRecords = memberAtt.filter(r => {
        const d = parseDbDate(r.timestamp);
        return d ? d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }) === todayDhaka : false;
      });
      const existingIn = todayRecords.find(r => r.action_type === 'IN');
      const existingOut = todayRecords.find(r => r.action_type === 'OUT');

      if (action === 'SHUTDOWN') {
        let autoCheckedOut = false;
        if (existingIn && !existingOut) {
          await dbRun('INSERT INTO attendance (member_id, action_type, timestamp) VALUES (?, ?, ?)', [member.id, 'OUT', nowIso]);
          autoCheckedOut = true;
          console.log(`[LAPTOP SHUTDOWN] Member #${member.id} (${member.name}) checked out via laptop shutdown hook (${hostname || clientIp}).`);
          await notifyAdmins(`💻 Laptop Auto Check-Out: ${member.name} turned off laptop (${hostname || 'Workstation'}).`, '/hr?tab=att');
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
        let autoCheckedIn = false;
        if (!existingIn) {
          await dbRun('INSERT INTO attendance (member_id, action_type, timestamp) VALUES (?, ?, ?)', [member.id, 'IN', nowIso]);
          autoCheckedIn = true;
          console.log(`[LAPTOP AUTO-CHECKIN] Member #${member.id} (${member.name}) automatically checked in via Laptop Agent (${hostname || clientIp}).`);
          await notifyAdmins(`💻 Laptop Auto Check-In: ${member.name} opened laptop (${hostname || 'Workstation'}).`, '/hr?tab=att');
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

      // ── Resolve the canonical server URL (always points to production) ──
      // Priority: RENDER_EXTERNAL_HOSTNAME env (Render provides this automatically)
      //           → x-forwarded-proto + host header (works for any reverse-proxy)
      //           → fallback to request host
      const renderHostname = process.env.RENDER_EXTERNAL_HOSTNAME;
      let serverUrl: string;
      if (renderHostname) {
        serverUrl = `https://${renderHostname}`;
      } else {
        const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
        const host = req.headers.host || 'localhost:3000';
        serverUrl = `${protocol}://${host}`;
      }

      // Issue a long-lived (1 year) script token so it never needs re-download for expiry
      const scriptToken = jwt.sign(
        { id: member.id, email: member.email, role: member.role, name: member.name, script: true },
        JWT_SECRET,
        { expiresIn: '365d' }
      );

      const os = (req.query.os as string || 'windows').toLowerCase();

      // Raw PS1 endpoint used by self-update
      if (os === 'ps1') {
        const psScriptRaw = `# AlliedOne ERP - Automated Attendance Agent (self-updating)
$serverUrl    = "${serverUrl}"
$token        = "${scriptToken}"
$employeeName = "${member.name}"
$scriptPath   = "$PSScriptRoot\\aol-attendance.ps1"
$hostname_val = $env:COMPUTERNAME
$os_val       = "Windows"

function Send-Ping($action) {
    try {
        $body = @{ token = $token; action = $action; hostname = $hostname_val; os = $os_val } | ConvertTo-Json
        return Invoke-RestMethod -Uri "$serverUrl/api/attendance/client-ping" \`
            -Method Post -Body $body -ContentType "application/json" -TimeoutSec 20
    } catch { return $null }
}

function Show-Toast($title, $msg) {
    try {
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$title</text><text>$msg</text></binding></visual></toast>")
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("AlliedOne ERP").Show([Windows.UI.Notifications.ToastNotification]::new($xml))
    } catch {}
}

Register-EngineEvent -SourceIdentifier ([System.Management.Automation.PsEngineEvent]::Exiting) -Action {
    Send-Ping "SHUTDOWN"
} | Out-Null

# Wait for network + server to be ready (handles Render cold start & Windows boot delay)
$maxRetries = 6
$retryDelay = 20
$initResp   = $null
for ($i = 0; $i -lt $maxRetries; $i++) {
    $initResp = Send-Ping "PING"
    if ($initResp) { break }
    Start-Sleep -Seconds $retryDelay
}
if ($initResp -and $initResp.auto_checked_in) {
    Show-Toast "AlliedOne ERP" "Good morning $employeeName! Automatically checked in."
}

while ($true) {
    Start-Sleep -Seconds 60
    $resp = Send-Ping "PING"
    if ($resp -and $resp.auto_checked_in) {
        Show-Toast "AlliedOne ERP" "Good morning $employeeName! Automatically checked in."
    }
}
`;
        res.setHeader('Content-Type', 'text/plain');
        return res.send(psScriptRaw);
      }

      if (os === 'windows' || os === 'bat') {
        // ── PowerShell background agent (self-updating) ──
        const psScriptRaw = `# AlliedOne ERP - Automated Attendance Agent
# Self-updating: fetches a fresh copy of this script on every startup.

$serverUrl    = "${serverUrl}"
$token        = "${scriptToken}"
$employeeName = "${member.name}"
$scriptPath   = "$PSScriptRoot\\aol-attendance.ps1"
$hostname_val = $env:COMPUTERNAME
$os_val       = "Windows"

function Send-Ping($action) {
    try {
        $body = @{ token = $token; action = $action; hostname = $hostname_val; os = $os_val } | ConvertTo-Json
        return Invoke-RestMethod -Uri "$serverUrl/api/attendance/client-ping" \`
            -Method Post -Body $body -ContentType "application/json" -TimeoutSec 15
    } catch { return $null }
}

function Show-Toast($title, $msg) {
    try {
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$title</text><text>$msg</text></binding></visual></toast>")
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("AlliedOne ERP").Show(
            [Windows.UI.Notifications.ToastNotification]::new($xml)
        )
    } catch {}
}

function Self-Update {
    try {
        $newScript = Invoke-RestMethod -Uri "$serverUrl/api/attendance/download-script?token=$token&os=ps1" \`
            -Method Get -TimeoutSec 20
        if ($newScript -and $newScript.Length -gt 100) {
            [System.IO.File]::WriteAllText($scriptPath, $newScript, [System.Text.Encoding]::UTF8)
        }
    } catch {}
}

# Self-update on startup (silently replaces this file with the latest from server)
Self-Update

# Register shutdown hook
Register-EngineEvent -SourceIdentifier ([System.Management.Automation.PsEngineEvent]::Exiting) -Action {
    Send-Ping "SHUTDOWN"
} | Out-Null

# Wait for network + server (handles Render cold start & slow Windows boot)
$maxRetries = 6
$retryDelay = 20
$initResp   = $null
for ($i = 0; $i -lt $maxRetries; $i++) {
    $initResp = Send-Ping "PING"
    if ($initResp) { break }
    Start-Sleep -Seconds $retryDelay
}
if ($initResp -and $initResp.auto_checked_in) {
    Show-Toast "AlliedOne ERP" "Good morning $employeeName! Automatically checked in."
}

# Background presence loop (ping every 60 seconds)
while ($true) {
    Start-Sleep -Seconds 60
    $resp = Send-Ping "PING"
    if ($resp -and $resp.auto_checked_in) {
        Show-Toast "AlliedOne ERP" "Good morning $employeeName! Automatically checked in."
    }
}
`;

        // Remove the ps1 sub-branch; it is handled above

        const psScriptBase64 = Buffer.from(psScriptRaw, 'utf8').toString('base64');
        const vbsScriptRaw = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & CreateObject("WScript.Shell").ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\\AlliedOneERP\\aol-attendance.ps1""", 0, False
`;
        const vbsScriptBase64 = Buffer.from(vbsScriptRaw, 'utf8').toString('base64');

        const batContent = `@echo off
title AlliedOne ERP - Laptop Attendance Setup
echo ==============================================================
echo   AlliedOne ERP - Automated Laptop Attendance
echo   Employee: ${member.name}
echo   Server:   ${serverUrl}
echo ==============================================================
echo.

set "TARGET_DIR=%LOCALAPPDATA%\\AlliedOneERP"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

set "PS_SCRIPT=%TARGET_DIR%\\aol-attendance.ps1"
set "VBS_SCRIPT=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\AlliedOneAttendance.vbs"

echo [1/3] Installing self-updating background agent...
powershell -NoProfile -Command "$b64='${psScriptBase64}'; [System.IO.File]::WriteAllBytes('%PS_SCRIPT%', [System.Convert]::FromBase64String($b64))"

echo [2/3] Registering silent Windows startup launcher...
powershell -NoProfile -Command "$b64='${vbsScriptBase64}'; [System.IO.File]::WriteAllBytes('%VBS_SCRIPT%', [System.Convert]::FromBase64String($b64))"

echo [3/3] Starting background agent now...
wscript.exe "%VBS_SCRIPT%"

echo.
echo ==============================================================
echo   SUCCESS! Automated Attendance is now active.
echo   - Laptop opens at office  =>  AUTO CHECK-IN
echo   - Laptop shuts down       =>  AUTO CHECK-OUT
echo   - Agent auto-updates itself on every startup. No reinstall needed!
echo ==============================================================
echo.
pause
`;
        res.setHeader('Content-Disposition', `attachment; filename="AlliedOne-Attendance-${member.name.replace(/[^a-zA-Z0-9]/g, '_')}.bat"`);
        res.setHeader('Content-Type', 'application/x-bat');
        return res.send(batContent);

      } else {
        // macOS / Linux
        const shContent = `#!/bin/bash
# AlliedOne ERP - Zero-Browser Laptop Attendance (macOS/Linux)
# Self-updating agent for: ${member.name}

SERVER_URL="${serverUrl}"
TOKEN="${scriptToken}"
EMPLOYEE_NAME="${member.name}"
HOSTNAME_VAL="$(hostname)"
OS_NAME="$(uname -s)"

AGENT_DIR="$HOME/.alliedone_erp"
mkdir -p "$AGENT_DIR"
SCRIPT_PATH="$AGENT_DIR/aol-attendance.sh"

# Self-update: fetch latest script from server
NEW_SCRIPT=$(curl -sf --max-time 20 "$SERVER_URL/api/attendance/download-script?token=$TOKEN&os=sh_agent" 2>/dev/null)
NEW_LEN=$(echo -n "$NEW_SCRIPT" | wc -c)
if [ -n "$NEW_SCRIPT" ] && [ "$NEW_LEN" -gt 50 ]; then
  echo "$NEW_SCRIPT" > "$SCRIPT_PATH"
fi

cat << 'AGENT_EOF' > "$SCRIPT_PATH"
#!/bin/bash
SERVER_URL="${serverUrl}"
TOKEN="${scriptToken}"
EMPLOYEE_NAME="${member.name}"
HOSTNAME_VAL="$(hostname)"
OS_NAME="$(uname -s)"

send_ping() {
  curl -s -X POST "$SERVER_URL/api/attendance/client-ping" \\
    -H "Content-Type: application/json" \\
    -d "{\\"token\\":\\"$TOKEN\\",\\"action\\":\\"$1\\",\\"hostname\\":\\"$HOSTNAME_VAL\\",\\"os\\":\\"$OS_NAME\\"}" 2>/dev/null
}

trap 'send_ping "SHUTDOWN"' EXIT SIGTERM

RESP=$(send_ping "PING")
if echo "$RESP" | grep -q '"auto_checked_in":true'; then
  command -v osascript >/dev/null 2>&1 && osascript -e 'display notification "Automatically checked in via Office Wi-Fi" with title "AlliedOne ERP"'
fi

while true; do
  sleep 60
  send_ping "PING" > /dev/null
done
AGENT_EOF

chmod +x "$SCRIPT_PATH"

# Register as login item (macOS)
if [ "$(uname)" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/com.alliedone.erp.plist"
  cat > "$PLIST" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.alliedone.erp</string>
  <key>ProgramArguments</key><array><string>$SCRIPT_PATH</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
PLIST_EOF
  launchctl load "$PLIST" 2>/dev/null
fi

nohup "$SCRIPT_PATH" > /dev/null 2>&1 &

echo "======================================================"
echo "  AlliedOne ERP Agent installed and running!"
echo "  Employee: ${member.name}"
echo "  Auto-updates on each startup. No reinstall needed!"
echo "======================================================"
`;
        if (os === 'sh_agent') {
          res.setHeader('Content-Type', 'text/plain');
          return res.send(shContent);
        }
        res.setHeader('Content-Disposition', `attachment; filename="AlliedOne-Attendance-${member.name.replace(/[^a-zA-Z0-9]/g, '_')}.sh"`);
        res.setHeader('Content-Type', 'text/x-shellscript');
        return res.send(shContent);
      }
    });

    // ── ACTIVE LAPTOP DEVICES (Admin View) ───────────────────
    this.app.get('/api/attendance/active-devices', async (req, res) => {
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
      if (!token && req.query?.token) token = String(req.query.token);

      if (token) {
        try { (req as any).user = jwt.verify(token, JWT_SECRET); } catch {}
      }

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
             start_date LIKE ? OR
             end_date LIKE ? OR
             (start_date <= ? AND end_date >= ?)
           )
         ORDER BY start_date ASC`,
        [member_id, month + '%', month + '%', month + '-01', month + '-31']
      );
      res.json(rows);
    });
    this.app.post('/api/leaves', async (req, res) => {
      const { member_id, leave_type, start_date, end_date, reason } = req.body;
      if (!member_id || !leave_type || !start_date || !end_date) return res.status(400).json({ error: 'Missing required fields' });
      const { lastID } = await dbRun(`INSERT INTO leave_requests(member_id,leave_type,start_date,end_date,reason) VALUES(?,?,?,?,?)`, [member_id, leave_type, start_date, end_date, reason||'']);
      
      const member = await dbGet(`SELECT name FROM members WHERE id=?`, [member_id]) as any;
      const leaveMsg = `🌴 Leave Request: ${member?.name || 'An employee'} requested ${leave_type} leave (${start_date} to ${end_date}).${reason ? `\nReason: "${reason}"` : ''}`;
      await notifyAdmins(leaveMsg, '/hr?tab=leave');

      res.status(201).json(await dbGet(`SELECT l.*,m.name as member_name FROM leave_requests l JOIN members m ON l.member_id=m.id WHERE l.id=?`, [lastID]));
    });
    this.app.patch('/api/leaves/:id', async (req, res) => {
      const { status } = req.body;
      await dbRun(`UPDATE leave_requests SET status=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`, [status, req.params.id]);
      const leaveRow = await dbGet('SELECT * FROM leave_requests WHERE id=?', [req.params.id]) as any;
      if (leaveRow) {
        const member = await dbGet('SELECT name FROM members WHERE id=?', [leaveRow.member_id]) as any;
        await notifyMember(leaveRow.member_id, `Your ${leaveRow.leave_type} leave request has been ${status}.`, '/hr?tab=leave');
        await notifyAdmins(`📋 Leave Decision: ${member?.name || 'Employee'}'s ${leaveRow.leave_type} leave has been ${status}.`, '/hr?tab=leave');
      }
      res.json(leaveRow);
    });

    // ── NOTIFICATIONS ────────────────────────────────────────
    this.app.get('/api/notifications', async (req, res) => {
      const memberId = req.query.member_id;
      if (!memberId) return res.json([]);
      const falseVal = isPostgres() ? 'false' : '0';
      const notifs = await dbAll(`SELECT * FROM notifications WHERE member_id=? AND (is_read=${falseVal} OR is_read IS NULL) ORDER BY created_at DESC LIMIT 50`, [Number(memberId)]);
      res.json(notifs);
    });
    this.app.patch('/api/notifications/:id/read', async (req, res) => {
      const trueVal = isPostgres() ? 'true' : '1';
      await dbRun(`UPDATE notifications SET is_read=${trueVal} WHERE id=?`, [Number(req.params.id)]);
      res.json({ ok: true });
    });
    this.app.patch('/api/notifications/read-all', async (req, res) => {
      const { member_id } = req.body;
      if (!member_id) return res.status(400).json({ error: 'member_id required' });
      const trueVal = isPostgres() ? 'true' : '1';
      await dbRun(`UPDATE notifications SET is_read=${trueVal} WHERE member_id=?`, [Number(member_id)]);
      res.json({ ok: true });
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
    this.app.get('/api/expenses/daily-summary', async (req, res) => {
      const month = (req.query.month as string) || new Date().toISOString().substring(0, 7);
      // Get per-day totals and top-3 heads
      const days = await dbAll(
        `SELECT expense_date as date, SUM(amount) as total FROM expenses WHERE expense_date LIKE ? GROUP BY expense_date ORDER BY expense_date DESC`,
        [month+'%']
      ) as any[];
      const result = [];
      for (const day of days) {
        const heads = await dbAll(
          `SELECT expense_head, SUM(amount) as amt FROM expenses WHERE expense_date=? AND expense_head!='' GROUP BY expense_head ORDER BY amt DESC LIMIT 3`,
          [day.date]
        ) as any[];
        result.push({ date: day.date, total: day.total, top_heads: heads.map((h: any) => h.expense_head) });
      }
      res.json(result);
    });
    this.app.post('/api/expenses', async (req, res) => {
      const { category_id, amount, description, entered_by, expense_date, company_name, expense_head, payment_method } = req.body;
      if (amount === undefined || amount === null) return res.status(400).json({ error: 'amount required' });
      const date = expense_date || new Date().toISOString().split('T')[0];
      const { lastID } = await dbRun(
        `INSERT INTO expenses(category_id,amount,description,entered_by,expense_date,company_name,expense_head,payment_method) VALUES(?,?,?,?,?,?,?,?)`,
        [category_id||null, amount, description||'', entered_by||null, date, company_name||'', expense_head||'', payment_method||'Cash']
      );
      
      const member = entered_by ? await dbGet('SELECT name FROM members WHERE id=?', [entered_by]) as any : null;
      await notifyAdmins(`💰 Expense Logged: ৳${Number(amount).toLocaleString()} for ${description || 'expense'} (${company_name || 'General'})${member ? ` by ${member.name}` : ''}.`, '/accounting');

      res.status(201).json(await dbGet('SELECT e.*,c.name as category_name FROM expenses e LEFT JOIN expense_categories c ON e.category_id=c.id WHERE e.id=?', [lastID]));
    });
    this.app.patch('/api/expenses/:id', async (req, res) => {
      const { amount, description, expense_date, company_name, expense_head, payment_method } = req.body;
      const parts: string[] = [];
      const values: any[] = [];
      if (amount !== undefined) { parts.push('amount=?'); values.push(Number(amount)); }
      if (description !== undefined) { parts.push('description=?'); values.push(description); }
      if (expense_date) { parts.push('expense_date=?'); values.push(expense_date); }
      if (company_name) { parts.push('company_name=?'); values.push(company_name); }
      if (expense_head) { parts.push('expense_head=?'); values.push(expense_head); }
      if (payment_method) { parts.push('payment_method=?'); values.push(payment_method); }
      if (parts.length === 0) return res.status(400).json({ error: 'No fields to update' });
      values.push(req.params.id);
      await dbRun(`UPDATE expenses SET ${parts.join(',')} WHERE id=?`, values);
      res.json(await dbGet('SELECT * FROM expenses WHERE id=?', [req.params.id]));
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
        
        let schedStr = String(m.scheduled_at).trim();
        if (!schedStr.includes('Z') && !/[+-]\d{2}(:?\d{2})?$/.test(schedStr)) {
          if (schedStr.includes(' ') && !schedStr.includes('T')) schedStr = schedStr.replace(' ', 'T');
          schedStr += '+06:00';
        }
        const scheduledTime = new Date(schedStr);
        const diffMinutes = Math.round((scheduledTime.getTime() - now.getTime()) / (1000 * 60));
        
        if (minutesToAlert.includes(diffMinutes)) {
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
          const cutoffIso = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();
          const expiredSessions = await dbAll(
            `SELECT a.member_id, a.last_seen, m.name
             FROM active_sessions a
             JOIN members m ON a.member_id = m.id
             WHERE a.is_wifi = 1
               AND a.last_seen < ?`,
            [cutoffIso]
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

      // 5. Check Tasks for REMINDER actions (30 mins before deadline, Asia/Dhaka timezone aware)
      try {
        const tasks = await dbAll(`SELECT * FROM tasks WHERE action_type = 'REMINDER' AND status != 'DONE' AND deadline IS NOT NULL`) as any[];
        for (const t of tasks) {
          if (!t.deadline) continue;
          let deadlineStr = String(t.deadline).trim();
          if (!deadlineStr.includes('Z') && !/[+-]\d{2}(:?\d{2})?$/.test(deadlineStr)) {
            if (deadlineStr.includes(' ') && !deadlineStr.includes('T')) deadlineStr = deadlineStr.replace(' ', 'T');
            deadlineStr += '+06:00';
          }
          const deadlineTime = new Date(deadlineStr);
          if (isNaN(deadlineTime.getTime())) continue;
          
          const diffMinutes = Math.round((deadlineTime.getTime() - now.getTime()) / (1000 * 60));
          
          // Trigger when 30 minutes or less remaining until deadline
          if (diffMinutes <= 30 && diffMinutes >= 0 && t.assigned_to) {
            const memberId = Number(t.assigned_to);
            const existingNotif = await dbGet(
              `SELECT id FROM notifications WHERE member_id=? AND message LIKE ?`,
              [memberId, `%The task "${t.title}"%`]
            );
            if (!existingNotif) {
              const msg = `Reminder: The task "${t.title}" is due in ${diffMinutes <= 1 ? 'less than a minute' : diffMinutes + ' minutes'}!`;
              await notifyMember(memberId, msg, '/dashboard');
              console.log(`[ALERT] Task '${t.title}' reminder sent to assignee member #${memberId}.`);
            }
          }
        }
      } catch (err) {
        console.error('Error in Task reminders cron:', err);
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
