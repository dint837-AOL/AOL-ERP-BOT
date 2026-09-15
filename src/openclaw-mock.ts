import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { initDB, dbAll, dbGet, dbRun, isPostgres } from './db.js';
import { sendTelegramMessage, getTelegramBotInfo, setRuntimeBotToken, getBotToken } from './telegram.js';
import {
  sendBrevoEmail,
  resolveMemberNotificationEmails,
  schedule24And15HourReminders,
  scheduleTenderReminders,
  scheduleCustomReminders,
  processDueEmailJobs,
  buildAolErpHtml
} from './brevo.js';

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
  } else {
    console.log(`[Telegram] Skipped member notification for member #${memberId}: No telegram_chat_id found on member and no TELEGRAM_CHAT_ID fallback.`);
  }
}

async function notifyAdmins(message: string, link: string = '') {
  const admins = await dbAll("SELECT id, name, telegram_chat_id FROM members WHERE role = 'Admin'") as any[];
  
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
      console.log(`[Telegram] Sending admin alert to chat_id=${cid} for admin "${admin.name}"`);
      sendTelegramMessage(cid, message).catch(console.error);
    }
  }

  if (fallbackChatId && !sentChatIds.has(fallbackChatId)) {
    sentChatIds.add(fallbackChatId);
    console.log(`[Telegram] Sending admin alert to fallback chat_id=${fallbackChatId}`);
    sendTelegramMessage(fallbackChatId, message).catch(console.error);
  }

  if (sentChatIds.size === 0) {
    console.warn('[Telegram] Skipped admin notification: No Admin has a telegram_chat_id in members table, and TELEGRAM_CHAT_ID is not set in environment.');
  }
}

function formatReminderParts(days?: number | null, hours?: number | null, minutes?: number | null): string {
  const parts: string[] = [];
  if (Number(days) > 0) parts.push(`${Number(days)} day(s)`);
  if (Number(hours) > 0) parts.push(`${Number(hours)} hour(s)`);
  if (Number(minutes) > 0) parts.push(`${Number(minutes)} minute(s)`);
  return parts.join(', ');
}

