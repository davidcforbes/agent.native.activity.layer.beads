import * as vscode from "vscode";
import * as net from "net";
import { BeadsAdapter } from "./beadsAdapter";
import { getWebviewHtml } from "./webview";
import { BoardData, BoardColumnKey, IssueStatus } from "./types";

type WebMsg =
  | { type: "board.load"; requestId: string }
  | { type: "board.refresh"; requestId: string }
  | { type: "issue.create"; requestId: string; payload: { title: string; description?: string } }
  | { type: "issue.move"; requestId: string; payload: { id: string; toColumn: BoardColumnKey } };

type ExtMsg =
  | { type: "board.data"; requestId: string; payload: BoardData }
  | { type: "mutation.ok"; requestId: string }
  | { type: "mutation.error"; requestId: string; error: string };

export function activate(context: vscode.ExtensionContext) {
  net.setDefaultAutoSelectFamilyAttemptTimeout(1000);
  console.log('[BeadsAdapter] Environment Versions:', JSON.stringify(process.versions, null, 2));
  const output = vscode.window.createOutputChannel("Beads Kanban");
  const adapter = new BeadsAdapter(output);

  context.subscriptions.push(output);
  context.subscriptions.push({ dispose: () => adapter.dispose() });

  const openCmd = vscode.commands.registerCommand("beadsKanban.openBoard", async () => {
    const panel = vscode.window.createWebviewPanel(
      "beadsKanban.board",
      "Beads Kanban",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri);

    const readOnly = vscode.workspace.getConfiguration().get<boolean>("beadsKanban.readOnly", false);

    const post = (msg: ExtMsg) => panel.webview.postMessage(msg);

    const sendBoard = (requestId: string) => {
      try {
        const data = adapter.getBoard();
        post({ type: "board.data", requestId, payload: data });
      } catch (e) {
        post({ type: "mutation.error", requestId, error: String(e instanceof Error ? e.message : e) });
      }
    };

    panel.webview.onDidReceiveMessage(async (msg: WebMsg) => {
      if (!msg?.type || !msg.requestId) return;

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
          adapter.createIssue({
            title: msg.payload.title,
            description: msg.payload.description ?? ""
          });
          post({ type: "mutation.ok", requestId: msg.requestId });
          // push refreshed board
          sendBoard(msg.requestId);
          return;
        }

        if (msg.type === "issue.move") {
          const toStatus: IssueStatus = mapColumnToStatus(msg.payload.toColumn);
          adapter.setIssueStatus(msg.payload.id, toStatus);
          post({ type: "mutation.ok", requestId: msg.requestId });
          sendBoard(msg.requestId);
          return;
        }

        post({ type: "mutation.error", requestId: (msg as any).requestId, error: `Unknown message type: ${(msg as any).type}` });
      } catch (e) {
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
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(ws, ".beads/**/*.{db,sqlite,sqlite3}")
      );
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

export function deactivate() {
  // nothing
}

function mapColumnToStatus(col: "ready" | "open" | "in_progress" | "blocked" | "closed"): IssueStatus {
  // Ready is derived from `ready_issues` view; status is still "open"
  if (col === "ready") return "open";
  if (col === "open") return "open";
  if (col === "in_progress") return "in_progress";
  if (col === "blocked") return "blocked";
  return "closed";
}
