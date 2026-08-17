import Database from 'better-sqlite3';

const db = new Database('./openclaw.db');

export function initDB() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number TEXT NOT NULL,
        action_type TEXT CHECK(action_type IN ('IN', 'OUT')) NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Database initialized successfully.");
  } catch (err: any) {
    console.error("Database initialization error:", err.message);
  }
}

export { db };
