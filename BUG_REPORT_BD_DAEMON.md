# BD CLI Daemon Bug Report

**Issue:** bd daemon silently ignores `--due` and `--defer` flags in update commands

**Environment:**
- BD Version: 0.45.0 (dev: main@b7358f17bfb1)
- Platform: Windows (also reproducible on other platforms)
- Context: VS Code extension using bd daemon for issue management

---

## Summary

When using the bd daemon, the `--due` and `--defer` flags in `bd update` commands are silently ignored. The command reports success, but the database fields remain unchanged. This bug does NOT occur when using `--no-daemon` flag.

---

## Reproduction Steps

### Setup
```bash
# Start bd daemon
bd daemon start

# Create a test issue
bd create --title "Test Due Date" --type task
# Note the issue ID (e.g., project-abc)
```

### Test Case 1: Update with daemon (FAILS)
```bash
# Update due date using daemon
bd update project-abc --due "2026-01-25"

# Verify the value
bd show project-abc --json | grep due_at
# Result: "due_at": null   ← Field NOT updated
```

### Test Case 2: Update without daemon (WORKS)
```bash
# Update due date bypassing daemon
bd update project-abc --due "2026-01-25" --no-daemon

# Verify the value
bd show project-abc --json | grep due_at
# Result: "due_at": "2026-01-25T00:00:00-08:00"   ← Field updated correctly
```

---

## Expected Behavior

The `bd update --due` command should update the `due_at` field regardless of whether the daemon is running or bypassed.

---

## Actual Behavior

- **With daemon**: Command succeeds but `due_at` field remains `null` or unchanged
- **Without daemon** (`--no-daemon`): Command works correctly and updates the field

---

## Affected Fields

Our testing identified the following fields are affected:

| Field | Flag | Daemon Works? | No-Daemon Works? |
|-------|------|---------------|------------------|
| `due_at` | `--due` | ✗ No | ✓ Yes |
| `defer_until` | `--defer` | ✗ No | ✓ Yes |

All other fields tested work correctly in both modes:
- `--title`, `--description`, `--priority`, `--type`, `--assignee`, `--estimate`, `--external-ref`, `--acceptance`, `--design`, `--notes`, `--status`

---

## Test Results

We created a comprehensive test suite that validates all bd CLI operations. Full test report available, but key findings:

**Summary:**
- ✓ Passed: 16 tests
- ✗ Failed: 11 tests
- ⚠ Warnings: 2 daemon vs no-daemon discrepancies
- Total: 27 tests

**Daemon Mode Issues:**
```
⚠ Update due_at
  With daemon: undefined
  Without daemon: "2026-01-20T00:00:00-08:00"

⚠ Update defer_until
  With daemon: undefined
  Without daemon: "2026-01-18T00:00:00-08:00"
```

---

## Impact

**Severity: Medium-High**

This bug affects any application or workflow that:
1. Uses the bd daemon for performance
2. Needs to set or update due dates or defer dates
3. Expects silent failures to be reported

**Real-world Impact:**
- Our VS Code Kanban extension failed to save user-selected due dates
- No error message displayed to user - data silently lost
- User experience: "I set a due date, clicked save, it looked successful, but when I reopened the issue the date was gone"

---

## Workaround

Add `--no-daemon` flag to all update commands that modify `due_at` or `defer_until`:

```bash
bd update <id> --due "2026-01-25" --no-daemon
bd update <id> --defer "2026-01-10" --no-daemon
```

**Implementation in code:**
```typescript
// Force no-daemon for updates to work around daemon bug
const args = ['update', id, '--no-daemon'];
if (dueDate) args.push('--due', dueDate);
```

---

## Additional DateTime Format Issues

While testing, we also discovered that `bd create` has strict datetime format validation:

**Formats that work:**
- `2026-01-15` (date only)
- `2026-01-15T10:00:00Z` (ISO 8601 with Z)
- `2026-01-15T10:30:00-08:00` (ISO 8601 with timezone)

**Formats that fail (despite being listed in `--help`):**
- `2026-01-15T10:30:00` (no timezone)
- `+1d`, `+6h`, `+2w` (relative time)
- `tomorrow`, `next monday` (natural language)

Error message: `invalid due_at format "tomorrow". Examples: 2025-01-15, 2025-01-15T10:00:00Z`

**Note:** The `--help` text for `--due` says these formats are supported:
```
--due string  Due date/time. Formats: +6h, +1d, +2w, tomorrow, next monday, 2025-01-15
```

This discrepancy between documentation and actual behavior should also be addressed.

---

## Suggested Fix

The daemon should properly handle all flags passed to update commands. Possible causes:
1. Daemon request/response parser dropping certain fields
2. Daemon using cached/incomplete update schema
3. Serialization issue between CLI → daemon → database

---

## Test Code

Full test suite available at: `scripts/test-bd-cli.js`

To reproduce all issues:
```bash
npm run test:bd-cli
```

This generates a detailed report in `bd-cli-test-report.md`.

---

## Related Issues

- Issue with `bd create` datetime format validation (documented above)
- Possible issue with `bd dep add --json` not returning JSON (reported in test output)

---

**Contact:** Agent Native Abstraction Layer team
**Repository:** https://github.com/sebcook-ctrl/agent.native.activity.layer.beads