async function notifyReminderConfigured(params: {
  entityLabel: string;
  title: string;
  link: string;
  remDays?: number | null;
  remHours?: number | null;
  remMins?: number | null;
  alsoMemberId?: number | null;
}) {
  const parts = formatReminderParts(params.remDays, params.remHours, params.remMins);
  if (!parts) return;
  const msg = `Reminder set for ${params.entityLabel}: "${params.title}" (${parts} before).`;
  await notifyAdmins(msg, params.link);
  if (params.alsoMemberId) {
    const m = await dbGet('SELECT role FROM members WHERE id=?', [params.alsoMemberId]) as any;
    if (m && m.role !== 'Admin') {
      await dbRun(`INSERT INTO notifications(member_id,message,link) VALUES(?,?,?)`, [params.alsoMemberId, msg, params.link]);
    }
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

    // Load any Telegram configurations saved in database settings
    try {
      const savedTokenRow = await dbGet("SELECT value FROM settings WHERE key = 'telegram_bot_token'") as any;
      if (savedTokenRow?.value) {
        setRuntimeBotToken(savedTokenRow.value);
        console.log('[Telegram] Loaded TELEGRAM_BOT_TOKEN from database settings.');
      }
      const savedChatRow = await dbGet("SELECT value FROM settings WHERE key = 'telegram_chat_id'") as any;
      if (savedChatRow?.value && !process.env.TELEGRAM_CHAT_ID) {
        process.env.TELEGRAM_CHAT_ID = savedChatRow.value;
        console.log('[Telegram] Loaded TELEGRAM_CHAT_ID from database settings.');
      }
    } catch (e) {
      console.error('[Telegram] Settings load error:', e);
    }

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

    // ── RAW REQUEST LOGGER (debug) ──────────────────────────
    this.app.use((req, _res, next) => {
      if (req.method === 'POST' && req.path.includes('/tasks')) {
        console.log(`[RAW] POST /api/tasks hit — body keys: ${Object.keys(req.body || {}).join(', ')}`);
      }
      next();
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
      const requestingUser = (req as any).user;
      const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const includeArchived = req.query.archived === 'true';
      const archivedFilter = includeArchived ? 't.is_archived=1' : '(t.is_archived=0 OR t.is_archived IS NULL)';
      // Employees only see their own assigned tasks
      if (requestingUser?.role !== 'Admin') {
        const memberId = requestingUser?.id;
        return res.json(await dbAll(
          `SELECT t.*,m.name as assignee_name,m.avatar_color as assignee_color FROM tasks t LEFT JOIN members m ON t.assigned_to=m.id WHERE (date(t.task_date) = date(?) OR (date(t.task_date) < date(?) AND t.status != 'DONE')) AND ${archivedFilter} AND t.assigned_to=? ORDER BY t.task_date DESC, t.created_at DESC`,
          [date, date, memberId]
        ));
      }
      res.json(await dbAll(`SELECT t.*,m.name as assignee_name,m.avatar_color as assignee_color FROM tasks t LEFT JOIN members m ON t.assigned_to=m.id WHERE (date(t.task_date) = date(?) OR (date(t.task_date) < date(?) AND t.status != 'DONE')) AND ${archivedFilter} ORDER BY t.task_date DESC, t.created_at DESC`, [date, date]));
    });
    // Only Admins can create tasks
    this.app.post('/api/tasks', requireRole('Admin'), async (req, res) => {
      const { title, description, deadline, priority, assigned_to, task_date, action_type, recipient, status, notify_telegram, notify_email, reminder_days, reminder_hours, reminder_minutes } = req.body;
      if (!title) return res.status(400).json({ error: 'Title required' });
      const date = task_date || new Date().toISOString().split('T')[0];
      const remDays = reminder_days !== undefined && reminder_days !== '' && reminder_days !== null ? Number(reminder_days) : null;
      const remHours = reminder_hours !== undefined && reminder_hours !== '' && reminder_hours !== null ? Number(reminder_hours) : null;
      const remMins = reminder_minutes !== undefined && reminder_minutes !== '' && reminder_minutes !== null ? Number(reminder_minutes) : null;
      const hasReminder = (remDays && remDays > 0) || (remHours && remHours > 0) || (remMins && remMins > 0);
      // Telegram still uses the bell toggle; email is now always-on for assigned tasks
      const shouldNotifyTg = (notify_telegram || hasReminder) ? 1 : 0;
      const initialStatus = status || 'DONE';
      
      const { lastID } = await dbRun(
        `INSERT INTO tasks(title,description,deadline,priority,assigned_to,task_date,action_type,recipient,status,notify_telegram,notify_email,reminder_days,reminder_hours,reminder_minutes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [title, description||'', deadline||null, priority||'GREEN', assigned_to||null, date, action_type||'STUDY', recipient||'', initialStatus, shouldNotifyTg, 1, remDays, remHours, remMins]
      );
      
      const newTask = await dbGet(`SELECT t.*,m.name as assignee_name,m.avatar_color as assignee_color FROM tasks t LEFT JOIN members m ON t.assigned_to=m.id WHERE t.id=?`, [lastID]) as any;
      
      // In-app notifications & Telegram/Brevo alerts
      console.log(`[Task] Created task "${title}" assigned_to=${assigned_to} (type: ${typeof assigned_to})`);
      if (assigned_to) {
        const assignee = await dbGet('SELECT name FROM members WHERE id=?', [assigned_to]) as any;
        await dbRun(`INSERT INTO notifications(member_id,message,link) VALUES(?,?,?)`, [assigned_to, `New Task Assigned: "${title}"`, '/dashboard']);
        
        // Telegram notification: only if bell is on AND status is NOT done
        if (shouldNotifyTg && initialStatus !== 'DONE') {
          await notifyMember(assigned_to, `New Task Assigned: "${title}"`, '/dashboard');
          await notifyAdmins(`New Task: "${title}" (Assigned to ${assignee?.name || 'employee'}).`, '/dashboard');
        }

        // Brevo email: always send to assigned employee (no bell required)
        console.log(`[Task] Resolving emails for member id=${assigned_to}...`);
        const emails = await resolveMemberNotificationEmails(assigned_to);
        console.log(`[Task] Resolved emails: [${emails.join(', ')}]`);
        const emailHtml = buildAolErpHtml('New Task Assigned', [
          { label: 'Name', value: assignee?.name || 'Assigned Member' },
          { label: 'Task', value: title },
          { label: 'Status', value: initialStatus },
          { label: 'Deadline', value: deadline ? new Date(deadline).toLocaleString('en-GB') : 'No Deadline' },
          { label: 'Contact', value: recipient || '—' },
        ]);
        console.log(`[Task] Calling sendBrevoEmail to [${emails.join(', ')}]...`);
        sendBrevoEmail({ to: emails, subject: `AOL_ERP: New Task - ${title}`, htmlContent: emailHtml }).catch(console.error);

        // Schedule 24h/15h auto-reminders only if deadline set and no custom reminder
        if (deadline && !hasReminder) {
          schedule24And15HourReminders({
            entityType: 'task',
            entityId: lastID,
            targetDateTime: deadline,
            recipientEmails: emails,
            title: `Task Deadline: ${title}`,
            rows: [
              { label: 'Name', value: assignee?.name || 'Assigned Member' },
              { label: 'Task', value: title },
              { label: 'Deadline', value: new Date(deadline).toLocaleString('en-GB') },
            ]
          }).catch(console.error);
        }
      } else if (shouldNotifyTg && initialStatus !== 'DONE') {
        await notifyAdmins(`New Task Created: "${title}" (Unassigned).`, '/dashboard');
      }

      // Custom Day/Hour/Minute reminders — always schedule when set on create
      if (hasReminder && deadline) {
        const emails = await resolveMemberNotificationEmails(assigned_to || 'Admin');
        scheduleCustomReminders({
          entityType: 'task',
          entityId: lastID,
          targetDateTime: deadline,
          recipientEmails: emails,
          title,
          rows: [
            { label: 'Task', value: title },
            { label: 'Assignee', value: newTask?.assignee_name || '—' },
            { label: 'Deadline', value: new Date(deadline).toLocaleString('en-GB') },
          ],
          reminderDays: remDays,
          reminderHours: remHours,
          reminderMinutes: remMins,
        }).catch(console.error);
        await notifyReminderConfigured({
          entityLabel: 'Task',
          title,
          link: '/dashboard',
          remDays,
          remHours,
          remMins,
          alsoMemberId: assigned_to ? Number(assigned_to) : null,
        });
      }

      res.status(201).json(newTask);
    });

    this.app.patch('/api/tasks/:id', async (req, res) => {
      const requestingUser = (req as any).user;
      const oldTask = await dbGet(`SELECT t.*, m.name as assignee_name FROM tasks t LEFT JOIN members m ON t.assigned_to=m.id WHERE t.id=?`, [req.params.id]) as any;

      // Employees can only update status on tasks assigned to them
      if (requestingUser?.role !== 'Admin') {
        if (!oldTask || Number(oldTask.assigned_to) !== Number(requestingUser?.id)) {
          return res.status(403).json({ error: 'You can only update tasks assigned to you.' });
        }
        if (Object.keys(req.body).some(k => k !== 'status')) {
          return res.status(403).json({ error: 'Employees may only update task status.' });
        }
      } else if ('status' in req.body) {
        // Admin cannot change status unless they are the assignee
        if (Number(oldTask?.assigned_to) !== Number(requestingUser?.id)) {
          delete req.body.status;
        }
      }

      const allowed = ['status', 'priority', 'title', 'description', 'deadline', 'assigned_to', 'action_type', 'recipient', 'is_archived', 'notify_telegram', 'notify_email', 'reminder_days', 'reminder_hours', 'reminder_minutes'];
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

      // Reschedule custom reminders when relevant fields change
      if (updatedTask && ('reminder_days' in req.body || 'reminder_hours' in req.body || 'reminder_minutes' in req.body || 'deadline' in req.body || 'notify_email' in req.body)) {
        const hasReminder = (Number(updatedTask.reminder_days) > 0) || (Number(updatedTask.reminder_hours) > 0) || (Number(updatedTask.reminder_minutes) > 0);
        if (updatedTask.notify_email && hasReminder && updatedTask.deadline) {
          const emails = await resolveMemberNotificationEmails(updatedTask.assigned_to || 'Admin');
          scheduleCustomReminders({
            entityType: 'task',
            entityId: Number(req.params.id),
            targetDateTime: updatedTask.deadline,
            recipientEmails: emails,
            title: updatedTask.title,
            rows: [
              { label: 'Task', value: updatedTask.title },
              { label: 'Assignee', value: updatedTask.assignee_name || '—' },
              { label: 'Deadline', value: new Date(updatedTask.deadline).toLocaleString('en-GB') },
            ],
            reminderDays: updatedTask.reminder_days,
            reminderHours: updatedTask.reminder_hours,
            reminderMinutes: updatedTask.reminder_minutes,
          }).catch(console.error);
          if ('reminder_days' in req.body || 'reminder_hours' in req.body || 'reminder_minutes' in req.body) {
            await notifyReminderConfigured({
              entityLabel: 'Task',
              title: updatedTask.title,
              link: '/dashboard',
              remDays: updatedTask.reminder_days,
              remHours: updatedTask.reminder_hours,
              remMins: updatedTask.reminder_minutes,
              alsoMemberId: updatedTask.assigned_to ? Number(updatedTask.assigned_to) : null,
            });
          }
        } else {
          dbRun('DELETE FROM email_jobs WHERE entity_type = ? AND entity_id = ? AND status = ?', ['task', req.params.id, 'PENDING']).catch(() => {});
        }
      }
      
      if (oldTask && updatedTask) {
        const user = requestingUser;
        const isTelegramEnabled = !!updatedTask.notify_telegram;
        
        // If status changed
        if (req.body.status && req.body.status !== oldTask.status) {
          const newStatus = req.body.status;
          const msg = `Task Status: "${updatedTask.title}" marked as ${newStatus} by ${user?.name || 'employee'}.`;
          
          // Always log in-app notification for admins
          const admins = await dbAll("SELECT id FROM members WHERE role = 'Admin'") as any[];
          for (const a of admins) {
            await dbRun(`INSERT INTO notifications(member_id,message,link) VALUES(?,?,?)`, [a.id, msg, '/dashboard']);
          }
          
          // Telegram Rule: Do NOT send if task is DONE, and ONLY send if bell notification is enabled!
          if (isTelegramEnabled && newStatus !== 'DONE') {
            await notifyAdmins(msg, '/dashboard');
          }
        }
        
        // If task was re-assigned to someone else
        if (req.body.assigned_to && req.body.assigned_to !== oldTask.assigned_to) {
          const assignMsg = `You have been assigned a task: "${updatedTask.title}"`;
          await dbRun(`INSERT INTO notifications(member_id,message,link) VALUES(?,?,?)`, [req.body.assigned_to, assignMsg, '/dashboard']);
          if (isTelegramEnabled && updatedTask.status !== 'DONE') {
            await notifyMember(req.body.assigned_to, assignMsg, '/dashboard');
          }
        }
      }

      res.json(updatedTask);
    });
    // Only Admins can delete tasks
    this.app.delete('/api/tasks/:id', requireRole('Admin'), async (req, res) => { await dbRun('DELETE FROM tasks WHERE id=?', [req.params.id]); res.json({ ok: true }); });

    // ── TELEGRAM TEST & CONFIGURATION ─────────────────────────
    this.app.post('/api/settings/telegram', requireRole('Admin'), async (req, res) => {
      const { token, chat_id } = req.body;
      if (token !== undefined) {
        const cleanToken = token.trim();
        try {
          if (isPostgres()) {
            await dbRun("INSERT INTO settings(key, value) VALUES('telegram_bot_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [cleanToken]);
          } else {
            await dbRun("INSERT OR REPLACE INTO settings(key, value) VALUES('telegram_bot_token', ?)", [cleanToken]);
          }
        } catch (e) {
          await dbRun("INSERT OR REPLACE INTO settings(key, value) VALUES('telegram_bot_token', ?)", [cleanToken]).catch(console.error);
        }
        setRuntimeBotToken(cleanToken);
      }
      if (chat_id !== undefined) {
        const cleanChatId = chat_id.trim();
        try {
          if (isPostgres()) {
            await dbRun("INSERT INTO settings(key, value) VALUES('telegram_chat_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [cleanChatId]);
          } else {
            await dbRun("INSERT OR REPLACE INTO settings(key, value) VALUES('telegram_chat_id', ?)", [cleanChatId]);
          }
        } catch (e) {
          await dbRun("INSERT OR REPLACE INTO settings(key, value) VALUES('telegram_chat_id', ?)", [cleanChatId]).catch(console.error);
        }
        process.env.TELEGRAM_CHAT_ID = cleanChatId;
      }
      const botInfo = await getTelegramBotInfo();
      res.json({ success: true, botInfo, hasToken: !!getBotToken() });
    });

    this.app.post('/api/test-telegram', requireRole('Admin'), async (req, res) => {
      const { chat_id } = req.body;
      if (!chat_id) return res.status(400).json({ error: 'chat_id is required' });
      
      const result = await sendTelegramMessage(chat_id, 'Test message from AOL ERP Bot! If you receive this, notifications are working.');
      res.json(result);
    });

    // ── TEST EMAIL (Brevo) ────────────────────────────────────
    this.app.post('/api/test-email', requireRole('Admin'), async (req, res) => {
      const { to } = req.body;
      const recipient = to || 'kamrulmdislam19@gmail.com';
      const apiKey = process.env.BREVO_API_KEY || '';
      console.log(`[Test-Email] Attempting to send test email to ${recipient}. BREVO_API_KEY set: ${!!apiKey}`);
      try {
        const result = await sendBrevoEmail({
          to: recipient,
          subject: 'AOL_ERP: Test Email from Render',
          htmlContent: `<h2>Test Email</h2><p>If you see this, Brevo is working from Render! Sent at ${new Date().toISOString()}</p>`
        });
        console.log(`[Test-Email] Result:`, JSON.stringify(result));
        res.json({
          success: result.success,
          messageId: result.messageId,
          error: result.error,
          brevo_api_key_set: !!apiKey,
          recipient,
          timestamp: new Date().toISOString()
        });
      } catch (err: any) {
        console.error('[Test-Email] Exception:', err.message);
        res.status(500).json({ success: false, error: err.message, brevo_api_key_set: !!apiKey });
      }
    });

    this.app.post('/api/debug-env', requireRole('Admin'), async (req, res) => {
      const token = getBotToken();
      const hasToken = !!token;
      const botInfo = await getTelegramBotInfo();
      res.json({ keys: Object.keys(process.env), hasToken, botInfo, telegramChatIdEnv: process.env.TELEGRAM_CHAT_ID || '' });
    });

    this.app.get('/api/telegram/status', requireRole('Admin'), async (req, res) => {
      const botInfo = await getTelegramBotInfo();
      const defaultChatId = process.env.TELEGRAM_CHAT_ID?.trim() || '';
      const adminMembers = await dbAll("SELECT id, name, role, telegram_chat_id FROM members WHERE role = 'Admin'") as any[];
      res.json({
        ...botInfo,
        defaultChatId,
        adminMembers,
        hasToken: !!getBotToken()
      });
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
      if (!member_id) return res.status(400).json({ error: 'member_id required' });

      const requestingUser = (req as any).user;
      if (requestingUser?.role !== 'Admin' && Number(member_id) !== Number(requestingUser?.id)) {
        return res.status(403).json({ error: 'You can only check in/out for yourself.' });
      }

      const todayDhaka = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
      const existing = await dbGet(
        `SELECT id, action_type FROM attendance
         WHERE member_id=? AND action_type=?
           AND date(timestamp) = date(?)
         LIMIT 1`,
        [member_id, action_type, todayDhaka]
      ) as any;
      // Also catch timezone-stored ISO timestamps by scanning today's rows
      if (!existing) {
        const todayRows = await dbAll(
          `SELECT id, action_type, timestamp FROM attendance WHERE member_id=? AND action_type=? ORDER BY id DESC LIMIT 20`,
          [member_id, action_type]
        ) as any[];
        const dup = todayRows.find(r => {
          try {
            return new Date(r.timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }) === todayDhaka;
          } catch { return false; }
        });
        if (dup) {
          return res.status(409).json({
            error: action_type === 'IN' ? 'Already checked in today.' : 'Already checked out today.',
            code: 'ALREADY_RECORDED'
          });
        }
      } else {
        return res.status(409).json({
          error: action_type === 'IN' ? 'Already checked in today.' : 'Already checked out today.',
          code: 'ALREADY_RECORDED'
        });
      }

      if (action_type === 'OUT') {
        const hasIn = await dbAll(
          `SELECT id, timestamp FROM attendance WHERE member_id=? AND action_type='IN' ORDER BY id DESC LIMIT 20`,
          [member_id]
        ) as any[];
        const inToday = hasIn.some(r => {
          try {
            return new Date(r.timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }) === todayDhaka;
          } catch { return false; }
        });
        if (!inToday) {
          return res.status(400).json({ error: 'Cannot check out before check-in.' });
        }
      }

      const nowIso = new Date().toISOString();
      const { lastID } = await dbRun('INSERT INTO attendance(member_id,action_type,timestamp) VALUES(?,?,?)', [member_id, action_type, nowIso]);
      const rec = await dbGet(`SELECT a.*,m.name as member_name FROM attendance a LEFT JOIN members m ON a.member_id=m.id WHERE a.id=?`, [lastID]) as any;
      
      const empName = rec?.member_name || 'An employee';
      const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Dhaka' });
      if (action_type === 'IN') {
        await notifyAdmins(`Check-In: ${empName} checked in at ${timeStr}.`, '/hr?tab=att');
      } else {
        await notifyAdmins(`Check-Out: ${empName} checked out at ${timeStr}.`, '/hr?tab=att');
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
          await notifyAdmins(`Wi-Fi Auto Check-In: ${member.name} connected to Office Wi-Fi.`, '/hr?tab=att');
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
          await notifyAdmins(`Wi-Fi Auto Check-Out: ${member.name} disconnected from Office Wi-Fi.`, '/hr?tab=att');
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
          await notifyAdmins(`Laptop Auto Check-Out: ${member.name} turned off laptop (${hostname || 'Workstation'}).`, '/hr?tab=att');
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
          await notifyAdmins(`Laptop Auto Check-In: ${member.name} opened laptop (${hostname || 'Workstation'}).`, '/hr?tab=att');
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
      const { member_id, leave_type, start_date, end_date, reason, notify_email, reminder_days, reminder_hours, reminder_minutes } = req.body;
      if (!member_id || !leave_type || !start_date || !end_date) return res.status(400).json({ error: 'Missing required fields' });
      const remDays = reminder_days !== undefined && reminder_days !== '' && reminder_days !== null ? Number(reminder_days) : null;
      const remHours = reminder_hours !== undefined && reminder_hours !== '' && reminder_hours !== null ? Number(reminder_hours) : null;
      const remMins = reminder_minutes !== undefined && reminder_minutes !== '' && reminder_minutes !== null ? Number(reminder_minutes) : null;
      const hasReminder =
        (Number.isFinite(remDays as number) && (remDays as number) > 0) ||
        (Number.isFinite(remHours as number) && (remHours as number) > 0) ||
        (Number.isFinite(remMins as number) && (remMins as number) > 0);
      const shouldNotify = notify_email !== undefined ? (notify_email ? 1 : 0) : (hasReminder ? 1 : 0);
      const { lastID } = await dbRun(
        `INSERT INTO leave_requests(member_id,leave_type,start_date,end_date,reason,notify_email,reminder_days,reminder_hours,reminder_minutes) VALUES(?,?,?,?,?,?,?,?,?)`,
        [member_id, leave_type, start_date, end_date, reason||'', shouldNotify, remDays, remHours, remMins]
      );
      
      const member = await dbGet(`SELECT name, email, notify_email FROM members WHERE id=?`, [member_id]) as any;
      const leaveMsg = `Leave Request: ${member?.name || 'An employee'} requested ${leave_type} leave (${start_date} to ${end_date}).${reason ? `\nReason: "${reason}"` : ''}`;
      await notifyAdmins(leaveMsg, '/hr?tab=leave');

      if (true) {
        const recipientEmails = await resolveMemberNotificationEmails(member_id);
        const emailRows = [
          { label: 'Name', value: member?.name || 'Employee' },
          { label: 'Leave', value: leave_type },
          { label: 'From', value: `${start_date} to ${end_date}` },
          ...(reason ? [{ label: 'Reason', value: reason }] : [])
        ];
        const emailHtml = buildAolErpHtml('Leave Application Submitted', emailRows);
        sendBrevoEmail({
          to: recipientEmails,
          subject: `AOL_ERP: Leave Application - ${member?.name || 'Employee'} (${leave_type})`,
          htmlContent: emailHtml
        }).catch(console.error);

        let targetDateTime = String(start_date).trim();
        if (!targetDateTime.includes('T')) targetDateTime = `${targetDateTime}T09:00:00+06:00`;
        else if (!targetDateTime.includes('Z') && !/[+-]\d{2}(:?\d{2})?$/.test(targetDateTime)) targetDateTime += '+06:00';

        if (hasReminder) {
          scheduleCustomReminders({
            entityType: 'leave',
            entityId: lastID,
            targetDateTime,
            recipientEmails,
            title: `Leave: ${member?.name || 'Employee'} (${leave_type})`,
            rows: emailRows,
            reminderDays: remDays,
            reminderHours: remHours,
            reminderMinutes: remMins,
          }).catch(console.error);
          await notifyReminderConfigured({
            entityLabel: 'Leave',
            title: `${member?.name || 'Employee'} (${leave_type})`,
            link: '/hr?tab=leave',
            remDays,
            remHours,
            remMins,
            alsoMemberId: Number(member_id),
          });
        } else {
          schedule24And15HourReminders({
            entityType: 'leave',
            entityId: lastID,
            targetDateTime,
            recipientEmails,
            title: `Leave: ${member?.name || 'Employee'} (${leave_type})`,
            rows: emailRows
          }).catch(console.error);
        }
      }

      res.status(201).json(await dbGet(`SELECT l.*,m.name as member_name FROM leave_requests l JOIN members m ON l.member_id=m.id WHERE l.id=?`, [lastID]));
    });
    this.app.patch('/api/leaves/:id', async (req, res) => {
      const { status, leave_type, start_date, end_date, reason, notify_email, reminder_days, reminder_hours, reminder_minutes } = req.body;
      if (status) {
        // Status update (Approve / Reject / Cancel)
        await dbRun(`UPDATE leave_requests SET status=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`, [status, req.params.id]);
        const leaveRow = await dbGet('SELECT * FROM leave_requests WHERE id=?', [req.params.id]) as any;
        if (leaveRow) {
          const member = await dbGet('SELECT name FROM members WHERE id=?', [leaveRow.member_id]) as any;
          await notifyMember(leaveRow.member_id, `Your ${leaveRow.leave_type} leave request has been ${status}.`, '/hr?tab=leave');
          await notifyAdmins(`Leave Decision: ${member?.name || 'Employee'}'s ${leaveRow.leave_type} leave has been ${status}.`, '/hr?tab=leave');

          if (true) {
            const recipientEmails = await resolveMemberNotificationEmails(leaveRow.member_id);
            const emailRows = [
              { label: 'Name', value: member?.name || 'Employee' },
              { label: 'Leave', value: leaveRow.leave_type },
              { label: 'Status', value: status },
              { label: 'From', value: `${leaveRow.start_date} to ${leaveRow.end_date}` }
            ];
            const emailHtml = buildAolErpHtml(`Leave Request ${status}`, emailRows);
            sendBrevoEmail({
              to: recipientEmails,
              subject: `AOL_ERP: Leave Request ${status} - ${member?.name || 'Employee'}`,
              htmlContent: emailHtml
            }).catch(console.error);

            if (status === 'APPROVED') {
              let targetDateTime = String(leaveRow.start_date).trim();
              if (!targetDateTime.includes('T')) targetDateTime = `${targetDateTime}T09:00:00+06:00`;
              else if (!targetDateTime.includes('Z') && !/[+-]\d{2}(:?\d{2})?$/.test(targetDateTime)) targetDateTime += '+06:00';
              const hasReminder =
                (Number(leaveRow.reminder_days) > 0) ||
                (Number(leaveRow.reminder_hours) > 0) ||
                (Number(leaveRow.reminder_minutes) > 0);
              if (hasReminder) {
                scheduleCustomReminders({
                  entityType: 'leave',
                  entityId: Number(req.params.id),
                  targetDateTime,
                  recipientEmails,
                  title: `Upcoming Leave: ${member?.name || 'Employee'} (${leaveRow.leave_type})`,
                  rows: emailRows,
                  reminderDays: leaveRow.reminder_days,
                  reminderHours: leaveRow.reminder_hours,
                  reminderMinutes: leaveRow.reminder_minutes,
                }).catch(console.error);
              } else {
                schedule24And15HourReminders({
                  entityType: 'leave',
                  entityId: Number(req.params.id),
                  targetDateTime,
                  recipientEmails,
                  title: `Upcoming Leave: ${member?.name || 'Employee'} (${leaveRow.leave_type})`,
                  rows: emailRows
                }).catch(console.error);
              }
            }
          }
        }
        return res.json(await dbGet(`SELECT l.*,m.name as member_name,m.avatar_color FROM leave_requests l JOIN members m ON l.member_id=m.id WHERE l.id=?`, [req.params.id]));
      } else {
        // Field update (Edit / revise leave details)
        const current = await dbGet('SELECT * FROM leave_requests WHERE id=?', [req.params.id]) as any;
        if (!current) return res.status(404).json({ error: 'Not found' });

        const nextDays = reminder_days !== undefined
          ? (reminder_days === '' || reminder_days === null ? null : Number(reminder_days))
          : (current.reminder_days ?? null);
        const nextHours = reminder_hours !== undefined
          ? (reminder_hours === '' || reminder_hours === null ? null : Number(reminder_hours))
          : (current.reminder_hours ?? null);
        const nextMins = reminder_minutes !== undefined
          ? (reminder_minutes === '' || reminder_minutes === null ? null : Number(reminder_minutes))
          : (current.reminder_minutes ?? null);
        const hasReminder =
          (Number(nextDays) > 0) || (Number(nextHours) > 0) || (Number(nextMins) > 0);
        const nextNotify = notify_email !== undefined
          ? (notify_email ? 1 : 0)
          : (hasReminder ? 1 : (current.notify_email ? 1 : 0));

        await dbRun(
          `UPDATE leave_requests SET
            leave_type=?,
            start_date=?,
            end_date=?,
            reason=?,
            notify_email=?,
            reminder_days=?,
            reminder_hours=?,
            reminder_minutes=?
          WHERE id=?`,
          [
            leave_type !== undefined ? leave_type : current.leave_type,
            start_date !== undefined ? start_date : current.start_date,
            end_date !== undefined ? end_date : current.end_date,
            reason !== undefined ? reason : current.reason,
            nextNotify,
            nextDays,
            nextHours,
            nextMins,
            req.params.id,
          ]
        );

        const leaveRow = await dbGet(`SELECT l.*,m.name as member_name,m.avatar_color FROM leave_requests l JOIN members m ON l.member_id=m.id WHERE l.id=?`, [req.params.id]) as any;
        if (leaveRow && leaveRow.notify_email) {
          const member = await dbGet('SELECT name FROM members WHERE id=?', [leaveRow.member_id]) as any;
          const recipientEmails = await resolveMemberNotificationEmails(leaveRow.member_id);
          const emailRows = [
            { label: 'Name', value: member?.name || 'Employee' },
            { label: 'Leave', value: leaveRow.leave_type },
            { label: 'From', value: `${leaveRow.start_date} to ${leaveRow.end_date}` }
          ];
          let targetDateTime = String(leaveRow.start_date).trim();
          if (!targetDateTime.includes('T')) targetDateTime = `${targetDateTime}T09:00:00+06:00`;
          else if (!targetDateTime.includes('Z') && !/[+-]\d{2}(:?\d{2})?$/.test(targetDateTime)) targetDateTime += '+06:00';

          if (hasReminder) {
            scheduleCustomReminders({
              entityType: 'leave',
              entityId: Number(req.params.id),
              targetDateTime,
              recipientEmails,
              title: `Updated Leave: ${member?.name || 'Employee'} (${leaveRow.leave_type})`,
              rows: emailRows,
              reminderDays: leaveRow.reminder_days,
              reminderHours: leaveRow.reminder_hours,
              reminderMinutes: leaveRow.reminder_minutes,
            }).catch(console.error);
            if (reminder_days !== undefined || reminder_hours !== undefined || reminder_minutes !== undefined) {
              await notifyReminderConfigured({
                entityLabel: 'Leave',
                title: `${member?.name || 'Employee'} (${leaveRow.leave_type})`,
                link: '/hr?tab=leave',
                remDays: leaveRow.reminder_days,
                remHours: leaveRow.reminder_hours,
                remMins: leaveRow.reminder_minutes,
                alsoMemberId: Number(leaveRow.member_id),
              });
            }
          } else {
            schedule24And15HourReminders({
              entityType: 'leave',
              entityId: Number(req.params.id),
              targetDateTime,
              recipientEmails,
              title: `Updated Leave: ${member?.name || 'Employee'} (${leaveRow.leave_type})`,
              rows: emailRows
            }).catch(console.error);
          }
        }
        return res.json(leaveRow);
      }
    });
    this.app.delete('/api/leaves/:id', requireRole('Admin'), async (req, res) => {
      await dbRun('DELETE FROM email_jobs WHERE entity_type=? AND entity_id=?', ['leave', Number(req.params.id)]);
      await dbRun('DELETE FROM leave_requests WHERE id=?', [req.params.id]);
      res.json({ ok: true });
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

    // ── EXPENSES (Admin only) ─────────────────────────────────
    this.app.get('/api/expense-categories', requireRole('Admin'), async (_, res) => res.json(await dbAll('SELECT * FROM expense_categories ORDER BY name')));
    this.app.get('/api/expenses', requireRole('Admin'), async (req, res) => {
      const month = (req.query.month as string) || new Date().toISOString().substring(0, 7);
      res.json(await dbAll(`SELECT e.*,c.name as category_name,c.color as category_color,c.budget_limit,m.name as member_name FROM expenses e LEFT JOIN expense_categories c ON e.category_id=c.id LEFT JOIN members m ON e.entered_by=m.id WHERE e.expense_date LIKE ? ORDER BY e.expense_date DESC`, [month+'%']));
    });
    this.app.get('/api/expenses/summary', requireRole('Admin'), async (req, res) => {
      const month = (req.query.month as string) || new Date().toISOString().substring(0, 7);
      res.json(await dbAll(`SELECT c.id,c.name,c.color,c.budget_limit,COALESCE(SUM(e.amount),0) as total FROM expense_categories c LEFT JOIN expenses e ON e.category_id=c.id AND e.expense_date LIKE ? GROUP BY c.id ORDER BY total DESC`, [month+'%']));
    });
    this.app.get('/api/expenses/daily-summary', requireRole('Admin'), async (req, res) => {
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
    this.app.post('/api/expenses', requireRole('Admin'), async (req, res) => {
      const { category_id, amount, description, entered_by, expense_date, company_name, expense_head, payment_method } = req.body;
      if (amount === undefined || amount === null) return res.status(400).json({ error: 'amount required' });
      const date = expense_date || new Date().toISOString().split('T')[0];
      const { lastID } = await dbRun(
        `INSERT INTO expenses(category_id,amount,description,entered_by,expense_date,company_name,expense_head,payment_method) VALUES(?,?,?,?,?,?,?,?)`,
        [category_id||null, amount, description||'', entered_by||null, date, company_name||'', expense_head||'', payment_method||'Cash']
      );


      res.status(201).json(await dbGet('SELECT e.*,c.name as category_name FROM expenses e LEFT JOIN expense_categories c ON e.category_id=c.id WHERE e.id=?', [lastID]));
    });
    this.app.patch('/api/expenses/:id', requireRole('Admin'), async (req, res) => {
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
    this.app.delete('/api/expenses/:id', requireRole('Admin'), async (req, res) => { await dbRun('DELETE FROM expenses WHERE id=?', [req.params.id]); res.json({ ok: true }); });

    // ── CREDENTIALS (Admin only) ──────────────────────────────
    this.app.get('/api/credentials', requireRole('Admin'), async (_, res) => res.json(await dbAll('SELECT * FROM credentials ORDER BY created_at DESC')));
    this.app.post('/api/credentials', requireRole('Admin'), async (req, res) => {
      const { name, cred_type, url, username, cost, expiry_date, last_changed_date, notify_email, reminder_days, reminder_hours, reminder_minutes } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const remDays = reminder_days !== undefined && reminder_days !== '' && reminder_days !== null ? Number(reminder_days) : null;
      const remHours = reminder_hours !== undefined && reminder_hours !== '' && reminder_hours !== null ? Number(reminder_hours) : null;
      const remMins = reminder_minutes !== undefined && reminder_minutes !== '' && reminder_minutes !== null ? Number(reminder_minutes) : null;
      const hasReminder = (remDays && remDays > 0) || (remHours && remHours > 0) || (remMins && remMins > 0);
      const shouldNotify = notify_email ? 1 : (hasReminder ? 1 : 0);
      const legacyDays = remDays && remDays > 0 ? String(remDays) : '';
      const { lastID } = await dbRun(
        `INSERT INTO credentials(name,cred_type,url,username,cost,expiry_date,last_changed_date,reminder_days_before,notify_email,reminder_days,reminder_hours,reminder_minutes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [name, cred_type||'OTHER', url||'', username||'', cost||0, expiry_date||null, last_changed_date||null, legacyDays, shouldNotify, remDays, remHours, remMins]
      );

      if (shouldNotify && hasReminder && expiry_date) {
        const adminEmails = await resolveMemberNotificationEmails('Admin');
        scheduleCustomReminders({
          entityType: 'credential',
          entityId: lastID,
          targetDateTime: `${expiry_date}T09:00:00+06:00`,
          recipientEmails: adminEmails,
          title: `Credential Expiry: ${name}`,
          rows: [
            { label: 'Activity', value: name },
            { label: 'User', value: username || '—' },
            { label: 'Expiry Date', value: expiry_date },
            { label: 'URL', value: url || '—' }
          ],
          reminderDays: remDays,
          reminderHours: remHours,
          reminderMinutes: remMins,
        }).catch(console.error);
        await notifyReminderConfigured({
          entityLabel: 'Credential',
          title: name,
          link: '/credentials',
          remDays,
          remHours,
          remMins,
        });
      }

      res.status(201).json(await dbGet('SELECT * FROM credentials WHERE id=?', [lastID]));
    });
    this.app.delete('/api/credentials/:id', requireRole('Admin'), async (req, res) => { await dbRun('DELETE FROM credentials WHERE id=?', [req.params.id]); res.json({ ok: true }); });
    this.app.patch('/api/credentials/:id', requireRole('Admin'), async (req, res) => {
      const { name, cred_type, url, username, cost, expiry_date, last_changed_date, notify_email, reminder_days, reminder_hours, reminder_minutes } = req.body;
      const current = await dbGet('SELECT * FROM credentials WHERE id=?', [req.params.id]) as any;
      if (!current) return res.status(404).json({ error: 'Credential not found' });

      const nextDays = reminder_days !== undefined
        ? (reminder_days === '' || reminder_days === null ? null : Number(reminder_days))
        : (current.reminder_days ?? null);
      const nextHours = reminder_hours !== undefined
        ? (reminder_hours === '' || reminder_hours === null ? null : Number(reminder_hours))
        : (current.reminder_hours ?? null);
      const nextMins = reminder_minutes !== undefined
        ? (reminder_minutes === '' || reminder_minutes === null ? null : Number(reminder_minutes))
        : (current.reminder_minutes ?? null);
      const hasReminder = (Number(nextDays) > 0) || (Number(nextHours) > 0) || (Number(nextMins) > 0);
      const nextNotify = notify_email !== undefined ? (notify_email ? 1 : 0) : (hasReminder ? 1 : (current.notify_email || 0));
      const legacyDays = Number(nextDays) > 0 ? String(nextDays) : (current.reminder_days_before || '');

      await dbRun(
        `UPDATE credentials SET
          name=COALESCE(?,name),
          cred_type=COALESCE(?,cred_type),
          url=COALESCE(?,url),
          username=COALESCE(?,username),
          cost=COALESCE(?,cost),
          expiry_date=?,
          last_changed_date=?,
          reminder_days_before=?,
          notify_email=?,
          reminder_days=?,
          reminder_hours=?,
          reminder_minutes=?
        WHERE id=?`,
        [
          name || null,
          cred_type || null,
          url ?? null,
          username ?? null,
          cost ?? null,
          expiry_date !== undefined ? (expiry_date || null) : current.expiry_date,
          last_changed_date !== undefined ? (last_changed_date || null) : current.last_changed_date,
          legacyDays,
          nextNotify,
          nextDays,
          nextHours,
          nextMins,
          req.params.id
        ]
      );

      const updated = await dbGet('SELECT * FROM credentials WHERE id=?', [req.params.id]) as any;
      if (updated) {
        if (updated.notify_email && hasReminder && updated.expiry_date) {
          const adminEmails = await resolveMemberNotificationEmails('Admin');
          scheduleCustomReminders({
            entityType: 'credential',
            entityId: Number(req.params.id),
            targetDateTime: `${updated.expiry_date}T09:00:00+06:00`,
            recipientEmails: adminEmails,
            title: `Credential Expiry: ${updated.name}`,
            rows: [
              { label: 'Activity', value: updated.name },
              { label: 'User', value: updated.username || '—' },
              { label: 'Expiry Date', value: updated.expiry_date },
              { label: 'URL', value: updated.url || '—' }
            ],
            reminderDays: updated.reminder_days,
            reminderHours: updated.reminder_hours,
            reminderMinutes: updated.reminder_minutes,
          }).catch(console.error);
          if (reminder_days !== undefined || reminder_hours !== undefined || reminder_minutes !== undefined) {
            await notifyReminderConfigured({
              entityLabel: 'Credential',
              title: updated.name,
              link: '/credentials',
              remDays: updated.reminder_days,
              remHours: updated.reminder_hours,
              remMins: updated.reminder_minutes,
            });
          }
        } else {
          dbRun('DELETE FROM email_jobs WHERE entity_type = ? AND entity_id = ? AND status = ?', ['credential', req.params.id, 'PENDING']).catch(() => {});
        }
      }
      res.json(updated);
    });

    // ── MEETINGS (Admin only) ─────────────────────────────────
    this.app.get('/api/meetings', requireRole('Admin'), async (_, res) => res.json(await dbAll('SELECT * FROM meetings ORDER BY scheduled_at ASC')));
    this.app.post('/api/meetings', requireRole('Admin'), async (req, res) => {
      const { title, contact_name, scheduled_at, notify_email, reminder_days, reminder_hours, reminder_minutes } = req.body;
      if (!title || !scheduled_at) return res.status(400).json({ error: 'Title and scheduled_at required' });
      const remDays = reminder_days !== undefined && reminder_days !== '' && reminder_days !== null ? Number(reminder_days) : null;
      const remHours = reminder_hours !== undefined && reminder_hours !== '' && reminder_hours !== null ? Number(reminder_hours) : null;
      const remMins = reminder_minutes !== undefined && reminder_minutes !== '' && reminder_minutes !== null ? Number(reminder_minutes) : null;
      const hasReminder = (remDays && remDays > 0) || (remHours && remHours > 0) || (remMins && remMins > 0);
      const shouldNotify = notify_email ? 1 : (hasReminder ? 1 : 0);
      // Keep legacy minutes string for backward-compatible cron matching if only minutes set
      const legacyMins = remMins && remMins > 0 ? String(remMins) : '';
      const { lastID } = await dbRun(
        `INSERT INTO meetings(title,contact_name,scheduled_at,reminder_minutes_before,notify_email,reminder_days,reminder_hours,reminder_minutes) VALUES(?,?,?,?,?,?,?,?)`,
        [title, contact_name||'', scheduled_at, legacyMins, shouldNotify, remDays, remHours, remMins]
      );

      if (shouldNotify && hasReminder) {
        const emails = await resolveMemberNotificationEmails('Admin');
        scheduleCustomReminders({
          entityType: 'meeting',
          entityId: lastID,
          targetDateTime: scheduled_at,
          recipientEmails: emails,
          title: `Meeting: ${title}`,
          rows: [
            { label: 'Meeting', value: title },
            { label: 'With', value: contact_name || '—' },
            { label: 'Scheduled At', value: new Date(scheduled_at).toLocaleString('en-GB') }
          ],
          reminderDays: remDays,
          reminderHours: remHours,
          reminderMinutes: remMins,
        }).catch(console.error);
        await notifyReminderConfigured({
          entityLabel: 'Meeting',
          title,
          link: '/meetings',
          remDays,
          remHours,
          remMins,
        });
      }

      res.status(201).json(await dbGet('SELECT * FROM meetings WHERE id=?', [lastID]));
    });
    this.app.delete('/api/meetings/:id', requireRole('Admin'), async (req, res) => { await dbRun('DELETE FROM meetings WHERE id=?', [req.params.id]); res.json({ ok: true }); });
    this.app.patch('/api/meetings/:id', requireRole('Admin'), async (req, res) => {
      const { title, contact_name, scheduled_at, notify_email, reminder_days, reminder_hours, reminder_minutes } = req.body;
      const current = await dbGet('SELECT * FROM meetings WHERE id=?', [req.params.id]) as any;
      if (!current) return res.status(404).json({ error: 'Meeting not found' });

      const nextDays = reminder_days !== undefined
        ? (reminder_days === '' || reminder_days === null ? null : Number(reminder_days))
        : (current.reminder_days ?? null);
      const nextHours = reminder_hours !== undefined
        ? (reminder_hours === '' || reminder_hours === null ? null : Number(reminder_hours))
        : (current.reminder_hours ?? null);
      const nextMins = reminder_minutes !== undefined
        ? (reminder_minutes === '' || reminder_minutes === null ? null : Number(reminder_minutes))
        : (current.reminder_minutes ?? null);
      const hasReminder = (Number(nextDays) > 0) || (Number(nextHours) > 0) || (Number(nextMins) > 0);
      const nextNotify = notify_email !== undefined ? (notify_email ? 1 : 0) : (hasReminder ? 1 : (current.notify_email || 0));
      const legacyMins = Number(nextMins) > 0 ? String(nextMins) : (current.reminder_minutes_before || '');

      await dbRun(
        `UPDATE meetings SET
          title=COALESCE(?,title),
          contact_name=COALESCE(?,contact_name),
          scheduled_at=COALESCE(?,scheduled_at),
          reminder_minutes_before=?,
          notify_email=?,
          reminder_days=?,
          reminder_hours=?,
          reminder_minutes=?
        WHERE id=?`,
        [
          title || null,
          contact_name ?? null,
          scheduled_at || null,
          legacyMins,
          nextNotify,
          nextDays,
          nextHours,
          nextMins,
          req.params.id
        ]
      );

      const updated = await dbGet('SELECT * FROM meetings WHERE id=?', [req.params.id]) as any;
      if (updated) {
        if (updated.notify_email && hasReminder && updated.scheduled_at) {
          const emails = await resolveMemberNotificationEmails('Admin');
          scheduleCustomReminders({
            entityType: 'meeting',
            entityId: Number(req.params.id),
            targetDateTime: updated.scheduled_at,
            recipientEmails: emails,
            title: `Meeting: ${updated.title}`,
            rows: [
              { label: 'Meeting', value: updated.title },
              { label: 'With', value: updated.contact_name || '—' },
              { label: 'Scheduled At', value: new Date(updated.scheduled_at).toLocaleString('en-GB') }
            ],
            reminderDays: updated.reminder_days,
            reminderHours: updated.reminder_hours,
            reminderMinutes: updated.reminder_minutes,
          }).catch(console.error);
          if (reminder_days !== undefined || reminder_hours !== undefined || reminder_minutes !== undefined) {
            await notifyReminderConfigured({
              entityLabel: 'Meeting',
              title: updated.title,
              link: '/meetings',
              remDays: updated.reminder_days,
              remHours: updated.reminder_hours,
              remMins: updated.reminder_minutes,
            });
          }
        } else {
          dbRun('DELETE FROM email_jobs WHERE entity_type = ? AND entity_id = ? AND status = ?', ['meeting', req.params.id, 'PENDING']).catch(() => {});
        }
      }
      res.json(updated);
    });

    // ── TENDERS (Admin only) ──────────────────────────────────
    this.app.get('/api/tenders', requireRole('Admin'), async (_, res) => res.json(await dbAll('SELECT * FROM tenders ORDER BY submission_deadline ASC')));
    this.app.post('/api/tenders', requireRole('Admin'), async (req, res) => {
      const { title, organization, tender_type, published_date, submission_deadline, estimated_value, status, documents_url, notes, assigned_to, notify_email, reminder_days, reminder_hours, reminder_minutes } = req.body;
      if (!title || !submission_deadline) return res.status(400).json({ error: 'Title and deadline required' });
      const remDays = reminder_days !== undefined && reminder_days !== '' && reminder_days !== null ? Number(reminder_days) : null;
      const remHours = reminder_hours !== undefined && reminder_hours !== '' && reminder_hours !== null ? Number(reminder_hours) : null;
      const remMins = reminder_minutes !== undefined && reminder_minutes !== '' && reminder_minutes !== null ? Number(reminder_minutes) : null;
      const hasReminder = (remDays && remDays > 0) || (remHours && remHours > 0) || (remMins && remMins > 0);
      const shouldNotify = notify_email ? 1 : (hasReminder ? 1 : 0);
      const { lastID } = await dbRun(
        `INSERT INTO tenders(title, organization, tender_type, published_date, submission_deadline, estimated_value, status, documents_url, notes, assigned_to, notify_email, reminder_days, reminder_hours, reminder_minutes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [title, organization||'', tender_type||'PRIVATE', published_date||null, submission_deadline, estimated_value||0, status||'UPCOMING', documents_url||'', notes||'', assigned_to||null, shouldNotify, remDays, remHours, remMins]
      );

      if (shouldNotify && hasReminder) {
        const emails = await resolveMemberNotificationEmails(assigned_to || 'Admin');
        scheduleTenderReminders({
          entityId: lastID,
          closingDateTime: submission_deadline.includes('T') ? submission_deadline : `${submission_deadline}T17:00:00+06:00`,
          recipientEmails: emails,
          title: `Tender Closing: ${title}`,
          rows: [
            { label: 'Tender', value: title },
            { label: 'Organization', value: organization || '—' },
            { label: 'Closing Date', value: submission_deadline }
          ],
          reminderDays: remDays,
          reminderHours: remHours,
          reminderMinutes: remMins,
        }).catch(console.error);
        await notifyReminderConfigured({
          entityLabel: 'Tender',
          title,
          link: '/tenders',
          remDays,
          remHours,
          remMins,
        });
      }

      res.status(201).json(await dbGet('SELECT * FROM tenders WHERE id=?', [lastID]));
    });
    this.app.patch('/api/tenders/:id/status', requireRole('Admin'), async (req, res) => {
      const { status } = req.body;
      await dbRun('UPDATE tenders SET status=? WHERE id=?', [status, req.params.id]);
      res.json(await dbGet('SELECT * FROM tenders WHERE id=?', [req.params.id]));
    });
    this.app.delete('/api/tenders/:id', requireRole('Admin'), async (req, res) => { await dbRun('DELETE FROM tenders WHERE id=?', [req.params.id]); res.json({ ok: true }); });
    this.app.patch('/api/tenders/:id', requireRole('Admin'), async (req, res) => {
      const { title, organization, tender_type, published_date, submission_deadline, estimated_value, documents_url, notes, notify_email, reminder_days, reminder_hours, reminder_minutes, status } = req.body;
      const current = await dbGet('SELECT * FROM tenders WHERE id=?', [req.params.id]) as any;
      if (!current) return res.status(404).json({ error: 'Tender not found' });

      const nextDays = reminder_days !== undefined
        ? (reminder_days === '' || reminder_days === null ? null : Number(reminder_days))
        : (current.reminder_days ?? null);
      const nextHours = reminder_hours !== undefined
        ? (reminder_hours === '' || reminder_hours === null ? null : Number(reminder_hours))
        : (current.reminder_hours ?? null);
      const nextMins = reminder_minutes !== undefined
        ? (reminder_minutes === '' || reminder_minutes === null ? null : Number(reminder_minutes))
        : (current.reminder_minutes ?? null);
      const hasReminder = (Number(nextDays) > 0) || (Number(nextHours) > 0) || (Number(nextMins) > 0);
      const nextNotify = notify_email !== undefined ? (notify_email ? 1 : 0) : (hasReminder ? 1 : (current.notify_email || 0));

      await dbRun(
        `UPDATE tenders SET
          title=COALESCE(?,title),
          organization=COALESCE(?,organization),
          tender_type=COALESCE(?,tender_type),
          published_date=?,
          submission_deadline=COALESCE(?,submission_deadline),
          estimated_value=COALESCE(?,estimated_value),
          documents_url=COALESCE(?,documents_url),
          notes=COALESCE(?,notes),
          notify_email=?,
          status=COALESCE(?,status),
          reminder_days=?,
          reminder_hours=?,
          reminder_minutes=?
        WHERE id=?`,
        [
          title || null,
          organization || null,
          tender_type || null,
          published_date !== undefined ? (published_date || null) : current.published_date,
          submission_deadline || null,
          estimated_value ?? null,
          documents_url || null,
          notes || null,
          nextNotify,
          status || null,
          nextDays,
          nextHours,
          nextMins,
          req.params.id
        ]
      );

      const updatedTender = await dbGet('SELECT * FROM tenders WHERE id=?', [req.params.id]) as any;
      if (updatedTender) {
        if (updatedTender.notify_email && hasReminder && updatedTender.submission_deadline) {
          const emails = await resolveMemberNotificationEmails(updatedTender.assigned_to || 'Admin');
          scheduleTenderReminders({
            entityId: Number(req.params.id),
            closingDateTime: updatedTender.submission_deadline.includes('T') ? updatedTender.submission_deadline : `${updatedTender.submission_deadline}T17:00:00+06:00`,
            recipientEmails: emails,
            title: `Tender Closing: ${updatedTender.title}`,
            rows: [
              { label: 'Tender', value: updatedTender.title },
              { label: 'Organization', value: updatedTender.organization || '—' },
              { label: 'Closing Date', value: updatedTender.submission_deadline }
            ],
            reminderDays: updatedTender.reminder_days,
            reminderHours: updatedTender.reminder_hours,
            reminderMinutes: updatedTender.reminder_minutes,
          }).catch(console.error);
          if (reminder_days !== undefined || reminder_hours !== undefined || reminder_minutes !== undefined) {
            await notifyReminderConfigured({
              entityLabel: 'Tender',
              title: updatedTender.title,
              link: '/tenders',
              remDays: updatedTender.reminder_days,
              remHours: updatedTender.reminder_hours,
              remMins: updatedTender.reminder_minutes,
            });
          }
        } else {
          dbRun('DELETE FROM email_jobs WHERE entity_type = ? AND entity_id = ? AND status = ?', ['tender', req.params.id, 'PENDING']).catch(() => {});
        }
      }
      res.json(updatedTender);
    });

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

      // 1. Check Credentials — custom day / hour / minute reminders → notify admins
      const creds = await dbAll('SELECT * FROM credentials') as any[];
      for (const c of creds) {
        if (!c.expiry_date || !c.notify_email) continue;
        const expStr = `${c.expiry_date}T09:00:00+06:00`;
        const exp = new Date(expStr);
        if (isNaN(exp.getTime())) continue;

        const diffMs = exp.getTime() - now.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.round(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.round(diffMs / (1000 * 60));

        const dayRem = Number(c.reminder_days);
        const hourRem = Number(c.reminder_hours);
        const minRem = Number(c.reminder_minutes);

        if (Number.isFinite(dayRem) && dayRem > 0 && diffDays === dayRem && now.getMinutes() === 0) {
          await notifyAdmins(`Credential Reminder: "${c.name}" expires in ${dayRem} day(s).`, '/credentials');
        }
        if (Number.isFinite(hourRem) && hourRem > 0 && diffMinutes === hourRem * 60) {
          await notifyAdmins(`Credential Reminder: "${c.name}" expires in ${hourRem} hour(s).`, '/credentials');
        }
        if (Number.isFinite(minRem) && minRem > 0 && diffMinutes === minRem) {
          await notifyAdmins(`Credential Reminder: "${c.name}" expires in ${minRem} minute(s).`, '/credentials');
        }

        // Legacy comma-separated days fallback
        if ((!Number.isFinite(dayRem) || dayRem <= 0) && c.reminder_days_before) {
          const daysToAlert = String(c.reminder_days_before).split(',').map((d: string) => parseInt(d.trim(), 10)).filter((n: number) => Number.isFinite(n));
          const calendarDiff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (daysToAlert.includes(calendarDiff) && now.getMinutes() === 0) {
            await notifyAdmins(`Credential Reminder: "${c.name}" expires in ${calendarDiff} day(s).`, '/credentials');
            console.log(`[ALERT] Credential '${c.name}' expires in ${calendarDiff} day(s)!`);
          }
        }
      }

      // 2. Check Meetings — custom day / hour / minute reminders → notify admins
      const meetings = await dbAll('SELECT * FROM meetings') as any[];
      for (const m of meetings) {
        if (!m.scheduled_at || !m.notify_email) continue;

        let schedStr = String(m.scheduled_at).trim();
        if (!schedStr.includes('Z') && !/[+-]\d{2}(:?\d{2})?$/.test(schedStr)) {
          if (schedStr.includes(' ') && !schedStr.includes('T')) schedStr = schedStr.replace(' ', 'T');
          schedStr += '+06:00';
        }
        const scheduledTime = new Date(schedStr);
        if (isNaN(scheduledTime.getTime())) continue;

        const diffMs = scheduledTime.getTime() - now.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.round(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.round(diffMs / (1000 * 60));

        const dayRem = Number(m.reminder_days);
        const hourRem = Number(m.reminder_hours);
        const minRem = Number(m.reminder_minutes);

        if (Number.isFinite(dayRem) && dayRem > 0 && diffDays === dayRem && now.getMinutes() === 0) {
          await notifyAdmins(`Meeting Reminder: "${m.title}" in ${dayRem} day(s).`, '/meetings');
        }
        if (Number.isFinite(hourRem) && hourRem > 0 && diffMinutes === hourRem * 60) {
          await notifyAdmins(`Meeting Reminder: "${m.title}" in ${hourRem} hour(s).`, '/meetings');
        }
        if (Number.isFinite(minRem) && minRem > 0 && diffMinutes === minRem) {
          await notifyAdmins(`Meeting Reminder: "${m.title}" in ${minRem} minute(s).`, '/meetings');
        }

        // Legacy comma-separated minutes fallback
        if ((!Number.isFinite(minRem) || minRem <= 0) && m.reminder_minutes_before) {
          const minutesToAlert = String(m.reminder_minutes_before).split(',').map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => Number.isFinite(n) && n > 0);
          if (minutesToAlert.includes(diffMinutes)) {
            await notifyAdmins(`Meeting Reminder: "${m.title}" in ${diffMinutes} minute(s).`, '/meetings');
            console.log(`[ALERT] Meeting '${m.title}' with ${m.contact_name} is in exactly ${diffMinutes} minutes!`);
          }
        }
      }

      // 3. Check Tenders — custom day / hour / minute reminders → notify admins
      const tenders = await dbAll('SELECT * FROM tenders') as any[];
      for (const t of tenders) {
        if (!t.submission_deadline || ['SUBMITTED','WON','LOST'].includes(t.status)) continue;
        if (!t.notify_email) continue;

        let dlStr = String(t.submission_deadline).trim();
        if (!dlStr.includes('Z') && !/[+-]\d{2}(:?\d{2})?$/.test(dlStr)) {
          if (dlStr.includes(' ') && !dlStr.includes('T')) dlStr = dlStr.replace(' ', 'T');
          dlStr += '+06:00';
        }
        const deadline = new Date(dlStr);
        if (isNaN(deadline.getTime())) continue;

        const diffMs = deadline.getTime() - now.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.round(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.round(diffMs / (1000 * 60));

        const dayRem = Number(t.reminder_days);
        const hourRem = Number(t.reminder_hours);
        const minRem = Number(t.reminder_minutes);

        if (Number.isFinite(dayRem) && dayRem > 0 && diffDays === dayRem && now.getMinutes() === 0) {
          await notifyAdmins(`Tender Reminder: "${t.title}" closes in ${dayRem} day(s).`, '/tenders');
          console.log(`[ALERT] Tender '${t.title}' reminder: ${dayRem} day(s) left.`);
        }
        if (Number.isFinite(hourRem) && hourRem > 0 && diffHours === hourRem && now.getSeconds() < 30) {
          // Fire once near the top of the matched hour window (cron is every minute; match exact hour remaining)
          if (diffMinutes === hourRem * 60) {
            await notifyAdmins(`Tender Reminder: "${t.title}" closes in ${hourRem} hour(s).`, '/tenders');
            console.log(`[ALERT] Tender '${t.title}' reminder: ${hourRem} hour(s) left.`);
          }
        }
        if (Number.isFinite(minRem) && minRem > 0 && diffMinutes === minRem) {
          await notifyAdmins(`Tender Reminder: "${t.title}" closes in ${minRem} minute(s).`, '/tenders');
          console.log(`[ALERT] Tender '${t.title}' reminder: ${minRem} minute(s) left.`);
        }
      }

      // 3b. Check Tasks — custom day / hour / minute reminders → notify admins
      try {
        const reminderTasks = await dbAll(`SELECT * FROM tasks WHERE status != 'DONE' AND deadline IS NOT NULL AND notify_email = 1`) as any[];
        for (const t of reminderTasks) {
          let dlStr = String(t.deadline).trim();
          if (!dlStr.includes('Z') && !/[+-]\d{2}(:?\d{2})?$/.test(dlStr)) {
            if (dlStr.includes(' ') && !dlStr.includes('T')) dlStr = dlStr.replace(' ', 'T');
            dlStr += '+06:00';
          }
          const deadline = new Date(dlStr);
          if (isNaN(deadline.getTime())) continue;

          const diffMs = deadline.getTime() - now.getTime();
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
          const diffHours = Math.round(diffMs / (1000 * 60 * 60));
          const diffMinutes = Math.round(diffMs / (1000 * 60));

          const dayRem = Number(t.reminder_days);
          const hourRem = Number(t.reminder_hours);
          const minRem = Number(t.reminder_minutes);

          if (Number.isFinite(dayRem) && dayRem > 0 && diffDays === dayRem && now.getMinutes() === 0) {
            await notifyAdmins(`Task Reminder: "${t.title}" due in ${dayRem} day(s).`, '/dashboard');
          }
          if (Number.isFinite(hourRem) && hourRem > 0 && diffMinutes === hourRem * 60) {
            await notifyAdmins(`Task Reminder: "${t.title}" due in ${hourRem} hour(s).`, '/dashboard');
          }
          if (Number.isFinite(minRem) && minRem > 0 && diffMinutes === minRem) {
            await notifyAdmins(`Task Reminder: "${t.title}" due in ${minRem} minute(s).`, '/dashboard');
          }
        }
      } catch (err) {
        console.error('Error in Task custom reminders cron:', err);
      }

      // 3c. Check Leaves — custom day / hour / minute reminders
      try {
        const leaveRows = await dbAll(`SELECT l.*, m.name as member_name FROM leave_requests l LEFT JOIN members m ON l.member_id=m.id WHERE l.notify_email = 1 AND l.status != 'REJECTED' AND l.status != 'CANCELLED'`) as any[];
        for (const l of leaveRows) {
          if (!l.start_date) continue;
          let dlStr = String(l.start_date).trim();
          if (!dlStr.includes('T')) dlStr = `${dlStr}T09:00:00+06:00`;
          else if (!dlStr.includes('Z') && !/[+-]\d{2}(:?\d{2})?$/.test(dlStr)) {
            if (dlStr.includes(' ') && !dlStr.includes('T')) dlStr = dlStr.replace(' ', 'T');
            dlStr += '+06:00';
          }
          const deadline = new Date(dlStr);
          if (isNaN(deadline.getTime())) continue;

          const diffMs = deadline.getTime() - now.getTime();
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
          const diffMinutes = Math.round(diffMs / (1000 * 60));

          const dayRem = Number(l.reminder_days);
          const hourRem = Number(l.reminder_hours);
          const minRem = Number(l.reminder_minutes);

          const who = l.member_name || 'Employee';
          if (Number.isFinite(dayRem) && dayRem > 0 && diffDays === dayRem && now.getMinutes() === 0) {
            await notifyAdmins(`Leave Reminder: ${who} (${l.leave_type}) starts in ${dayRem} day(s).`, '/hr?tab=leave');
          }
          if (Number.isFinite(hourRem) && hourRem > 0 && diffMinutes === hourRem * 60) {
            await notifyAdmins(`Leave Reminder: ${who} (${l.leave_type}) starts in ${hourRem} hour(s).`, '/hr?tab=leave');
          }
          if (Number.isFinite(minRem) && minRem > 0 && diffMinutes === minRem) {
            await notifyAdmins(`Leave Reminder: ${who} (${l.leave_type}) starts in ${minRem} minute(s).`, '/hr?tab=leave');
          }
        }
      } catch (err) {
        console.error('Error in Leave custom reminders cron:', err);
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

      // 6. Process Scheduled Brevo Email Jobs (24h and 15h reminders)
      try {
        await processDueEmailJobs();
      } catch (err) {
        console.error('Error in Brevo due jobs cron:', err);
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
