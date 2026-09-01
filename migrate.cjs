const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./openclaw.db');
db.run("UPDATE members SET role='Admin', email='admin@alliedone.com' WHERE name='Ahsan Kabir'");
db.run("DELETE FROM members WHERE name='System Admin'");
console.log('done');
