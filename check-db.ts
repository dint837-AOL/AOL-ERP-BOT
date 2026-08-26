import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function main() {
  const db = await open({
    filename: './openclaw.db',
    driver: sqlite3.Database
  });

  console.log("Connected to SQLite database (./openclaw.db).");

  const tables = [
    'members',
    'tasks',
    'attendance',
    'leave_requests',
    'expense_categories',
    'expenses',
    'credentials',
    'meetings',
    'tenders',
    'settings',
    'active_sessions',
    'notifications'
  ];

  for (const table of tables) {
    try {
      const countRes = await db.get(`SELECT COUNT(*) as c FROM ${table}`);
      console.log(`\nTable '${table}': ${countRes?.c ?? 0} rows`);
      if (table === 'members') {
        const members = await db.all('SELECT id, name, email, role, avatar_color FROM members');
        console.table(members);
      }
      if (table === 'expense_categories') {
        const cats = await db.all('SELECT * FROM expense_categories');
        console.table(cats);
      }
      if (table === 'settings') {
        const settings = await db.all('SELECT * FROM settings');
        console.table(settings);
      }
    } catch (err: any) {
      console.log(`Table '${table}': ${err.message}`);
    }
  }
}

main();

