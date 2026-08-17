import Database from 'better-sqlite3';

const db = new Database('./openclaw.db');

console.log("Connected to the mock SQLite database.");

try {
  const rows = db.prepare("SELECT * FROM attendance ORDER BY timestamp DESC LIMIT 5").all();
  console.log("\n=== Last 5 Attendance Records ===");
  if (rows.length === 0) {
    console.log("No records found.");
  } else {
    console.table(rows);
  }
} catch (err: any) {
  console.error("Error querying attendance table:", err.message);
}
