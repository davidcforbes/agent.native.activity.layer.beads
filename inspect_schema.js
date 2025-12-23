const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function main() {
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

    const SQL = await initSqlJs({
        locateFile: file => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file)
    });

    const filebuffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(filebuffer);

    // Get all tables
    const res = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    if (res.length === 0) {
        console.log("No tables found.");
        return;
    }

    const tables = res[0].values.map(v => v[0]);
    console.log("Tables:", tables);

    // Get schema for each table
    for (const tableName of tables) {
        const res = db.exec(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
        if (res.length > 0 && res[0].values.length > 0) {
            console.log(`\n--- Schema for ${tableName} ---`);
            console.log(res[0].values[0][0]);
        }
    }

    db.close();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
