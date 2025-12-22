const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const beadsDir = path.join(process.cwd(), '.beads');

if (!fs.existsSync(beadsDir)) {
    console.error("No .beads directory found.");
    process.exit(1);
}

const files = fs.readdirSync(beadsDir).filter(f => /\.(db|sqlite|sqlite3)$/i.test(f));
if (files.length === 0) {
    console.error("No DB files found in .beads");
    process.exit(1);
}

const dbPath = path.join(beadsDir, files[0]);
console.log(`Inspecting DB: ${dbPath}`);

const db = new Database(dbPath, { readonly: true });

// Get all tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("Tables:", tables.map(t => t.name));

// Get schema for 'issues' and any other likely candidate
tables.forEach(t => {
    const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(t.name);
    console.log(`\n--- Schema for ${t.name} ---`);
    console.log(schema.sql);
});

db.close();
