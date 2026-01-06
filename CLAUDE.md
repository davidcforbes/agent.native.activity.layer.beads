# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VS Code extension that provides a Kanban board interface for managing issues stored in a `.beads` SQLite database. It integrates with the Beads workflow system to provide a visual, drag-and-drop interface for issue tracking within the workspace.

## Development Commands

### Build & Watch
- `npm run compile` - Compile TypeScript and copy WASM files
- `npm run watch` - Watch mode for development
- `npm run lint` - Run ESLint on TypeScript files

### Testing
- `npm test` - Run all tests (requires compile first via pretest)
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with c8 coverage
- Press F5 with "Extension Tests" launch config to debug tests

**Running specific tests:** The test runner uses Mocha. To run a specific test file or filter by test name, modify `src/test/suite/index.ts` temporarily to use Mocha's `grep` option or change the glob pattern. Test files are in `src/test/suite/*.test.ts`.

### Running the Extension
- Press F5 in VS Code to launch Extension Development Host
- Use "Beads: Open Kanban Board" command to open the board

## Architecture

### Core Components

**Extension Host (TypeScript/Node.js)**
- `src/extension.ts` - Entry point; registers commands, creates webview panel, handles message routing between webview and adapter
- `src/beadsAdapter.ts` - SQLite database adapter using sql.js (WebAssembly); handles all CRUD operations and relationship queries
- `src/types.ts` - Type definitions for issues, board data, and message contracts
- `src/webview.ts` - Generates HTML for the webview panel with CSP headers

**Webview (JavaScript/HTML/CSS)**
- `media/main.js` - Client-side UI logic; handles drag-and-drop (Sortable.js), filtering, dialogs, and bidirectional communication with extension
- `media/styles.css` - VS Code theme-aware styling
- `media/Sortable.min.js` - Drag-and-drop library
- `media/marked.min.js` - Markdown rendering library

### Message Protocol

The extension uses a request/response pattern for webview-extension communication:

**WebMsg types** (Webview → Extension):
- `board.load` / `board.refresh` - Request board data
- `issue.create` - Create new issue
- `issue.move` - Drag-and-drop status change
- `issue.update` - Update issue fields
- `issue.addComment` - Add comment
- `issue.addLabel` / `issue.removeLabel` - Manage labels
- `issue.addDependency` / `issue.removeDependency` - Manage relationships
- `issue.addToChat` - Send to VS Code chat
- `issue.copyToClipboard` - Copy issue context

**ExtMsg types** (Extension → Webview):
- `board.data` - Board data payload
- `mutation.ok` - Success response
- `mutation.error` - Error response with message

### Database Schema

The extension reads from a SQLite database at `.beads/*.db` (or .sqlite/.sqlite3). Note: When the Beads CLI has `no-db: true` in `.beads/config.yaml`, it uses JSONL as the source of truth and the SQLite database may not exist. The extension requires SQLite.

**Expected schema:**

**Core Tables:**
- `issues` - Main issue table (id, title, description, status, priority, issue_type, assignee, estimated_minutes, created_at, updated_at, closed_at, external_ref, acceptance_criteria, design, deleted_at)
- `dependencies` - Issue relationships (issue_id, depends_on_id, type: 'parent-child' | 'blocks')
- `labels` - Issue tags (issue_id, label)
- `comments` - Issue comments (id, issue_id, author, text, created_at)

**Views:**
- `ready_issues` - Issues ready to work on (open, no blockers)
- `blocked_issues` - Issues with dependencies (includes blocked_by_count)

### Column Logic

The board displays 4 columns with deterministic card placement:
1. **Ready** - `status='open'` AND in `ready_issues` view (no blockers)
2. **In Progress** - `status='in_progress'`
3. **Blocked** - `status='blocked'` OR `blocked_by_count > 0` OR `status='open'` but not ready
4. **Closed** - `status='closed'`

Note: Moving cards between columns updates the underlying issue status, with "Ready" mapping back to "open" status.

### Database Connection

The adapter uses sql.js (WebAssembly-based SQLite) for in-memory database operations:
1. Loads database file into memory on first connection
2. Executes queries against in-memory database
3. Exports and writes back to file on every mutation
4. File watcher triggers board refresh when .beads/**/*.db changes

### Key Design Patterns

**Bulk Loading**: The adapter pre-loads relationships (labels, dependencies, comments) for all issues in a single query using placeholders, then maps them to cards to avoid N+1 queries.

**Read-Only Mode**: Respects `beadsKanban.readOnly` config setting to disable mutations.

**Auto-Refresh**: File system watcher automatically refreshes board when database files change externally.

**Theme Integration**: CSS uses VS Code theme variables (e.g., `var(--vscode-editor-background)`) for seamless light/dark mode support.

### Input Validation

All mutation messages from the webview are validated using Zod schemas (`src/types.ts`) before database operations:
- `IssueCreateSchema` / `IssueUpdateSchema` - Issue mutations with field limits
- `CommentAddSchema` / `LabelSchema` / `DependencySchema` - Relationship mutations
- UUID validation on all issue IDs prevents injection attacks

## Important Notes

- The extension uses sql.js (WebAssembly) instead of native SQLite, so `sql-wasm.wasm` must be copied to `out/` directory during build (handled by `npm run compile`)
- All database operations are synchronous but wrapped in async functions for consistency
- The webview uses `retainContextWhenHidden: true` to preserve state when panel is hidden
- Issue IDs are UUIDs generated with the `uuid` package
- Markdown preview uses marked.js with GFM (GitHub Flavored Markdown) and breaks enabled
- Tests use Mocha with Chai assertions and Sinon for mocking; test files match pattern `*.test.ts`
