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
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const webview_1 = require("../../webview");
suite('Webview Security Tests', () => {
    let mockWebview;
    let mockUri;
    setup(() => {
        // Create mock webview
        const panel = vscode.window.createWebviewPanel('test', 'Test', vscode.ViewColumn.One, { enableScripts: true });
        mockWebview = panel.webview;
        mockUri = vscode.Uri.file(__dirname);
        panel.dispose();
    });
    test('CSP: Has strict default-src none', () => {
        const html = (0, webview_1.getWebviewHtml)(mockWebview, mockUri);
        assert.ok(html.includes("default-src 'none'"), 'CSP should have default-src none');
    });
    test('CSP: No unsafe-inline in script-src', () => {
        const html = (0, webview_1.getWebviewHtml)(mockWebview, mockUri);
        const cspMatch = html.match(/script-src ([^;]+)/);
        assert.ok(cspMatch, 'CSP should have script-src directive');
        assert.ok(!cspMatch[1].includes('unsafe-inline'), 'script-src should not allow unsafe-inline');
    });
    test('CSP: Has nonce-based script execution', () => {
        const html = (0, webview_1.getWebviewHtml)(mockWebview, mockUri);
        const cspMatch = html.match(/script-src ([^;]+)/);
        assert.ok(cspMatch, 'CSP should have script-src directive');
        assert.ok(cspMatch[1].includes("'nonce-"), 'script-src should use nonce');
    });
    test('CSP: Restricts img-src to webview context only', () => {
        const html = (0, webview_1.getWebviewHtml)(mockWebview, mockUri);
        const cspMatch = html.match(/img-src ([^;]+)/);
        assert.ok(cspMatch, 'CSP should have img-src directive');
        assert.ok(!cspMatch[1].includes('https:'), 'img-src should not allow unrestricted https');
    });
    test('CSP: Has base-uri none', () => {
        const html = (0, webview_1.getWebviewHtml)(mockWebview, mockUri);
        assert.ok(html.includes("base-uri 'none'"), 'CSP should restrict base-uri');
    });
    test('CSP: Has frame-ancestors none', () => {
        const html = (0, webview_1.getWebviewHtml)(mockWebview, mockUri);
        assert.ok(html.includes("frame-ancestors 'none'"), 'CSP should prevent framing');
    });
    test('CSP: Has form-action none', () => {
        const html = (0, webview_1.getWebviewHtml)(mockWebview, mockUri);
        assert.ok(html.includes("form-action 'none'"), 'CSP should restrict form actions');
    });
    test('Nonce: Generated uniquely per request', () => {
        const html1 = (0, webview_1.getWebviewHtml)(mockWebview, mockUri);
        const html2 = (0, webview_1.getWebviewHtml)(mockWebview, mockUri);
        const nonce1 = html1.match(/nonce-([a-f0-9]+)/)?.[1];
        const nonce2 = html2.match(/nonce-([a-f0-9]+)/)?.[1];
        assert.ok(nonce1, 'First HTML should have nonce');
        assert.ok(nonce2, 'Second HTML should have nonce');
        assert.notStrictEqual(nonce1, nonce2, 'Nonces should be unique per request');
        assert.ok(nonce1.length >= 16, 'Nonce should be at least 16 characters (cryptographically secure)');
    });
    test('DOMPurify: Script is included for sanitization', () => {
        const html = (0, webview_1.getWebviewHtml)(mockWebview, mockUri);
        assert.ok(html.includes('dompurify'), 'HTML should include DOMPurify library');
    });
    test('HTML Entities: Title input has maxlength', () => {
        const html = (0, webview_1.getWebviewHtml)(mockWebview, mockUri);
        const titleInput = html.match(/<input[^>]*id="newTitle"[^>]*>/);
        assert.ok(titleInput, 'Should have title input');
        assert.ok(titleInput[0].includes('maxlength'), 'Title input should have maxlength attribute');
    });
});
