#!/usr/bin/env node

/**
 * Performance Benchmarking Script
 *
 * Measures loading performance, memory usage, and query performance
 * for the beads Kanban board extension.
 *
 * Usage:
 *   node scripts/benchmark-loading.js [database-path]
 *
 * Examples:
 *   node scripts/benchmark-loading.js test-databases/test-db-1k.db
 *   node scripts/benchmark-loading.js test-databases/test-db-10k.db
 *   node scripts/benchmark-loading.js test-databases/test-db-50k.db
 */

const fs = require('fs');
const path = require('path');

// Performance measurement helpers
class Benchmark {
  constructor(name) {
    this.name = name;
    this.startTime = null;
    this.endTime = null;
    this.startMemory = null;
    this.endMemory = null;
  }

  start() {
    if (global.gc) {
      global.gc(); // Force GC if available (run with --expose-gc)
    }
    this.startMemory = process.memoryUsage();
    this.startTime = process.hrtime.bigint();
    return this;
  }

  end() {
    this.endTime = process.hrtime.bigint();
    this.endMemory = process.memoryUsage();
    return this;
  }

  get duration() {
    if (!this.startTime || !this.endTime) return 0;
    return Number(this.endTime - this.startTime) / 1_000_000; // Convert to ms
  }

  get memoryDelta() {
    if (!this.startMemory || !this.endMemory) return {};
    return {
      heapUsed: (this.endMemory.heapUsed - this.startMemory.heapUsed) / 1024 / 1024,
      external: (this.endMemory.external - this.startMemory.external) / 1024 / 1024,
      rss: (this.endMemory.rss - this.startMemory.rss) / 1024 / 1024
    };
  }

  get memoryTotal() {
    if (!this.endMemory) return {};
    return {
      heapUsed: this.endMemory.heapUsed / 1024 / 1024,
      heapTotal: this.endMemory.heapTotal / 1024 / 1024,
      external: this.endMemory.external / 1024 / 1024,
      rss: this.endMemory.rss / 1024 / 1024
    };
  }

  report() {
    const mem = this.memoryTotal;
    const delta = this.memoryDelta;
    return {
      name: this.name,
      duration: this.duration.toFixed(2) + ' ms',
      memoryTotal: {
        heapUsed: mem.heapUsed.toFixed(2) + ' MB',
        heapTotal: mem.heapTotal.toFixed(2) + ' MB',
        rss: mem.rss.toFixed(2) + ' MB'
      },
      memoryDelta: {
        heapUsed: (delta.heapUsed >= 0 ? '+' : '') + delta.heapUsed.toFixed(2) + ' MB',
        rss: (delta.rss >= 0 ? '+' : '') + delta.rss.toFixed(2) + ' MB'
      }
    };
  }
}

