import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./openclaw.db', (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  }
});

console.log("Checking Attendance Records in Database...\n");

db.all("SELECT * FROM attendance", [], (err, rows) => {
  if (err) {
    console.error("Error querying attendance table:", err.message);
    return;
  }
  
  if (rows.length === 0) {
    console.log("No attendance records found yet. Go to http://localhost:3000 and type 'I just arrived at the office' !");
  } else {
    console.table(rows);
  }
  
  db.close();
});
