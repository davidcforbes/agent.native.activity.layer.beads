# Performance Benchmark Report

**Database:** test-db-10k.db
**Size:** 6.16 MB
**Date:** 2026-01-08T02:12:46.594Z
**Node Version:** v24.12.0

## sql.js Adapter

| Operation | Duration | Items | Memory (Heap) | Memory Delta |
|-----------|----------|-------|---------------|--------------|
| Database Load | 14.76 ms | - | 4.55 MB | +0.19 MB |
| Initial Board Query (All Issues) | 135.72 ms | 10000 | 22.95 MB | +18.58 MB |
| Column Query (Ready, limit 100) | 7.14 ms | 100 | 17.27 MB | +1.48 MB |
| Pagination Query (offset 100, limit 50) | 5.67 ms | 50 | 16.63 MB | +0.72 MB |
| Batch Labels Query (100 issues) | 0.80 ms | 96 | 16.39 MB | +0.41 MB |
| Batch Dependencies Query (100 issues) | 0.42 ms | 0 | 16.03 MB | +0.01 MB |
| Batch Comments Query (100 issues) | 0.60 ms | 78 | 16.23 MB | +0.21 MB |
| Column Count Queries | 7.42 ms | {"ready":2526,"in_progress":2500,"blocked":966,"closed":3500} | 16.20 MB | +0.16 MB |
| Database Save (export to buffer) | 2.20 ms | - | 16.08 MB | +0.03 MB |

## bd CLI / Daemon Adapter

| Operation | Duration | Items | Memory (Heap) | Memory Delta |
|-----------|----------|-------|---------------|--------------|\n| bd list --json (all issues) | 192.11 ms | 6 | 4.92 MB | +0.20 MB |
| bd list --json --limit=100 | 189.02 ms | 6 | 4.93 MB | +0.19 MB |
| bd show --json <issue-id> | 373.55 ms | - | 5.38 MB | +0.62 MB |

## Performance Targets (10K database)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Initial Load Time | < 3000 ms | 14.76 ms | ✅ |
| Load More Time | < 500 ms | 5.67 ms | ✅ |
| Memory Usage | < 200 MB | 4.55 MB | ✅ |
