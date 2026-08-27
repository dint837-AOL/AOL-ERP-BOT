/**
 * Universal Database Manager (PostgreSQL / Neon DB & SQLite Fallback)
 * 
 * - When DATABASE_URL or POSTGRES_URL is configured (e.g., in Neon / Render),
 *   connects to PostgreSQL via pg.Pool with SSL.
 * - When DATABASE_URL is not set (e.g., local offline development),
 *   automatically falls back to local SQLite (./openclaw.db).
 * 
 * Provides unified helpers:
 *   - dbAll(sql, params): Returns Array of rows
 *   - dbGet(sql, params): Returns single row or null
 *   - dbRun(sql, params): Executes INSERT/UPDATE/DELETE and returns { lastID }
 */
import pg from 'pg';
import sqlite3 from 'sqlite3';
import { open, Database as SQLiteDatabase } from 'sqlite';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

let isPg = false;
let pgPool: pg.Pool | null = null;
let sqliteDb: SQLiteDatabase | null = null;

function sanitizeParams(params: any[] = []): any[] {
  return params.map(v => (v === undefined ? null : v));
}

function formatPgQuery(sql: string): string {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

export async function initDB() {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
    isPg = true;
    console.log('[DB] Connecting to Cloud PostgreSQL (Neon DB)...');
    
    pgPool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Test connection
    const client = await pgPool.connect();
    try {
      await client.query('SELECT 1');
      console.log('[DB] Connected to Neon PostgreSQL successfully!');
    } finally {
      client.release();
    }

    // Initialize PostgreSQL Tables
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT DEFAULT '',
        password_hash TEXT DEFAULT '',
        role TEXT DEFAULT 'Employee',
        avatar_color TEXT DEFAULT '#4f7eff',
        whatsapp_number TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
        phone_number TEXT,
        action_type TEXT NOT NULL,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        action_type TEXT DEFAULT 'ASSIGN',
        recipient TEXT DEFAULT '',
        deadline TEXT,
        task_date TEXT NOT NULL,
        priority TEXT DEFAULT 'GREEN',
        status TEXT DEFAULT 'DONE',
        assigned_to INTEGER REFERENCES members(id) ON DELETE SET NULL,
        is_archived INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS leave_requests (
        id SERIAL PRIMARY KEY,
        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        leave_type TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        reason TEXT DEFAULT '',
        status TEXT DEFAULT 'PENDING',
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS expense_categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        budget_limit NUMERIC DEFAULT 0,
        color TEXT DEFAULT '#4f7eff'
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
        amount NUMERIC NOT NULL,
        description TEXT DEFAULT '',
        entered_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
        expense_date TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS credentials (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        cred_type TEXT DEFAULT 'OTHER',
        url TEXT DEFAULT '',
        username TEXT DEFAULT '',
        cost NUMERIC DEFAULT 0,
        expiry_date TEXT,
        last_changed_date TEXT,
        reminder_days_before TEXT DEFAULT '5,2,1',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS meetings (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        contact_name TEXT DEFAULT '',
        scheduled_at TIMESTAMPTZ NOT NULL,
        reminder_minutes_before TEXT DEFAULT '30,15',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tenders (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        organization TEXT DEFAULT '',
        tender_type TEXT DEFAULT 'PRIVATE',
        published_date TEXT,
        submission_deadline TEXT NOT NULL,
        estimated_value NUMERIC DEFAULT 0,
        status TEXT DEFAULT 'UPCOMING',
        documents_url TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        assigned_to INTEGER REFERENCES members(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS active_sessions (
        member_id INTEGER PRIMARY KEY,
        last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        ip TEXT,
        is_wifi INTEGER DEFAULT 1,
        hostname TEXT DEFAULT '',
        os_name TEXT DEFAULT '',
        device_type TEXT DEFAULT 'BROWSER'
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        link TEXT DEFAULT '',
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try { await pgPool.query("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link TEXT DEFAULT ''"); } catch (e) {}
    try { await pgPool.query("ALTER TABLE members ADD COLUMN IF NOT EXISTS whatsapp_number TEXT DEFAULT ''"); } catch (e) {}

  } else {
    isPg = false;
    console.log('[DB] No DATABASE_URL found. Falling back to local SQLite (./openclaw.db)...');

    sqliteDb = await open({
      filename: './openclaw.db',
      driver: sqlite3.Database,
    });

    await sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT DEFAULT '',
        password_hash TEXT DEFAULT '',
        role TEXT DEFAULT 'Employee',
        avatar_color TEXT DEFAULT '#4f7eff',
        whatsapp_number TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id INTEGER REFERENCES members(id),
        phone_number TEXT,
        action_type TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tasks (
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

      CREATE TABLE IF NOT EXISTS leave_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id INTEGER NOT NULL REFERENCES members(id),
        leave_type TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        reason TEXT DEFAULT '',
        status TEXT DEFAULT 'PENDING',
        reviewed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS expense_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        budget_limit REAL DEFAULT 0,
        color TEXT DEFAULT '#4f7eff'
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER REFERENCES expense_categories(id),
        amount REAL NOT NULL,
        description TEXT DEFAULT '',
        entered_by INTEGER REFERENCES members(id),
        expense_date TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS credentials (
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
      );

      CREATE TABLE IF NOT EXISTS meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        contact_name TEXT DEFAULT '',
        scheduled_at DATETIME NOT NULL,
        reminder_minutes_before TEXT DEFAULT '30,15',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tenders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        organization TEXT DEFAULT '',
        tender_type TEXT DEFAULT 'PRIVATE',
        published_date TEXT,
        submission_deadline TEXT NOT NULL,
        estimated_value REAL DEFAULT 0,
        status TEXT DEFAULT 'UPCOMING',
        documents_url TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        assigned_to INTEGER REFERENCES members(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS active_sessions (
        member_id INTEGER PRIMARY KEY,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        ip TEXT,
        is_wifi INTEGER DEFAULT 1,
        hostname TEXT DEFAULT '',
        os_name TEXT DEFAULT '',
        device_type TEXT DEFAULT 'BROWSER'
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id INTEGER REFERENCES members(id),
        message TEXT NOT NULL,
        link TEXT DEFAULT '',
        is_read BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try { await sqliteDb.exec("ALTER TABLE notifications ADD COLUMN link TEXT DEFAULT ''"); } catch (e) {}
    try { await sqliteDb.exec("ALTER TABLE members ADD COLUMN whatsapp_number TEXT DEFAULT ''"); } catch (e) {}
  }

  // Seed default admin and employee accounts
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
    const existing = await dbGet('SELECT id FROM members WHERE LOWER(TRIM(email)) = LOWER(?)', [acc.email]);
    if (!existing) {
      await dbRun(
        `INSERT INTO members (name, email, password_hash, role, avatar_color) VALUES (?, ?, ?, ?, ?)`,
        [acc.name, acc.email, acc.hash, acc.role, acc.color]
      );
    } else {
      await dbRun(
        `UPDATE members SET password_hash = ?, role = ?, name = ? WHERE id = ?`,
        [acc.hash, acc.role, acc.name, existing.id]
      );
    }
  }

  // Seed default settings if missing
  const settingsRows = await dbAll('SELECT key FROM settings') as any[];
  const existingSettingsKeys = new Set(settingsRows.map(r => r.key));
  if (!existingSettingsKeys.has('office_wifi_ip')) {
    await dbRun('INSERT INTO settings (key, value) VALUES (?, ?)', ['office_wifi_ip', '127.0.0.1,::1']);
  }
  if (!existingSettingsKeys.has('office_wifi_name')) {
    await dbRun('INSERT INTO settings (key, value) VALUES (?, ?)', ['office_wifi_name', 'AlliedOne Office Wi-Fi']);
  }
  if (!existingSettingsKeys.has('wifi_auto_attendance_enabled')) {
    await dbRun('INSERT INTO settings (key, value) VALUES (?, ?)', ['wifi_auto_attendance_enabled', 'true']);
  }
  if (!existingSettingsKeys.has('auto_checkout_timeout_minutes')) {
    await dbRun('INSERT INTO settings (key, value) VALUES (?, ?)', ['auto_checkout_timeout_minutes', '10']);
  }

  // Seed default expense categories if empty
  const catCount = await dbGet('SELECT COUNT(*) as c FROM expense_categories');
  const countNum = catCount ? Number(catCount.c || (catCount as any).count || 0) : 0;
  if (countNum === 0) {
    const cats = [
      ['IT & Software', 50000, '#4f7eff'],
      ['Office Supplies', 20000, '#2dd4a0'],
      ['Travel', 30000, '#ff9f40'],
      ['Marketing', 40000, '#a78bfa'],
      ['Utilities', 15000, '#f472b6'],
      ['Miscellaneous', 10000, '#8890a8'],
    ];
    for (const [n, b, c] of cats) {
      if (isPg) {
        await dbRun('INSERT INTO expense_categories (name, budget_limit, color) VALUES (?, ?, ?) ON CONFLICT (name) DO NOTHING', [n, b, c]);
      } else {
        await dbRun('INSERT OR IGNORE INTO expense_categories (name, budget_limit, color) VALUES (?, ?, ?)', [n, b, c]);
      }
    }
  }

  console.log(`[DB] Database ready (Engine: ${isPg ? 'Neon PostgreSQL' : 'Local SQLite'}).`);
}

export const dbAll = async (sql: string, p: any[] = []): Promise<any[]> => {
  const cleanParams = sanitizeParams(p);
  if (isPg && pgPool) {
    const res = await pgPool.query(formatPgQuery(sql), cleanParams);
    return res.rows;
  }
  if (sqliteDb) {
    return sqliteDb.all(sql, cleanParams);
  }
  return [];
};

export const dbGet = async (sql: string, p: any[] = []): Promise<any> => {
  const cleanParams = sanitizeParams(p);
  if (isPg && pgPool) {
    const res = await pgPool.query(formatPgQuery(sql), cleanParams);
    return res.rows[0] || null;
  }
  if (sqliteDb) {
    return sqliteDb.get(sql, cleanParams);
  }
  return null;
};

export const dbRun = async (sql: string, p: any[] = []): Promise<{ lastID: number; rowCount?: number }> => {
  const cleanParams = sanitizeParams(p);
  if (isPg && pgPool) {
    let finalSql = formatPgQuery(sql);
    const isInsert = /^\s*INSERT\s+INTO/i.test(finalSql);
    if (isInsert && !/RETURNING/i.test(finalSql)) {
      finalSql += ' RETURNING *';
    }
    const res = await pgPool.query(finalSql, cleanParams);
    const lastID = res.rows && res.rows[0] && res.rows[0].id !== undefined ? Number(res.rows[0].id) : 0;
    return { lastID, rowCount: res.rowCount ?? 0 };
  }
  if (sqliteDb) {
    const info = await sqliteDb.run(sql, cleanParams);
    return { lastID: info.lastID ?? 0, rowCount: info.changes ?? 0 };
  }
  return { lastID: 0 };
};

export const isPostgres = () => isPg;
