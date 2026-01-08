#!/usr/bin/env node

/**
 * Test Database Generation Script
 *
 * Generates .beads SQLite databases with realistic test data for performance testing.
 *
 * Usage:
 *   node scripts/generate-test-db.js [count] [output]
 *
 * Examples:
 *   node scripts/generate-test-db.js 1000
 *   node scripts/generate-test-db.js 10000 test-db-10k.db
 *   node scripts/generate-test-db.js 50000 test-db-50k.db
 *
 * Distribution (default):
 *   - 30% ready (open, no blockers)
 *   - 25% in_progress
 *   - 10% blocked
 *   - 35% closed
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Configuration
const DEFAULT_COUNT = 1000;
const PREFIX = 'test';

// Distribution percentages (should sum to ~100)
const DISTRIBUTION = {
  ready: 0.30,       // 30% ready (open, no blockers)
  in_progress: 0.25, // 25% in progress
  blocked: 0.10,     // 10% blocked
  closed: 0.35       // 35% closed
};

// Sample data for realistic content
const ISSUE_TYPES = ['task', 'bug', 'feature', 'epic', 'chore'];
const PRIORITIES = [0, 1, 2, 2, 2, 3, 3, 4]; // Weighted toward P2
const ASSIGNEES = ['alice', 'bob', 'charlie', 'diana', null, null]; // Some unassigned
const LABELS = ['frontend', 'backend', 'database', 'ui', 'api', 'testing', 'docs', 'performance'];

const TITLE_PREFIXES = [
  'Implement', 'Fix', 'Add', 'Update', 'Refactor', 'Remove', 'Optimize',
  'Debug', 'Test', 'Document', 'Design', 'Review', 'Investigate'
];

const TITLE_SUBJECTS = [
  'user authentication', 'database queries', 'API endpoint', 'UI component',
  'error handling', 'data validation', 'caching layer', 'logging system',
  'notification service', 'search functionality', 'file upload', 'export feature',
  'dashboard widget', 'settings page', 'admin panel', 'reporting module'
];

const DESCRIPTIONS = [
  'This task requires careful attention to edge cases and error handling.',
  'Need to ensure backward compatibility with existing integrations.',
  'Should follow the established patterns in the codebase.',
  'Consider performance implications for large datasets.',
  'Will require coordination with the infrastructure team.',
  'Must be completed before the next release cycle.',
  'Blocked pending design review and approval.',
  'High priority - critical for customer satisfaction.'
];

// Helper functions
function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateIssueId(index) {
  return `${PREFIX}-${index.toString().padStart(6, '0')}`;
}

function generateTitle() {
  return `${randomChoice(TITLE_PREFIXES)} ${randomChoice(TITLE_SUBJECTS)}`;
}

function generateDescription() {
  const lines = randomInt(1, 3);
  return Array(lines).fill(0).map(() => randomChoice(DESCRIPTIONS)).join('\n\n');
}

function createSchema(db) {
  console.log('Creating database schema...');

  db.exec(`
    CREATE TABLE issues (
      id TEXT PRIMARY KEY,
      content_hash TEXT,
      title TEXT NOT NULL CHECK(length(title) <= 500),
      description TEXT NOT NULL DEFAULT '',
      design TEXT NOT NULL DEFAULT '',
      acceptance_criteria TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      priority INTEGER NOT NULL DEFAULT 2 CHECK(priority >= 0 AND priority <= 4),
      issue_type TEXT NOT NULL DEFAULT 'task',
      assignee TEXT,
      estimated_minutes INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT DEFAULT '',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      closed_by_session TEXT DEFAULT '',
      external_ref TEXT,
      compaction_level INTEGER DEFAULT 0,
      compacted_at DATETIME,
      compacted_at_commit TEXT,
      original_size INTEGER,
      deleted_at DATETIME,
      deleted_by TEXT DEFAULT '',
      delete_reason TEXT DEFAULT '',
      original_type TEXT DEFAULT '',
      sender TEXT DEFAULT '',
      ephemeral INTEGER DEFAULT 0,
      pinned INTEGER DEFAULT 0,
      is_template INTEGER DEFAULT 0,
      mol_type TEXT DEFAULT '',
      event_kind TEXT DEFAULT '',
      actor TEXT DEFAULT '',
      target TEXT DEFAULT '',
      payload TEXT DEFAULT '',
      source_repo TEXT DEFAULT '.',
      close_reason TEXT DEFAULT '',
      await_type TEXT,
      await_id TEXT,
      timeout_ns INTEGER,
      waiters TEXT,
      hook_bead TEXT DEFAULT '',
      role_bead TEXT DEFAULT '',
      agent_state TEXT DEFAULT '',
      last_activity DATETIME,
      role_type TEXT DEFAULT '',
      rig TEXT DEFAULT '',
      due_at DATETIME,
      defer_until DATETIME,
      CHECK (
        (status = 'closed' AND closed_at IS NOT NULL) OR
        (status = 'tombstone') OR
        (status NOT IN ('closed', 'tombstone') AND closed_at IS NULL)
      )
    );

    CREATE INDEX idx_issues_status ON issues(status);
    CREATE INDEX idx_issues_priority ON issues(priority);
    CREATE INDEX idx_issues_assignee ON issues(assignee);
    CREATE INDEX idx_issues_created_at ON issues(created_at);
    CREATE INDEX idx_issues_updated_at ON issues(updated_at);
    CREATE INDEX idx_issues_status_priority ON issues(status, priority);

    CREATE TABLE IF NOT EXISTS dependencies (
      issue_id TEXT NOT NULL,
      depends_on_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'blocks',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT NOT NULL,
      metadata TEXT,
      thread_id TEXT,
      PRIMARY KEY (issue_id, depends_on_id, type),
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_dependencies_issue_id ON dependencies(issue_id);
    CREATE INDEX idx_dependencies_depends_on ON dependencies(depends_on_id);
    CREATE INDEX idx_dependencies_type ON dependencies(type);

    CREATE TABLE labels (
      issue_id TEXT NOT NULL,
      label TEXT NOT NULL,
      PRIMARY KEY (issue_id, label),
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_labels_label ON labels(label);

    CREATE TABLE comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id TEXT NOT NULL,
      author TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_comments_issue ON comments(issue_id);

    -- Views for ready and blocked issues
    CREATE VIEW ready_issues AS
    SELECT i.id
    FROM issues i
    WHERE i.status = 'open'
      AND i.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM dependencies d
        JOIN issues dep ON d.depends_on_id = dep.id
        WHERE d.issue_id = i.id
          AND d.type = 'blocks'
          AND dep.status != 'closed'
          AND dep.deleted_at IS NULL
      );

    CREATE VIEW blocked_issues AS
    SELECT i.id,
      COUNT(d.depends_on_id) AS blocked_by_count
    FROM issues i
    JOIN dependencies d ON i.id = d.issue_id
    JOIN issues dep ON d.depends_on_id = dep.id
    WHERE d.type = 'blocks'
      AND dep.status != 'closed'
      AND dep.deleted_at IS NULL
      AND i.deleted_at IS NULL
    GROUP BY i.id;
  `);
}

function generateIssues(db, count) {
  console.log(`Generating ${count} issues...`);

  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Calculate counts for each status
  const counts = {
    ready: Math.floor(count * DISTRIBUTION.ready),
    in_progress: Math.floor(count * DISTRIBUTION.in_progress),
    blocked: Math.floor(count * DISTRIBUTION.blocked),
    closed: 0
  };
  counts.closed = count - counts.ready - counts.in_progress - counts.blocked;

  const insert = db.prepare(`
    INSERT INTO issues (
      id, title, description, status, priority, issue_type, assignee,
      estimated_minutes, created_at, updated_at, closed_at, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((issues) => {
    for (const issue of issues) {
      insert.run(
        issue.id,
        issue.title,
        issue.description,
        issue.status,
        issue.priority,
        issue.type,
        issue.assignee,
        issue.estimatedMinutes,
        issue.createdAt,
        issue.updatedAt,
        issue.closedAt,
        issue.createdBy
      );
    }
  });

  const issues = [];
  let currentIndex = 0;

  // Generate issues for each status category
  for (const [category, categoryCount] of Object.entries(counts)) {
    for (let i = 0; i < categoryCount; i++) {
      currentIndex++;
      const id = generateIssueId(currentIndex);
      const createdAt = randomDate(oneYearAgo, now).toISOString();
      const updatedAt = randomDate(new Date(createdAt), now).toISOString();

      let status = category === 'ready' ? 'open' : category;
      let closedAt = null;

      if (status === 'closed') {
        closedAt = randomDate(new Date(createdAt), now).toISOString();
      }

      issues.push({
        id,
        title: generateTitle(),
        description: generateDescription(),
        status,
        priority: randomChoice(PRIORITIES),
        type: randomChoice(ISSUE_TYPES),
        assignee: randomChoice(ASSIGNEES),
        estimatedMinutes: randomInt(1, 10) * 30, // 30min to 5hr
        createdAt,
        updatedAt,
        closedAt,
        createdBy: 'test-generator'
      });

      if (currentIndex % 1000 === 0) {
        process.stdout.write(`\r  Progress: ${currentIndex}/${count} issues`);
      }
    }
  }

  console.log('');
  insertMany(issues);
  console.log(`✓ Generated ${issues.length} issues`);

  return issues;
}

function generateLabels(db, issues) {
  console.log('Generating labels...');

  const insert = db.prepare('INSERT INTO labels (issue_id, label) VALUES (?, ?)');
  const insertMany = db.transaction((labels) => {
    for (const label of labels) {
      insert.run(label.issueId, label.label);
    }
  });

  const labels = [];

  // Add labels to ~60% of issues
  for (const issue of issues) {
    if (Math.random() < 0.6) {
      const labelCount = randomInt(1, 3);
      const selectedLabels = new Set();

      for (let i = 0; i < labelCount; i++) {
        selectedLabels.add(randomChoice(LABELS));
      }

      for (const label of selectedLabels) {
        labels.push({ issueId: issue.id, label });
      }
    }
  }

  insertMany(labels);
  console.log(`✓ Generated ${labels.length} labels`);
}

function generateDependencies(db, issues) {
  console.log('Generating dependencies...');

  const insert = db.prepare(`
    INSERT INTO dependencies (issue_id, depends_on_id, type, created_by)
    VALUES (?, ?, ?, ?)
  `);
  const insertMany = db.transaction((deps) => {
    for (const dep of deps) {
      insert.run(dep.issueId, dep.dependsOnId, dep.type, dep.createdBy);
    }
  });

  const dependencies = [];
  const openIssues = issues.filter(i => i.status !== 'closed');

  // Add blocking dependencies to ~15% of open issues
  for (const issue of openIssues) {
    if (Math.random() < 0.15 && openIssues.length > 1) {
      // Pick a different issue to depend on
      let blocker;
      do {
        blocker = randomChoice(openIssues);
      } while (blocker.id === issue.id);

      dependencies.push({
        issueId: issue.id,
        dependsOnId: blocker.id,
        type: 'blocks',
        createdBy: 'test-generator'
      });
    }
  }

  insertMany(dependencies);
  console.log(`✓ Generated ${dependencies.length} dependencies`);
}

function generateComments(db, issues) {
  console.log('Generating comments...');

  const insert = db.prepare(`
    INSERT INTO comments (issue_id, author, text, created_at)
    VALUES (?, ?, ?, ?)
  `);
  const insertMany = db.transaction((comments) => {
    for (const comment of comments) {
      insert.run(comment.issueId, comment.author, comment.text, comment.createdAt);
    }
  });

  const commentTexts = [
    'I can take a look at this tomorrow.',
    'This is blocking our release.',
    'We should consider a different approach here.',
    'Great work on this!',
    'Can we break this down into smaller tasks?',
    'I found a potential issue with the implementation.',
    'Updated the acceptance criteria based on feedback.',
    'Moved to next sprint due to dependencies.'
  ];

  const comments = [];

  // Add comments to ~30% of issues
  for (const issue of issues) {
    if (Math.random() < 0.3) {
      const commentCount = randomInt(1, 4);

      for (let i = 0; i < commentCount; i++) {
        comments.push({
          issueId: issue.id,
          author: randomChoice(ASSIGNEES.filter(a => a !== null)),
          text: randomChoice(commentTexts),
          createdAt: randomDate(new Date(issue.createdAt), new Date()).toISOString()
        });
      }
    }
  }

  insertMany(comments);
  console.log(`✓ Generated ${comments.length} comments`);
}

function generateStats(db) {
  console.log('\nDatabase Statistics:');

  const stats = db.prepare(`
    SELECT
      status,
      COUNT(*) as count,
      ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM issues), 1) as percentage
    FROM issues
    GROUP BY status
    ORDER BY count DESC
  `).all();

  for (const stat of stats) {
    console.log(`  ${stat.status}: ${stat.count} (${stat.percentage}%)`);
  }

  const readyCount = db.prepare('SELECT COUNT(*) as count FROM ready_issues').get();
  console.log(`  ready (computed): ${readyCount.count}`);

  const blockedCount = db.prepare('SELECT COUNT(*) as count FROM blocked_issues').get();
  console.log(`  blocked (computed): ${blockedCount.count}`);

  const labelCount = db.prepare('SELECT COUNT(*) as count FROM labels').get();
  console.log(`\n  Total labels: ${labelCount.count}`);

  const depCount = db.prepare('SELECT COUNT(*) as count FROM dependencies').get();
  console.log(`  Total dependencies: ${depCount.count}`);

  const commentCount = db.prepare('SELECT COUNT(*) as count FROM comments').get();
  console.log(`  Total comments: ${commentCount.count}`);
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const count = parseInt(args[0]) || DEFAULT_COUNT;
  const outputName = args[1] || `test-db-${count}.db`;
  const outputPath = path.join(__dirname, '..', 'test-databases', outputName);

  console.log('='.repeat(80));
  console.log(`Test Database Generator`);
  console.log('='.repeat(80));
  console.log(`Count: ${count} issues`);
  console.log(`Output: ${outputPath}\n`);

  // Create test-databases directory if it doesn't exist
  const testDbDir = path.join(__dirname, '..', 'test-databases');
  if (!fs.existsSync(testDbDir)) {
    fs.mkdirSync(testDbDir);
  }

  // Remove existing database
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  const startTime = Date.now();

  // Create database and populate
  const db = new Database(outputPath);

  try {
    createSchema(db);
    const issues = generateIssues(db, count);
    generateLabels(db, issues);
    generateDependencies(db, issues);
    generateComments(db, issues);
    generateStats(db);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const dbSize = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);

    console.log('\n' + '='.repeat(80));
    console.log(`✓ Database created successfully`);
    console.log(`  Time: ${elapsed}s`);
    console.log(`  Size: ${dbSize} MB`);
    console.log(`  Path: ${outputPath}`);
    console.log('='.repeat(80));
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main();
}
