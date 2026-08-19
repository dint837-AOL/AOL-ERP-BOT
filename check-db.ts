import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function main() {
  const db = await open({
    filename: './openclaw.db',
    driver: sqlite3.Database
  });

  console.log("Connected to the mock SQLite database.");

  try {
    const rows = await db.all("SELECT * FROM attendance ORDER BY timestamp DESC LIMIT 5");
    console.log("\n=== Last 5 Attendance Records ===");
    if (rows.length === 0) {
      console.log("No records found.");
    } else {
      console.table(rows);
    }
  } catch (err: any) {
    console.error("Error querying attendance table:", err.message);
  }
}

main();
