import * as assert from 'assert';
import * as vscode from 'vscode';
import { DaemonBeadsAdapter } from '../../daemonBeadsAdapter';

suite('DaemonBeadsAdapter Integration Tests', () => {
    let adapter: DaemonBeadsAdapter;
    let output: vscode.OutputChannel;
    let workspaceRoot: string;

    setup(() => {
        output = vscode.window.createOutputChannel('Test');
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) {
            throw new Error('No workspace folder found for testing');
        }
        workspaceRoot = ws.uri.fsPath;
        adapter = new DaemonBeadsAdapter(workspaceRoot, output);
    });

    teardown(() => {
        adapter.dispose();
        output.dispose();
    });

    test('Daemon connection check', async function() {
        this.timeout(10000);

        try {
            await adapter.ensureConnected();
            assert.ok(true, 'Should connect to daemon without errors');
        } catch (err) {
            if (err instanceof Error && err.message.includes('daemon is not running')) {
                this.skip(); // Skip if daemon is not running
            }
            throw err;
        }
    });

    test('Get board data from daemon', async function() {
        this.timeout(10000);

        try {
            const board = await adapter.getBoard();

            assert.ok(board, 'Should return board data');
            assert.ok(Array.isArray(board.columns), 'Should have columns array');
            assert.ok(Array.isArray(board.cards), 'Should have cards array');
            assert.strictEqual(board.columns.length, 4, 'Should have 4 columns');

            // Verify column structure
            const columnKeys = board.columns.map(c => c.key);
            assert.ok(columnKeys.includes('ready'), 'Should have ready column');
            assert.ok(columnKeys.includes('in_progress'), 'Should have in_progress column');
            assert.ok(columnKeys.includes('blocked'), 'Should have blocked column');
            assert.ok(columnKeys.includes('closed'), 'Should have closed column');

            // Verify cards have required fields
            if (board.cards.length > 0) {
                const card = board.cards[0];
                assert.ok(card.id, 'Card should have id');
                assert.ok(card.title, 'Card should have title');
                assert.ok(card.status, 'Card should have status');
            }
        } catch (err) {
            if (err instanceof Error && err.message.includes('daemon is not running')) {
                this.skip();
            }
            throw err;
        }
    });

    test('Create issue via daemon', async function() {
        this.timeout(10000);

        try {
            const result = await adapter.createIssue({
                title: 'Test Daemon Adapter Issue',
                description: 'Testing DaemonBeadsAdapter createIssue',
                priority: 2,
                issue_type: 'task'
            });

            assert.ok(result.id, 'Should return an issue ID');
            assert.strictEqual(typeof result.id, 'string');
            assert.ok(result.id.length > 0, 'ID should be non-empty');

            // Clean up - close the test issue
            await adapter.setIssueStatus(result.id, 'closed');
        } catch (err) {
            if (err instanceof Error && err.message.includes('daemon is not running')) {
                this.skip();
            }
            throw err;
        }
    });
});
