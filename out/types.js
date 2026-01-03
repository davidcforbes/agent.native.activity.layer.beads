"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DependencySchema = exports.LabelSchema = exports.CommentAddSchema = exports.SetStatusSchema = exports.IssueCreateSchema = exports.IssueUpdateSchema = void 0;
const zod_1 = require("zod");
// Zod validation schemas for runtime message validation
exports.IssueUpdateSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    updates: zod_1.z.object({
        title: zod_1.z.string().max(500).optional(),
        description: zod_1.z.string().max(10000).optional(),
        priority: zod_1.z.number().int().min(0).max(4).optional(),
        issue_type: zod_1.z.enum(['task', 'bug', 'feature']).optional(),
        assignee: zod_1.z.string().max(100).nullable().optional(),
        estimated_minutes: zod_1.z.number().int().min(0).nullable().optional(),
        acceptance_criteria: zod_1.z.string().max(10000).optional(),
        design: zod_1.z.string().max(10000).optional(),
        external_ref: zod_1.z.string().max(200).optional()
    })
});
exports.IssueCreateSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(500),
    description: zod_1.z.string().max(10000).optional(),
    status: zod_1.z.enum(['open', 'in_progress', 'blocked', 'closed']).optional(),
    priority: zod_1.z.number().int().min(0).max(4).optional(),
    issue_type: zod_1.z.enum(['task', 'bug', 'feature']).optional(),
    assignee: zod_1.z.string().max(100).nullable().optional(),
    estimated_minutes: zod_1.z.number().int().min(0).nullable().optional()
});
exports.SetStatusSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    status: zod_1.z.enum(['open', 'in_progress', 'blocked', 'closed'])
});
exports.CommentAddSchema = zod_1.z.object({
    issueId: zod_1.z.string().uuid(),
    text: zod_1.z.string().min(1).max(10000),
    author: zod_1.z.string().max(100)
});
exports.LabelSchema = zod_1.z.object({
    issueId: zod_1.z.string().uuid(),
    label: zod_1.z.string().min(1).max(100)
});
exports.DependencySchema = zod_1.z.object({
    issueId: zod_1.z.string().uuid(),
    dependsOnId: zod_1.z.string().uuid(),
    type: zod_1.z.enum(['blocks', 'parent-child']).optional()
});
