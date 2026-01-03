import * as assert from 'assert';
import {
    IssueUpdateSchema,
    IssueCreateSchema,
    CommentAddSchema,
    LabelSchema,
    DependencySchema
} from '../../types';

suite('Message Validation Tests', () => {
    test('IssueCreateSchema: Valid issue passes', () => {
        const validIssue = {
            title: 'Test Issue',
            description: 'Test description',
            priority: 2,
            issue_type: 'task'
        };

        const result = IssueCreateSchema.safeParse(validIssue);
        assert.ok(result.success, 'Valid issue should pass validation');
    });

    test('IssueCreateSchema: Rejects empty title', () => {
        const invalidIssue = {
            title: '',
            description: 'Test description'
        };

        const result = IssueCreateSchema.safeParse(invalidIssue);
        assert.ok(!result.success, 'Empty title should fail validation');
    });

    test('IssueCreateSchema: Rejects title over 500 chars', () => {
        const invalidIssue = {
            title: 'A'.repeat(501),
            description: 'Test'
        };

        const result = IssueCreateSchema.safeParse(invalidIssue);
        assert.ok(!result.success, 'Title over 500 chars should fail validation');
    });

    test('IssueCreateSchema: Rejects invalid issue type', () => {
        const invalidIssue = {
            title: 'Test',
            issue_type: 'invalid-type'
        };

        const result = IssueCreateSchema.safeParse(invalidIssue);
        assert.ok(!result.success, 'Invalid issue_type should fail validation');
    });

    test('IssueCreateSchema: Rejects invalid priority', () => {
        const invalidIssue = {
            title: 'Test',
            priority: 10 // Only 0-4 allowed
        };

        const result = IssueCreateSchema.safeParse(invalidIssue);
        assert.ok(!result.success, 'Priority out of range should fail validation');
    });

    test('IssueUpdateSchema: Valid update passes', () => {
        const validUpdate = {
            id: '550e8400-e29b-41d4-a716-446655440000',
            updates: {
                title: 'Updated Title',
                priority: 1
            }
        };

        const result = IssueUpdateSchema.safeParse(validUpdate);
        assert.ok(result.success, 'Valid update should pass validation');
    });

    test('IssueUpdateSchema: Rejects invalid UUID', () => {
        const invalidUpdate = {
            id: 'not-a-uuid',
            updates: { title: 'Test' }
        };

        const result = IssueUpdateSchema.safeParse(invalidUpdate);
        assert.ok(!result.success, 'Invalid UUID should fail validation');
    });

    test('IssueUpdateSchema: Rejects description over 10000 chars', () => {
        const invalidUpdate = {
            id: '550e8400-e29b-41d4-a716-446655440000',
            updates: {
                description: 'A'.repeat(10001)
            }
        };

        const result = IssueUpdateSchema.safeParse(invalidUpdate);
        assert.ok(!result.success, 'Description over 10000 chars should fail validation');
    });

    test('CommentAddSchema: Valid comment passes', () => {
        const validComment = {
            issueId: '550e8400-e29b-41d4-a716-446655440000',
            text: 'This is a comment',
            author: 'User'
        };

        const result = CommentAddSchema.safeParse(validComment);
        assert.ok(result.success, 'Valid comment should pass validation');
    });

    test('CommentAddSchema: Rejects empty text', () => {
        const invalidComment = {
            issueId: '550e8400-e29b-41d4-a716-446655440000',
            text: '',
            author: 'User'
        };

        const result = CommentAddSchema.safeParse(invalidComment);
        assert.ok(!result.success, 'Empty comment text should fail validation');
    });

    test('LabelSchema: Valid label passes', () => {
        const validLabel = {
            issueId: '550e8400-e29b-41d4-a716-446655440000',
            label: 'bug'
        };

        const result = LabelSchema.safeParse(validLabel);
        assert.ok(result.success, 'Valid label should pass validation');
    });

    test('LabelSchema: Rejects label over 100 chars', () => {
        const invalidLabel = {
            issueId: '550e8400-e29b-41d4-a716-446655440000',
            label: 'A'.repeat(101)
        };

        const result = LabelSchema.safeParse(invalidLabel);
        assert.ok(!result.success, 'Label over 100 chars should fail validation');
    });

    test('DependencySchema: Valid dependency passes', () => {
        const validDep = {
            issueId: '550e8400-e29b-41d4-a716-446655440000',
            dependsOnId: '550e8400-e29b-41d4-a716-446655440001',
            type: 'blocks'
        };

        const result = DependencySchema.safeParse(validDep);
        assert.ok(result.success, 'Valid dependency should pass validation');
    });

    test('DependencySchema: Rejects invalid type', () => {
        const invalidDep = {
            issueId: '550e8400-e29b-41d4-a716-446655440000',
            dependsOnId: '550e8400-e29b-41d4-a716-446655440001',
            type: 'invalid-type'
        };

        const result = DependencySchema.safeParse(invalidDep);
        assert.ok(!result.success, 'Invalid dependency type should fail validation');
    });
});
