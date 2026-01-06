# GitHub Issue for steveyegge/beads

**Title:** SQLite WAL mode fails on WSL2 when database is on Windows filesystem (/mnt/c/)

**URL to create:** https://github.com/steveyegge/beads/issues/new

---

## Problem Description

When using `bd` from WSL2 on a project located on a Windows filesystem (e.g., `/mnt/c/Development/...`), SQLite WAL mode fails with locking/I/O errors. This makes it impossible to use both Windows-native `bd.exe` and WSL `bd` on the same project.

## Error Messages

```
sqlite3: disk I/O error: truncate /mnt/c/.../beads.db-shm: invalid argument
```

```
Error: failed to open database: failed to enable WAL mode: sqlite3: locking protocol
```

From `bd doctor`:
```
✖  Database Unable to read database version
   └─ Storage: SQLite
   └─ sqlite3: disk I/O error: truncate /mnt/c/.../.beads/beads.db-shm: invalid argument
✖  Database Integrity Failed to run integrity check
```

## Environment

- **OS:** Windows 11 with WSL2 (Ubuntu)
- **bd version:** 0.44.0 (both Windows and WSL builds)
- **Project location:** `/mnt/c/Development/project/` (Windows filesystem accessed via WSL2)
- **VS Code:** Running natively on Windows with extensions accessing the database

## Root Cause

SQLite's WAL mode requires shared memory operations via the `-shm` file. According to [SQLite WAL documentation](https://www.sqlite.org/wal.html):

> "All processes using a database must be on the same host computer; WAL does not work over a network filesystem. This is because WAL requires all processes to share a small amount of memory."

WSL2's `/mnt/c/` filesystem uses the **9P protocol** (DrvFS) to access Windows files. From SQLite's perspective, this behaves like a network filesystem:
- Shared memory operations (`mmap`) don't work correctly across the WSL/Windows boundary
- POSIX file locking semantics are not fully supported
- The `-shm` file cannot be properly truncated or locked

## Reproduction Steps

1. Create a beads project on Windows filesystem: `C:\Development\myproject`
2. From Windows CMD/PowerShell, run: `bd.exe init` (works fine)
3. From WSL2, navigate to `/mnt/c/Development/myproject`
4. Run: `bd list` or any bd command
5. **Result:** Locking protocol error

## Use Case: Mixed Windows/WSL Agent Environment

This is a common development scenario:

| Component | Platform | Status |
|-----------|----------|--------|
| VS Code | Windows native | ✅ Works |
| Planet57 Beads extension | Windows native | ✅ Works (with Windows daemon) |
| bd.exe daemon | Windows native | ✅ Works |
| Claude Code (via WSL) | WSL2 | ❌ Fails |
| Other CLI agents (WSL) | WSL2 | ❌ Fails |

Many developers use:
- VS Code running natively on Windows
- CLI tools and agents running in WSL2
- Projects stored on the Windows filesystem for Windows tool compatibility

## Workarounds (Current)

1. **Always use Windows `bd.exe`** - Works but breaks WSL-based agents
2. **Move project to WSL filesystem** (`~/Development/`) - Breaks Windows native tools
3. **Use `no-db: true` mode** - Uses JSONL only, but some integrations (like Planet57 extension) require SQLite

## Suggested Solutions

### Option 1: Auto-detect WSL + Windows filesystem and disable WAL

```go
// Pseudo-code
if isWSL() && isWindowsFilesystem(dbPath) {
    // Use DELETE or TRUNCATE journal mode instead of WAL
    db.Exec("PRAGMA journal_mode=DELETE")
}
```

Detection could check:
- `/proc/version` contains "Microsoft" or "WSL"
- Path starts with `/mnt/[a-z]/`

### Option 2: Add `--no-wal` flag or config option

```yaml
# .beads/config.yaml
journal-mode: delete  # or "wal" (default), "truncate", "memory"
```

### Option 3: Document the limitation

At minimum, add documentation warning users about this limitation and recommending:
- Use Windows `bd.exe` for projects on Windows filesystems
- Or move projects to native WSL filesystem for WSL usage

## Related SQLite Documentation

From https://www.sqlite.org/wal.html:
- WAL requires shared memory via `-shm` file
- Memory mapping (`mmap`) must work correctly
- All processes must be on the "same host" (which WSL2 technically isn't, from SQLite's perspective)

## Related Issues

- #536 - Locking between systems (Windows/Docker, similar but different root cause)
- #204 - disk I/O error during migrate (mentions `-shm` files)

## Additional Context

The config file already has a comment acknowledging this:
```yaml
# NOTE: Unix sockets don't work on Windows filesystems (/mnt/c/...) in WSL2
no-daemon: true
```

The same limitation applies to SQLite WAL mode, not just Unix sockets.
