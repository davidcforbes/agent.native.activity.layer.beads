# Performance Benchmark Report

**Database:** test-db-50k.db
**Size:** 30.62 MB
**Date:** 2026-01-08T02:13:00.200Z
**Node Version:** v24.12.0

## sql.js Adapter

| Operation | Duration | Items | Memory (Heap) | Memory Delta |
|-----------|----------|-------|---------------|--------------|
| Database Load | 25.52 ms | - | 4.55 MB | +0.36 MB |
| Initial Board Query (All Issues) | 550.33 ms | 50000 | 78.70 MB | +74.33 MB |
| Column Query (Ready, limit 100) | 28.98 ms | 100 | 63.71 MB | +2.60 MB |
| Pagination Query (offset 100, limit 50) | 28.54 ms | 50 | 63.26 MB | +2.03 MB |
| Batch Labels Query (100 issues) | 0.91 ms | 110 | 61.49 MB | +0.19 MB |
| Batch Dependencies Query (100 issues) | 0.48 ms | 0 | 61.43 MB | +0.09 MB |
| Batch Comments Query (100 issues) | 0.72 ms | 90 | 61.57 MB | +0.24 MB |
| Column Count Queries | 47.15 ms | {"ready":12786,"in_progress":12500,"blocked":4812,"closed":17500} | 65.24 MB | +3.89 MB |
| Database Save (export to buffer) | 7.94 ms | - | 61.40 MB | +0.04 MB |

## bd CLI / Daemon Adapter

| Operation | Duration | Items | Memory (Heap) | Memory Delta |
|-----------|----------|-------|---------------|--------------|\n| bd list --json (all issues) | 198.09 ms | 6 | 5.27 MB | +0.20 MB |
| bd list --json --limit=100 | 189.30 ms | 6 | 5.27 MB | +0.19 MB |
| bd show --json <issue-id> | 422.82 ms | - | 5.55 MB | +0.46 MB |

## Performance Targets (10K database)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| _(Run with 10K database for target comparison)_ | - | - | - |
