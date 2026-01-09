"use strict";
/**
 * Markdown Content Validator
 *
 * Provides server-side validation of markdown content before sending to webview.
 * This is a defense-in-depth measure - the webview still uses DOMPurify for HTML sanitization.
 *
 * Security Model:
 * - Extension host: Validates markdown for suspicious patterns, logs warnings
 * - Webview: Parses markdown to HTML with marked.js, sanitizes with DOMPurify
 * - CSP: Final defense layer blocking script execution
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateMarkdownContent = validateMarkdownContent;
exports.validateMarkdownFields = validateMarkdownFields;
exports.validateCommentContent = validateCommentContent;
// Patterns that indicate potentially malicious markdown content
const SUSPICIOUS_PATTERNS = [
    // JavaScript protocol in links or images
    { pattern: /javascript:/gi, description: 'javascript: protocol' },
    // Data URIs that might contain scripts
    { pattern: /data:text\/html/gi, description: 'data:text/html URI' },
    { pattern: /data:.*script/gi, description: 'data URI with script' },
    // Common XSS vectors in HTML (markdown allows raw HTML)
    { pattern: /<script[\s>]/gi, description: '<script> tag' },
    { pattern: /<iframe[\s>]/gi, description: '<iframe> tag' },
    { pattern: /<object[\s>]/gi, description: '<object> tag' },
    { pattern: /<embed[\s>]/gi, description: '<embed> tag' },
    // Event handlers in raw HTML
    { pattern: /\son\w+\s*=/gi, description: 'inline event handler' },
    // vbscript: protocol (legacy but still dangerous)
    { pattern: /vbscript:/gi, description: 'vbscript: protocol' },
    // file: protocol (information disclosure)
    { pattern: /file:\/\//gi, description: 'file:// protocol' },
];
/**
 * Validates markdown content for suspicious patterns.
 * Does NOT modify content - only detects and logs warnings.
 *
 * @param content Markdown content to validate
 * @param fieldName Name of the field for logging (e.g., "description", "comment")
 * @param output Optional output channel for logging warnings
 * @returns Validation result with warnings
 */
function validateMarkdownContent(content, fieldName, output) {
    // Null/empty content is safe
    if (!content) {
        return { isValid: true, warnings: [], content: '' };
    }
    const warnings = [];
    // Check for suspicious patterns
    for (const { pattern, description } of SUSPICIOUS_PATTERNS) {
        const matches = content.match(pattern);
        if (matches) {
            const warning = `Suspicious content in ${fieldName}: ${description} (found: ${matches.join(', ')})`;
            warnings.push(warning);
            // Log to output channel if provided
            if (output) {
                output.appendLine(`[Security Warning] ${warning}`);
            }
        }
    }
    // Consider invalid if critical patterns are found
    const hasCritical = warnings.some(w => w.includes('javascript:') ||
        w.includes('<script>') ||
        w.includes('data:text/html'));
    return {
        isValid: !hasCritical,
        warnings,
        content
    };
}
/**
 * Validates all markdown fields in a card/issue.
 *
 * @param data Object containing markdown fields
 * @param output Optional output channel for logging
 * @returns True if all fields are valid (no critical issues)
 */
function validateMarkdownFields(data, output) {
    const results = [
        validateMarkdownContent(data.description, 'description', output),
        validateMarkdownContent(data.acceptance_criteria, 'acceptance_criteria', output),
        validateMarkdownContent(data.design, 'design', output),
        validateMarkdownContent(data.notes, 'notes', output),
    ];
    return results.every(r => r.isValid);
}
/**
 * Validates a comment's markdown content.
 *
 * @param text Comment text (markdown)
 * @param output Optional output channel for logging
 * @returns Validation result
 */
function validateCommentContent(text, output) {
    return validateMarkdownContent(text, 'comment', output);
}
