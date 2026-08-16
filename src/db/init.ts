import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./openclaw.db');

export function initDB() {
  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_number TEXT NOT NULL,
      action_type TEXT CHECK(action_type IN ('IN', 'OUT')) NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error("Database initialization error:", err.message);
    else console.log("Database initialized successfully.");
  });
}

export { db };