// Simulate the sql.js adapter loading process
async function benchmarkSqlJsAdapter(dbPath) {
  console.log('\n📊 Benchmarking sql.js Adapter');
  console.log('='.repeat(80));

  const results = {};

  // 1. Database Loading
  const loadBench = new Benchmark('Database Load').start();
  const initSql = require('sql.js');
  const SQL = await initSql();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);
  loadBench.end();
  results.databaseLoad = loadBench.report();

  // 2. Initial Board Query (all columns)
  const boardQueryBench = new Benchmark('Initial Board Query (All Issues)').start();
  const allIssues = db.exec(`
    SELECT i.*,
           CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END as is_ready,
           COALESCE(b.blocked_by_count, 0) as blocked_by_count
    FROM issues i
    LEFT JOIN ready_issues r ON i.id = r.id
    LEFT JOIN blocked_issues b ON i.id = b.id
    WHERE i.deleted_at IS NULL
    ORDER BY i.priority, i.created_at DESC
  `);
  const issueCount = allIssues[0]?.values.length || 0;
  boardQueryBench.end();
  results.allIssuesQuery = {
    ...boardQueryBench.report(),
    count: issueCount
  };

  // 3. Column-based Query (Ready column, limit 100)
  const readyQueryBench = new Benchmark('Column Query (Ready, limit 100)').start();
  const readyIssues = db.exec(`
    SELECT i.*,
           1 as is_ready,
           0 as blocked_by_count
    FROM issues i
    JOIN ready_issues r ON i.id = r.id
    WHERE i.deleted_at IS NULL
    ORDER BY i.priority, i.created_at DESC
    LIMIT 100
  `);
  readyQueryBench.end();
  results.readyColumnQuery = {
    ...readyQueryBench.report(),
    count: readyIssues[0]?.values.length || 0
  };

  // 4. Pagination Query (Load More - next 50)
  const paginationBench = new Benchmark('Pagination Query (offset 100, limit 50)').start();
  const paginatedIssues = db.exec(`
    SELECT i.*,
           1 as is_ready,
           0 as blocked_by_count
    FROM issues i
    JOIN ready_issues r ON i.id = r.id
    WHERE i.deleted_at IS NULL
    ORDER BY i.priority, i.created_at DESC
    LIMIT 50 OFFSET 100
  `);
  paginationBench.end();
  results.paginationQuery = {
    ...paginationBench.report(),
    count: paginatedIssues[0]?.values.length || 0
  };

  // 5. Labels Batch Query
  const labelsBench = new Benchmark('Batch Labels Query (100 issues)').start();
  const issueIds = (readyIssues[0]?.values || []).slice(0, 100).map(row => `'${row[0]}'`).join(',');
  if (issueIds) {
    const labels = db.exec(`
      SELECT issue_id, label
      FROM labels
      WHERE issue_id IN (${issueIds})
    `);
    labelsBench.end();
    results.labelsQuery = {
      ...labelsBench.report(),
      count: labels[0]?.values.length || 0
    };
  } else {
    labelsBench.end();
    results.labelsQuery = {
      ...labelsBench.report(),
      count: 0
    };
  }

  // 6. Dependencies Batch Query
  const depsBench = new Benchmark('Batch Dependencies Query (100 issues)').start();
  if (issueIds) {
    const deps = db.exec(`
      SELECT d.*, i.title
      FROM dependencies d
      LEFT JOIN issues i ON d.depends_on_id = i.id
      WHERE d.issue_id IN (${issueIds})
    `);
    depsBench.end();
    results.dependenciesQuery = {
      ...depsBench.report(),
      count: deps[0]?.values.length || 0
    };
  } else {
    depsBench.end();
    results.dependenciesQuery = {
      ...depsBench.report(),
      count: 0
    };
  }

  // 7. Comments Batch Query
  const commentsBench = new Benchmark('Batch Comments Query (100 issues)').start();
  if (issueIds) {
    const comments = db.exec(`
      SELECT issue_id, author, text, created_at
      FROM comments
      WHERE issue_id IN (${issueIds})
      ORDER BY created_at
    `);
    commentsBench.end();
    results.commentsQuery = {
      ...commentsBench.report(),
      count: comments[0]?.values.length || 0
    };
  } else {
    commentsBench.end();
    results.commentsQuery = {
      ...commentsBench.report(),
      count: 0
    };
  }

  // 8. Count Queries
  const countBench = new Benchmark('Column Count Queries').start();
  const readyCount = db.exec('SELECT COUNT(*) FROM ready_issues')[0].values[0][0];
  const inProgressCount = db.exec("SELECT COUNT(*) FROM issues WHERE status = 'in_progress' AND deleted_at IS NULL")[0].values[0][0];
  const blockedCount = db.exec('SELECT COUNT(*) FROM blocked_issues')[0].values[0][0];
  const closedCount = db.exec("SELECT COUNT(*) FROM issues WHERE status = 'closed' AND deleted_at IS NULL")[0].values[0][0];
  countBench.end();
  results.countQueries = {
    ...countBench.report(),
    counts: { ready: readyCount, in_progress: inProgressCount, blocked: blockedCount, closed: closedCount }
  };

  // 9. Database Save Simulation (write back to buffer)
  const saveBench = new Benchmark('Database Save (export to buffer)').start();
  const exportedBuffer = db.export();
  saveBench.end();
  results.databaseSave = {
    ...saveBench.report(),
    size: (exportedBuffer.length / 1024 / 1024).toFixed(2) + ' MB'
  };

  db.close();

  return results;
}

