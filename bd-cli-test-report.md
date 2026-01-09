# BD CLI Test Report

**Generated:** 2026-01-09T20:37:42.557Z

**BD Version:** `bd version 0.46.0 (dev: main@2d45b8316993)`

## Summary

- ✓ Passed: 25
- ✗ Failed: 2
- ⚠ Warnings: 0
- Total: 27

## Issues Found

### Critical Failures

#### Create issue with all fields

- **Status:** ✗ Failed
- **Message:** Command failed with status 1

#### Update external_ref

- **Status:** ✗ Failed
- **Message:** No-daemon mode failed to update external_ref

## Detailed Test Results

1. ✓ **Create basic issue**
2. ✗ **Create issue with all fields**
3. ✓ **Create issue with various datetime formats**
4. ✓ **Update title**
5. ✓ **Update description**
6. ✓ **Update priority**
7. ✓ **Update issue_type**
8. ✓ **Update assignee**
9. ✓ **Update estimated_minutes**
10. ✓ **Update due_at**
11. ✓ **Update defer_until**
12. ✗ **Update external_ref**
13. ✓ **Update acceptance_criteria**
14. ✓ **Update design**
15. ✓ **Update notes**
16. ✓ **Update status**
17. ✓ **DateTime format: Date only (YYYY-MM-DD)**
18. ✓ **DateTime format: DateTime without timezone**
19. ✓ **DateTime format: ISO 8601 with milliseconds and Z**
20. ✓ **DateTime format: ISO 8601 with timezone offset**
21. ✓ **DateTime format: Relative: +1 day**
22. ✓ **DateTime format: Relative: +6 hours**
23. ✓ **DateTime format: Relative: +2 weeks**
24. ✓ **DateTime format: Natural language: tomorrow**
25. ✓ **DateTime format: Natural language: next monday**
26. ✓ **Add dependency**
27. ✓ **Add label**

## Recommendations

