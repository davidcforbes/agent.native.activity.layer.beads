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
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const net = __importStar(require("net"));
const beadsAdapter_1 = require("./beadsAdapter");
const webview_1 = require("./webview");
const types_1 = require("./types");
function activate(context) {
    net.setDefaultAutoSelectFamilyAttemptTimeout(1000);
    console.log('[BeadsAdapter] Environment Versions:', JSON.stringify(process.versions, null, 2));
    const output = vscode.window.createOutputChannel("Beads Kanban");
    const adapter = new beadsAdapter_1.BeadsAdapter(output);
    context.subscriptions.push(output);
    context.subscriptions.push({ dispose: () => adapter.dispose() });
    const openCmd = vscode.commands.registerCommand("beadsKanban.openBoard", async () => {
        const panel = vscode.window.createWebviewPanel("beadsKanban.board", "Beads Kanban", vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        panel.webview.html = (0, webview_1.getWebviewHtml)(panel.webview, context.extensionUri);
        const readOnly = vscode.workspace.getConfiguration().get("beadsKanban.readOnly", false);
        const post = (msg) => panel.webview.postMessage(msg);
        const sendBoard = async (requestId) => {
            try {
                const data = await adapter.getBoard();
                post({ type: "board.data", requestId, payload: data });
            }
            catch (e) {
                post({ type: "mutation.error", requestId, error: String(e instanceof Error ? e.message : e) });
            }
        };
        panel.webview.onDidReceiveMessage(async (msg) => {
            if (!msg?.type || !msg.requestId)
                return;
            if (msg.type === "board.load" || msg.type === "board.refresh") {
                sendBoard(msg.requestId);
                return;
            }
            if (readOnly) {
                post({ type: "mutation.error", requestId: msg.requestId, error: "Extension is in read-only mode." });
                return;
            }
            try {
                if (msg.type === "issue.create") {
                    const validation = types_1.IssueCreateSchema.safeParse(msg.payload);
                    if (!validation.success) {
                        post({ type: "mutation.error", requestId: msg.requestId, error: `Invalid issue data: ${validation.error.message}` });
                        return;
                    }
                    await adapter.createIssue(validation.data);
                    post({ type: "mutation.ok", requestId: msg.requestId });
                    // push refreshed board
                    await sendBoard(msg.requestId);
                    return;
                }
                if (msg.type === "issue.move") {
                    const toStatus = mapColumnToStatus(msg.payload.toColumn);
                    await adapter.setIssueStatus(msg.payload.id, toStatus);
                    post({ type: "mutation.ok", requestId: msg.requestId });
                    await sendBoard(msg.requestId);
                    return;
                }
                if (msg.type === "issue.addToChat") {
                    vscode.commands.executeCommand("workbench.action.chat.open", { query: msg.payload.text });
                    post({ type: "mutation.ok", requestId: msg.requestId });
                    return;
                }
                if (msg.type === "issue.copyToClipboard") {
                    vscode.env.clipboard.writeText(msg.payload.text);
                    post({ type: "mutation.ok", requestId: msg.requestId });
                    vscode.window.showInformationMessage("Issue context copied to clipboard.");
                    return;
                }
                if (msg.type === "issue.update") {
                    const validation = types_1.IssueUpdateSchema.safeParse(msg.payload);
                    if (!validation.success) {
                        post({ type: "mutation.error", requestId: msg.requestId, error: `Invalid update data: ${validation.error.message}` });
                        return;
                    }
                    await adapter.updateIssue(validation.data.id, validation.data.updates);
                    post({ type: "mutation.ok", requestId: msg.requestId });
                    await sendBoard(msg.requestId);
                    return;
                }
                if (msg.type === "issue.addComment") {
                    // TODO: Attempt to get git user name or vs code user name?
                    // For now, default to "Me" or let UI send it?
                    // Let's use a simple default here if not provided.
                    const author = msg.payload.author || "User";
                    const validation = types_1.CommentAddSchema.safeParse({
                        issueId: msg.payload.id,
                        text: msg.payload.text,
                        author
                    });
                    if (!validation.success) {
                        post({ type: "mutation.error", requestId: msg.requestId, error: `Invalid comment data: ${validation.error.message}` });
                        return;
                    }
                    await adapter.addComment(validation.data.issueId, validation.data.text, validation.data.author);
                    post({ type: "mutation.ok", requestId: msg.requestId });
                    await sendBoard(msg.requestId);
                    return;
                }
                if (msg.type === "issue.addLabel") {
                    const validation = types_1.LabelSchema.safeParse({
                        issueId: msg.payload.id,
                        label: msg.payload.label
                    });
                    if (!validation.success) {
                        post({ type: "mutation.error", requestId: msg.requestId, error: `Invalid label data: ${validation.error.message}` });
                        return;
                    }
                    await adapter.addLabel(validation.data.issueId, validation.data.label);
                    post({ type: "mutation.ok", requestId: msg.requestId });
                    await sendBoard(msg.requestId);
                    return;
                }
                if (msg.type === "issue.removeLabel") {
                    const validation = types_1.LabelSchema.safeParse({
                        issueId: msg.payload.id,
                        label: msg.payload.label
                    });
                    if (!validation.success) {
                        post({ type: "mutation.error", requestId: msg.requestId, error: `Invalid label data: ${validation.error.message}` });
                        return;
                    }
                    await adapter.removeLabel(validation.data.issueId, validation.data.label);
                    post({ type: "mutation.ok", requestId: msg.requestId });
                    await sendBoard(msg.requestId);
                    return;
                }
                if (msg.type === "issue.addDependency") {
                    const validation = types_1.DependencySchema.safeParse({
                        issueId: msg.payload.id,
                        dependsOnId: msg.payload.otherId,
                        type: msg.payload.type
                    });
                    if (!validation.success) {
                        post({ type: "mutation.error", requestId: msg.requestId, error: `Invalid dependency data: ${validation.error.message}` });
                        return;
                    }
                    await adapter.addDependency(validation.data.issueId, validation.data.dependsOnId, validation.data.type);
                    post({ type: "mutation.ok", requestId: msg.requestId });
                    await sendBoard(msg.requestId);
                    return;
                }
                if (msg.type === "issue.removeDependency") {
                    const validation = types_1.DependencySchema.safeParse({
                        issueId: msg.payload.id,
                        dependsOnId: msg.payload.otherId
                    });
                    if (!validation.success) {
                        post({ type: "mutation.error", requestId: msg.requestId, error: `Invalid dependency data: ${validation.error.message}` });
                        return;
                    }
                    await adapter.removeDependency(validation.data.issueId, validation.data.dependsOnId);
                    post({ type: "mutation.ok", requestId: msg.requestId });
                    await sendBoard(msg.requestId);
                    return;
                }
                post({ type: "mutation.error", requestId: msg.requestId, error: `Unknown message type: ${msg.type}` });
            }
            catch (e) {
                post({
                    type: "mutation.error",
                    requestId: msg.requestId,
                    error: String(e instanceof Error ? e.message : e)
                });
            }
        });
        // Auto refresh when DB files change
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (ws) {
            const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(ws, ".beads/**/*.{db,sqlite,sqlite3}"));
            const refresh = () => {
                const requestId = `fs-${Date.now()}`;
                sendBoard(requestId);
            };
            watcher.onDidChange(refresh);
            watcher.onDidCreate(refresh);
            watcher.onDidDelete(refresh);
            panel.onDidDispose(() => watcher.dispose());
        }
        // initial load
        sendBoard(`init-${Date.now()}`);
    });
    context.subscriptions.push(openCmd);
}
function deactivate() {
    // nothing
}
function mapColumnToStatus(col) {
    // Ready is derived from `ready_issues` view; status is still "open"
    if (col === "ready")
        return "open";
    if (col === "open")
        return "open";
    if (col === "in_progress")
        return "in_progress";
    if (col === "blocked")
        return "blocked";
    return "closed";
}
