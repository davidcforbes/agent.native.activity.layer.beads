import { z } from 'zod';

export type IssueStatus = "open" | "in_progress" | "blocked" | "closed";

export type BoardColumnKey = "ready" | "open" | "in_progress" | "blocked" | "closed";

export interface IssueRow {
  id: string;
  title: string;
  description: string;
  status: IssueStatus | string;
  priority: number;
  issue_type: string;
  assignee: string | null;
  estimated_minutes: number | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  external_ref: string | null;
  acceptance_criteria: string;
  design: string;

  is_ready: number; // 0/1
  blocked_by_count: number; // integer
  pinned: number | null; // 0/1
  is_template: number | null; // 0/1
  ephemeral: number | null; // 0/1
}

export interface BoardCard {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  issue_type: string;
  assignee?: string | null;
  estimated_minutes?: number | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  external_ref?: string | null;
  acceptance_criteria: string;
  design: string;

  is_ready: boolean;
  blocked_by_count: number;
  labels: string[];
  pinned?: boolean;
  is_template?: boolean;
  ephemeral?: boolean;

  // Relationships
  parent?: { id: string; title: string };
  children?: { id: string; title: string }[];
  blocks?: { id: string; title: string }[];
  blocked_by?: { id: string; title: string }[];
  comments?: Comment[];
}

export interface Comment {
  id: number;
  issue_id: string;
  author: string;
  text: string;
  created_at: string;
}

export interface BoardColumn {
  key: BoardColumnKey;
  title: string;
}

export interface BoardData {
  columns: BoardColumn[];
  cards: BoardCard[];
}

// Zod validation schemas for runtime message validation
export const IssueUpdateSchema = z.object({
  id: z.string().uuid(),
  updates: z.object({
    title: z.string().max(500).optional(),
    description: z.string().max(10000).optional(),
    priority: z.number().int().min(0).max(4).optional(),
    issue_type: z.enum(['task', 'bug', 'feature', 'epic', 'chore']).optional(),
    assignee: z.string().max(100).nullable().optional(),
    estimated_minutes: z.number().int().min(0).nullable().optional(),
    acceptance_criteria: z.string().max(10000).optional(),
    design: z.string().max(10000).optional(),
    external_ref: z.string().max(200).optional()
  })
});

export const IssueCreateSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  status: z.enum(['open', 'in_progress', 'blocked', 'closed']).optional(),
  priority: z.number().int().min(0).max(4).optional(),
  issue_type: z.enum(['task', 'bug', 'feature', 'epic', 'chore']).optional(),
  assignee: z.string().max(100).nullable().optional(),
  estimated_minutes: z.number().int().min(0).nullable().optional()
});

export const SetStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['open', 'in_progress', 'blocked', 'closed'])
});

export const CommentAddSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(1).max(10000),
  author: z.string().max(100)
});

export const LabelSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(100)
});

export const DependencySchema = z.object({
  id: z.string().uuid(),
  otherId: z.string().uuid(),
  type: z.enum(['blocks', 'parent-child']).optional()
});