// Simulate daemon adapter (using bd CLI)
async function benchmarkDaemonAdapter(dbPath) {
  console.log('\n📊 Benchmarking bd CLI (Daemon Adapter Simulation)');
  console.log('='.repeat(80));

  const { execSync } = require('child_process');
  const results = {};

  // Note: This requires bd CLI to be installed and a daemon running
  // For simulation, we'll check if bd is available

  try {
    // Check if bd is available
    execSync('bd --version', { stdio: 'pipe' });
  } catch (error) {
    console.log('⚠️  bd CLI not available, skipping daemon adapter benchmarks');
    return null;
  }

  // 1. List all issues (simulates initial load without incremental loading)
  const listAllBench = new Benchmark('bd list --json (all issues)').start();
  try {
    const output = execSync('bd list --json --limit=0', {
      encoding: 'utf-8',
      stdio: 'pipe',
      maxBuffer: 50 * 1024 * 1024 // 50MB buffer
    });
    const issues = JSON.parse(output);
    listAllBench.end();
    results.listAll = {
      ...listAllBench.report(),
      count: issues.length
    };
  } catch (error) {
    listAllBench.end();
    results.listAll = {
      ...listAllBench.report(),
      error: error.message
    };
  }

  // 2. List with limit (simulates incremental loading)
  const listLimitedBench = new Benchmark('bd list --json --limit=100').start();
  try {
    const output = execSync('bd list --json --limit=100', {
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    const issues = JSON.parse(output);
    listLimitedBench.end();
    results.listLimited = {
      ...listLimitedBench.report(),
      count: issues.length
    };
  } catch (error) {
    listLimitedBench.end();
    results.listLimited = {
      ...listLimitedBench.report(),
      error: error.message
    };
  }

  // 3. Show details for one issue
  const showBench = new Benchmark('bd show --json <issue-id>').start();
  try {
    // Get first issue ID from ready list
    const readyOutput = execSync('bd ready --limit=1', { encoding: 'utf-8', stdio: 'pipe' });
    const match = readyOutput.match(/\[(.*?)\]/);
    if (match) {
      const issueId = match[1];
      execSync(`bd show --json ${issueId}`, { encoding: 'utf-8', stdio: 'pipe' });
    }
    showBench.end();
    results.show = showBench.report();
  } catch (error) {
    showBench.end();
    results.show = {
      ...showBench.report(),
      error: error.message
    };
  }

  return results;
}

// Print results in a formatted table
function printResults(adapterName, results) {
  console.log(`\n${adapterName} Results:`);
  console.log('-'.repeat(80));

  for (const [key, result] of Object.entries(results)) {
    console.log(`\n${result.name}:`);
    console.log(`  Duration: ${result.duration}`);
    if (result.count !== undefined) {
      console.log(`  Items: ${result.count}`);
    }
    if (result.counts) {
      console.log(`  Counts: ${JSON.stringify(result.counts)}`);
    }
    if (result.size) {
      console.log(`  Size: ${result.size}`);
    }
    if (result.memoryTotal) {
      console.log(`  Memory: ${result.memoryTotal.heapUsed} heap, ${result.memoryTotal.rss} RSS`);
      console.log(`  Delta: ${result.memoryDelta.heapUsed} heap, ${result.memoryDelta.rss} RSS`);
    }
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  }
}

// Generate markdown report
function generateMarkdownReport(dbPath, sqlJsResults, daemonResults) {
  const dbSize = (fs.statSync(dbPath).size / 1024 / 1024).toFixed(2);
  const dbName = path.basename(dbPath);

  let report = `# Performance Benchmark Report

**Database:** ${dbName}
**Size:** ${dbSize} MB
**Date:** ${new Date().toISOString()}
**Node Version:** ${process.version}

## sql.js Adapter

| Operation | Duration | Items | Memory (Heap) | Memory Delta |
|-----------|----------|-------|---------------|--------------|
`;

  for (const [key, result] of Object.entries(sqlJsResults)) {
    const items = result.count !== undefined ? result.count : (result.counts ? JSON.stringify(result.counts) : '-');
    const memory = result.memoryTotal ? result.memoryTotal.heapUsed : '-';
    const delta = result.memoryDelta ? result.memoryDelta.heapUsed : '-';
    report += `| ${result.name} | ${result.duration} | ${items} | ${memory} | ${delta} |\n`;
  }

  if (daemonResults) {
    report += `\n## bd CLI / Daemon Adapter\n\n`;
    report += `| Operation | Duration | Items | Memory (Heap) | Memory Delta |\n`;
    report += `|-----------|----------|-------|---------------|--------------|\\n`;

    for (const [key, result] of Object.entries(daemonResults)) {
      const items = result.count !== undefined ? result.count : '-';
      const memory = result.memoryTotal ? result.memoryTotal.heapUsed : '-';
      const delta = result.memoryDelta ? result.memoryDelta.heapUsed : '-';
      report += `| ${result.name} | ${result.duration} | ${items} | ${memory} | ${delta} |\n`;
    }
  }

  report += `\n## Performance Targets (10K database)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
`;

  if (dbName.includes('10k')) {
    const initialLoad = parseFloat(sqlJsResults.databaseLoad?.duration || '0');
    const loadMore = parseFloat(sqlJsResults.paginationQuery?.duration || '0');
    const memoryMB = parseFloat(sqlJsResults.databaseLoad?.memoryTotal?.heapUsed || '0');

    report += `| Initial Load Time | < 3000 ms | ${initialLoad.toFixed(2)} ms | ${initialLoad < 3000 ? '✅' : '❌'} |\n`;
    report += `| Load More Time | < 500 ms | ${loadMore.toFixed(2)} ms | ${loadMore < 500 ? '✅' : '❌'} |\n`;
    report += `| Memory Usage | < 200 MB | ${memoryMB.toFixed(2)} MB | ${memoryMB < 200 ? '✅' : '❌'} |\n`;
  } else {
    report += `| _(Run with 10K database for target comparison)_ | - | - | - |\n`;
  }

  return report;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const dbPath = args[0] || 'test-databases/test-db-10k.db';

  if (!fs.existsSync(dbPath)) {
    console.error(`Error: Database not found at ${dbPath}`);
    console.error('Generate test databases first: node scripts/generate-test-db.js');
    process.exit(1);
  }

  const dbSize = (fs.statSync(dbPath).size / 1024 / 1024).toFixed(2);

  console.log('='.repeat(80));
  console.log('Performance Benchmark');
  console.log('='.repeat(80));
  console.log(`Database: ${dbPath}`);
  console.log(`Size: ${dbSize} MB`);
  console.log(`Node: ${process.version}`);
  console.log('='.repeat(80));

  if (global.gc) {
    console.log('✓ Running with --expose-gc (accurate memory measurements)');
  } else {
    console.log('⚠️  Run with --expose-gc for accurate memory measurements');
    console.log('   Example: node --expose-gc scripts/benchmark-loading.js');
  }

  // Run benchmarks
  const sqlJsResults = await benchmarkSqlJsAdapter(dbPath);
  printResults('sql.js Adapter', sqlJsResults);

  const daemonResults = await benchmarkDaemonAdapter(dbPath);
  if (daemonResults) {
    printResults('bd CLI / Daemon Adapter', daemonResults);
  }

  // Generate markdown report
  const report = generateMarkdownReport(dbPath, sqlJsResults, daemonResults);
  const reportPath = path.join(__dirname, '..', 'benchmark-results', `benchmark-${path.basename(dbPath, '.db')}.md`);

  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir);
  }

  fs.writeFileSync(reportPath, report);

  console.log('\n' + '='.repeat(80));
  console.log(`✓ Benchmark complete`);
  console.log(`  Report: ${reportPath}`);
  console.log('='.repeat(80));
}

if (require.main === module) {
  main().catch(error => {
    console.error('Benchmark failed:', error);
    process.exit(1);
  });
}
