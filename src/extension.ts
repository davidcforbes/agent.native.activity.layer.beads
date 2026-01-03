import * as vscode from "vscode";
import * as net from "net";
import { BeadsAdapter } from "./beadsAdapter";
import { getWebviewHtml } from "./webview";
import {
  BoardData,
  BoardColumnKey,
  IssueStatus,
  IssueUpdateSchema,
  IssueCreateSchema,
  CommentAddSchema,
  LabelSchema,
  DependencySchema
} from "./types";

type WebMsg =
  | { type: "board.load"; requestId: string }
  | { type: "board.refresh"; requestId: string }
  | { type: "issue.create"; requestId: string; payload: { title: string; description?: string } }
  | { type: "issue.move"; requestId: string; payload: { id: string; toColumn: BoardColumnKey } }
  | { type: "issue.addToChat"; requestId: string; payload: { text: string } }
  | { type: "issue.copyToClipboard"; requestId: string; payload: { text: string } }
  | { type: "issue.update"; requestId: string; payload: { id: string; updates: any } }
  | { type: "issue.addComment"; requestId: string; payload: { id: string; text: string; author?: string } }
  | { type: "issue.addLabel"; requestId: string; payload: { id: string; label: string } }
  | { type: "issue.removeLabel"; requestId: string; payload: { id: string; label: string } }
  | { type: "issue.addDependency"; requestId: string; payload: { id: string; otherId: string; type: 'parent-child' | 'blocks' } }
  | { type: "issue.removeDependency"; requestId: string; payload: { id: string; otherId: string } };

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

    const sendBoard = async (requestId: string) => {
      try {
        const data = await adapter.getBoard();
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
          const validation = IssueCreateSchema.safeParse(msg.payload);
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
          const toStatus: IssueStatus = mapColumnToStatus(msg.payload.toColumn);
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
          const validation = IssueUpdateSchema.safeParse(msg.payload);
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
            const validation = CommentAddSchema.safeParse({
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
            const validation = LabelSchema.safeParse({
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
            const validation = LabelSchema.safeParse({
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
            const validation = DependencySchema.safeParse({
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
            const validation = DependencySchema.safeParse({
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
