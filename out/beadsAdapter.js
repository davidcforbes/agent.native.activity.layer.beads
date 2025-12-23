"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BeadsAdapter = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const sql_js_1 = __importDefault(require("sql.js"));
const vscode = __importStar(require("vscode"));
const uuid_1 = require("uuid");
class BeadsAdapter {
    output;
    db = null;
    dbPath = null;
    constructor(output) {
        this.output = output;
    }
    dispose() {
        try {
            this.db?.close();
        }
        catch {
            // ignore
        }
        this.db = null;
        this.dbPath = null;
    }
    async ensureConnected() {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) {
            throw new Error("Open a folder workspace to use Beads Kanban.");
        }
        const beadsDir = path.join(ws.uri.fsPath, ".beads");
        if (!fs.existsSync(beadsDir) || !fs.statSync(beadsDir).isDirectory()) {
            throw new Error("No .beads directory found in the workspace root.");
        }
        const candidatePaths = fs
            .readdirSync(beadsDir)
            .filter((f) => /\.(db|sqlite|sqlite3)$/i.test(f))
            .map((f) => path.join(beadsDir, f));
        if (candidatePaths.length === 0) {
            throw new Error("No SQLite database file found in .beads (expected *.db/*.sqlite/*.sqlite3).");
        }
        const failureReasons = [];
        // Initialize SQL.js
        const SQL = await (0, sql_js_1.default)({
            locateFile: (file) => path.join(__dirname, file)
        });
        // Find the DB that contains the `issues` table.
        for (const p of candidatePaths) {
            try {
                const filebuffer = fs.readFileSync(p);
                const db = new SQL.Database(filebuffer);
                // Check for issues table
                const res = db.exec("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='issues' LIMIT 1;");
                if (res.length > 0 && res[0].values.length > 0 && res[0].values[0][0] === 1) {
                    const msg = `[BeadsAdapter] Connected to DB: ${p}`;
                    this.output.appendLine(msg);
                    console.log(msg);
                    this.db = db;
                    this.dbPath = p;
                    return;
                }
                const tablesRes = db.exec("SELECT name FROM sqlite_master WHERE type='table';");
                const tableNames = tablesRes.length > 0 ? tablesRes[0].values.map(v => v[0]).join(', ') : '';
                const reason = `File opened but 'issues' table missing. Tables found: [${tableNames}]`;
                this.output.appendLine(`[BeadsAdapter] ${p}: ${reason}`);
                console.warn(`[BeadsAdapter] ${p}: ${reason}`);
                failureReasons.push(`${path.basename(p)}: ${reason}`);
                db.close();
            }
            catch (e) {
                const msg = String(e instanceof Error ? e.message : e);
                this.output.appendLine(`[BeadsAdapter] Candidate DB failed: ${p} (${msg})`);
                console.error(`[BeadsAdapter] Candidate DB failed: ${p} (${msg})`);
                failureReasons.push(`${path.basename(p)}: ${msg}`);
            }
        }
        const fullError = `Could not find a valid Beads DB in .beads. Searched: ${candidatePaths.map(x => path.basename(x)).join(', ')}. Details:\n${failureReasons.join('\n')}`;
        console.error(fullError);
        throw new Error(fullError);
    }
    getConnectedDbPath() {
        return this.dbPath;
    }
    async getBoard() {
        if (!this.db)
            await this.ensureConnected();
        const db = this.db;
        // 1) Load issues + derived readiness and blockedness via views
        const issues = this.queryAll(`
        SELECT
          i.id,
          i.title,
          i.description,
          i.status,
          i.priority,
          i.issue_type,
          i.assignee,
          i.estimated_minutes,
          i.created_at,
          i.updated_at,
          i.closed_at,
          i.external_ref,
          i.acceptance_criteria,
          i.design,
          CASE WHEN ri.id IS NOT NULL THEN 1 ELSE 0 END AS is_ready,
          COALESCE(bi.blocked_by_count, 0) AS blocked_by_count
        FROM issues i
        LEFT JOIN ready_issues ri ON ri.id = i.id
        LEFT JOIN blocked_issues bi ON bi.id = i.id
        WHERE i.deleted_at IS NULL
        ORDER BY i.priority ASC, i.updated_at DESC, i.created_at DESC;
      `);
        const ids = issues.map((i) => i.id);
        // 2) Bulk load labels
        const labelsByIssue = new Map();
        const parentMap = new Map();
        const childrenMap = new Map();
        const blockedByMap = new Map();
        const blocksMap = new Map();
        const commentsByIssue = new Map();
        if (ids.length > 0) {
            const placeholders = ids.map(() => "?").join(",");
            // Fetch labels
            const labelRows = this.queryAll(`SELECT issue_id, label FROM labels WHERE issue_id IN (${placeholders}) ORDER BY label;`, ids);
            for (const r of labelRows) {
                const arr = labelsByIssue.get(r.issue_id) ?? [];
                arr.push(r.label);
                labelsByIssue.set(r.issue_id, arr);
            }
            // Fetch all relevant dependencies where either side is in our issue list
            // Note: We might miss titles if the "other side" isn't in 'ids' (filtered list?).
            // Actually, 'issues' query above fetches ALL issues (no WHERE clause except deleted_at IS NULL).
            // So 'ids' should check all.
            const allDeps = this.queryAll(`
        SELECT d.issue_id, d.depends_on_id, d.type, i1.title as issue_title, i2.title as depends_title
        FROM dependencies d
        JOIN issues i1 ON i1.id = d.issue_id
        JOIN issues i2 ON i2.id = d.depends_on_id
        WHERE d.issue_id IN (${placeholders}) OR d.depends_on_id IN (${placeholders});
      `, [...ids, ...ids]);
            for (const d of allDeps) {
                const child = { id: d.issue_id, title: d.issue_title };
                const parent = { id: d.depends_on_id, title: d.depends_title };
                if (d.type === 'parent-child') {
                    // issue_id is child, depends_on_id is parent
                    parentMap.set(d.issue_id, parent);
                    const list = childrenMap.get(d.depends_on_id) ?? [];
                    list.push(child);
                    childrenMap.set(d.depends_on_id, list);
                }
                else if (d.type === 'blocks') {
                    // issue_id is BLOCKED BY depends_on_id
                    const blockedByList = blockedByMap.get(d.issue_id) ?? [];
                    blockedByList.push(parent); // parent here is just the blocker (depends_on_id)
                    blockedByMap.set(d.issue_id, blockedByList);
                    const blocksList = blocksMap.get(d.depends_on_id) ?? [];
                    blocksList.push(child); // child here is the blocked one (issue_id)
                    blocksMap.set(d.depends_on_id, blocksList);
                }
            }
            // Fetch comments for these issues
            const allComments = this.queryAll(`
        SELECT id, issue_id, author, text, created_at
        FROM comments
        WHERE issue_id IN (${placeholders})
        ORDER BY created_at ASC;
      `, ids);
            for (const c of allComments) {
                const list = commentsByIssue.get(c.issue_id) ?? [];
                list.push(c);
                commentsByIssue.set(c.issue_id, list);
            }
        }
        const cards = issues.map((r) => ({
            id: r.id,
            title: r.title,
            description: r.description,
            status: r.status,
            priority: r.priority,
            issue_type: r.issue_type,
            assignee: r.assignee,
            estimated_minutes: r.estimated_minutes,
            created_at: r.created_at,
            updated_at: r.updated_at,
            closed_at: r.closed_at,
            external_ref: r.external_ref,
            is_ready: r.is_ready === 1,
            blocked_by_count: r.blocked_by_count,
            acceptance_criteria: r.acceptance_criteria,
            design: r.design,
            labels: labelsByIssue.get(r.id) ?? [],
            parent: parentMap.get(r.id),
            children: childrenMap.get(r.id),
            blocked_by: blockedByMap.get(r.id),
            blocks: blocksMap.get(r.id),
            comments: commentsByIssue.get(r.id) ?? []
        }));
        const columns = [
            { key: "ready", title: "Ready" },
            { key: "in_progress", title: "In Progress" },
            { key: "blocked", title: "Blocked" },
            { key: "closed", title: "Closed" }
        ];
        return { columns, cards };
    }
    async createIssue(input) {
        if (!this.db)
            await this.ensureConnected();
        const db = this.db;
        const id = (0, uuid_1.v4)();
        const title = (input.title ?? "").trim();
        if (!title)
            throw new Error("Title is required.");
        const description = input.description ?? "";
        const status = input.status ?? "open";
        const priority = input.priority ?? 2;
        const issueType = input.issue_type ?? "task";
        const assignee = input.assignee ?? null;
        const estimated = input.estimated_minutes ?? null;
        this.runQuery(`
      INSERT INTO issues (id, title, description, status, priority, issue_type, assignee, estimated_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `, [id, title, description, status, priority, issueType, assignee, estimated]);
        return { id };
    }
    async setIssueStatus(id, toStatus) {
        if (!this.db)
            await this.ensureConnected();
        const db = this.db;
        // Enforce closed_at CHECK constraint properly
        if (toStatus === "closed") {
            this.runQuery(`
        UPDATE issues
        SET status='closed',
            closed_at=CURRENT_TIMESTAMP,
            updated_at=CURRENT_TIMESTAMP
        WHERE id = ?
          AND deleted_at IS NULL;
      `, [id]);
            return;
        }
        this.runQuery(`
      UPDATE issues
      SET status = ?,
      closed_at = NULL,
      updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      AND deleted_at IS NULL;
      `, [toStatus, id]);
    }
    async updateIssue(id, updates) {
        if (!this.db)
            await this.ensureConnected();
        const fields = [];
        const values = [];
        if (updates.title !== undefined) {
            fields.push("title = ?");
            values.push(updates.title);
        }
        if (updates.description !== undefined) {
            fields.push("description = ?");
            values.push(updates.description);
        }
        if (updates.priority !== undefined) {
            fields.push("priority = ?");
            values.push(updates.priority);
        }
        if (updates.issue_type !== undefined) {
            fields.push("issue_type = ?");
            values.push(updates.issue_type);
        }
        if (updates.assignee !== undefined) {
            fields.push("assignee = ?");
            values.push(updates.assignee);
        }
        if (updates.estimated_minutes !== undefined) {
            fields.push("estimated_minutes = ?");
            values.push(updates.estimated_minutes);
        }
        if (updates.acceptance_criteria !== undefined) {
            fields.push("acceptance_criteria = ?");
            values.push(updates.acceptance_criteria);
        }
        if (updates.design !== undefined) {
            fields.push("design = ?");
            values.push(updates.design);
        }
        if (updates.external_ref !== undefined) {
            fields.push("external_ref = ?");
            values.push(updates.external_ref);
        }
        if (fields.length === 0)
            return;
        fields.push("updated_at = CURRENT_TIMESTAMP");
        values.push(id);
        this.runQuery(`
      UPDATE issues
      SET ${fields.join(", ")}
      WHERE id = ? AND deleted_at IS NULL;
    `, values);
    }
    async addComment(issueId, text, author) {
        if (!this.db)
            await this.ensureConnected();
        this.runQuery(`
      INSERT INTO comments (issue_id, author, text)
      VALUES (?, ?, ?);
    `, [issueId, author, text]);
    }
    async addLabel(issueId, label) {
        if (!this.db)
            await this.ensureConnected();
        this.runQuery("INSERT OR IGNORE INTO labels (issue_id, label) VALUES (?, ?)", [issueId, label]);
    }
    async removeLabel(issueId, label) {
        if (!this.db)
            await this.ensureConnected();
        this.runQuery("DELETE FROM labels WHERE issue_id = ? AND label = ?", [issueId, label]);
    }
    async addDependency(issueId, dependsOnId, type = 'blocks') {
        if (!this.db)
            await this.ensureConnected();
        this.runQuery(`
      INSERT OR IGNORE INTO dependencies (issue_id, depends_on_id, type, created_by)
      VALUES (?, ?, ?, 'extension');
    `, [issueId, dependsOnId, type]);
    }
    async removeDependency(issueId, dependsOnId) {
        if (!this.db)
            await this.ensureConnected();
        this.runQuery("DELETE FROM dependencies WHERE issue_id = ? AND depends_on_id = ?", [issueId, dependsOnId]);
    }
    save() {
        if (this.db && this.dbPath) {
            const data = this.db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(this.dbPath, buffer);
        }
    }
    queryAll(sql, params = []) {
        if (!this.db)
            return [];
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject());
        }
        stmt.free();
        return rows;
    }
    runQuery(sql, params = []) {
        if (!this.db)
            return;
        this.db.run(sql, params);
        this.save();
    }
}
exports.BeadsAdapter = BeadsAdapter;
