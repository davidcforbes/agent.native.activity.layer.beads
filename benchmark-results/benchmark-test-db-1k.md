# Performance Benchmark Report

**Database:** test-db-1k.db
**Size:** 0.69 MB
**Date:** 2026-01-08T02:12:33.262Z
**Node Version:** v24.12.0

## sql.js Adapter

| Operation | Duration | Items | Memory (Heap) | Memory Delta |
|-----------|----------|-------|---------------|--------------|
| Database Load | 13.59 ms | - | 4.55 MB | +0.12 MB |
| Initial Board Query (All Issues) | 40.18 ms | 1000 | 6.79 MB | +2.42 MB |
| Column Query (Ready, limit 100) | 3.50 ms | 100 | 7.04 MB | +1.41 MB |
| Pagination Query (offset 100, limit 50) | 2.24 ms | 50 | 6.48 MB | +0.72 MB |
| Batch Labels Query (100 issues) | 0.87 ms | 104 | 6.02 MB | +0.19 MB |
| Batch Dependencies Query (100 issues) | 0.46 ms | 0 | 5.88 MB | +0.01 MB |
| Batch Comments Query (100 issues) | 0.57 ms | 81 | 6.08 MB | +0.21 MB |
| Column Count Queries | 1.34 ms | {"ready":257,"in_progress":250,"blocked":105,"closed":350} | 5.92 MB | +0.03 MB |
| Database Save (export to buffer) | 1.01 ms | - | 5.93 MB | +0.03 MB |

## bd CLI / Daemon Adapter

| Operation | Duration | Items | Memory (Heap) | Memory Delta |
|-----------|----------|-------|---------------|--------------|\n| bd list --json (all issues) | 207.16 ms | 6 | 4.90 MB | +0.20 MB |
| bd list --json --limit=100 | 201.40 ms | 6 | 4.91 MB | +0.19 MB |
| bd show --json <issue-id> | 398.99 ms | - | 5.26 MB | +0.53 MB |

## Performance Targets (10K database)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| _(Run with 10K database for target comparison)_ | - | - | - |
