# Architecture Proposal: Fast Loading with Minimal Fields

**Status**: Draft for Review
**Author**: Claude (Sonnet 4.5)
**Date**: 2026-01-08
**Problem**: 5-second page loads for Kanban/Table views with 400+ issues

---

## Executive Summary

Replace the current "load everything" approach with a **3-tier progressive loading architecture**:

1. **Tier 1 (Minimal)**: Load core fields from `bd list` in 100-300ms
2. **Tier 2 (Enriched)**: Optionally load additional fields in background
3. **Tier 3 (Full)**: Load complete details only when editing

**Expected Performance**:
- Current: 5 seconds for 400 issues
- Proposed: **0.3 seconds** for initial render (16x faster)
- Filters/sorts: **Instant** (in-memory, no server round-trips)

---

## Current Architecture Problems

### Problem 1: Over-fetching Data

**Current behavior** (for 400 closed issues):
```
1. bd list --status=closed --limit=400          → 100ms   ✅ Fast!
2. Split into 8 batches of 50 IDs
3. For each batch: bd show --json <50 IDs>      → 500ms each
   - Batch 1: 500ms
   - Batch 2: 500ms
   - Batch 3: 500ms
   - ... (8 batches total)

Total: 100ms + (8 × 500ms) = 4,100ms ⏱️
```

**Why so slow?**
- `bd show` fetches 40+ fields per issue (labels, comments, relationships, all text fields)
- Only ~8 fields are displayed on Kanban cards
- **Waste**: 80% of fetched data is never rendered

### Problem 2: Sequential Processing

Batches are processed sequentially (`await` in loop):
```typescript
for (let i = 0; i < issueIds.length; i += BATCH_SIZE) {
  await this.execBd(['show', '--json', ...batch]);  // ⏳ Sequential
}
```

### Problem 3: No Client-Side State

Every filter, search, or sort triggers:
```
User types in search → Message to Extension → Query database → Message back → Re-render
```

This adds 100-500ms latency per interaction.

### Problem 4: Redundant Queries

Opening the same Kanban board multiple times re-fetches all data, even if nothing changed.

---

## Proposed Architecture: 3-Tier Progressive Loading

### High-Level Vision

```
┌─────────────────────────────────────────────────────────┐
│ TIER 1: Minimal Load (100-300ms)                       │
│ ─────────────────────────────────────────────────────── │
│ • Single bd list --all --json --limit 10000             │
│ • Returns core fields: id, title, priority, status,    │
│   type, dates, dependency counts                        │
│ • Store ALL issues in webview memory (Map<id, card>)   │
│ • Render visible columns (in-memory slice)             │
│ • Enable instant filters/sorts/searches                 │
└─────────────────────────────────────────────────────────┘
           ↓ (Optional, background)
┌─────────────────────────────────────────────────────────┐
│ TIER 2: Enrichment (Progressive Enhancement)           │
│ ─────────────────────────────────────────────────────── │
│ • After render, optionally load:                       │
│   - Labels (for visible cards only)                    │
│   - Assignees (batch query)                            │
│   - Relationship details (if needed for badges)        │
│ • Update cards incrementally without blocking UI       │
└─────────────────────────────────────────────────────────┘
           ↓ (On user action)
┌─────────────────────────────────────────────────────────┐
│ TIER 3: Full Details (On-Demand, 50ms)                 │
│ ─────────────────────────────────────────────────────── │
│ • User clicks Edit or opens detail dialog              │
│ • Single bd show --json <id>                           │
│ • Load all 40+ fields, comments, relationships         │
│ • Cache in webview for session                         │
└─────────────────────────────────────────────────────────┘
```

---

## Data Model Changes

### Current: BoardCard Interface (40+ fields)

```typescript
export interface BoardCard {
  // Core fields (8) - NEEDED for cards
  id: string;
  title: string;
  priority: number;
  status: string;
  issue_type: string;
  created_at: string;
  updated_at: string;

  // Display enhancement fields (7) - NICE to have
  assignee?: string | null;
  estimated_minutes?: number | null;
  labels: string[];
  blocked_by_count: number;
  external_ref?: string | null;
  pinned?: boolean;
  is_template?: boolean;

  // Detail fields (10+) - ONLY needed for edit
  description: string;
  acceptance_criteria: string;
  design: string;
  notes: string;
  closed_at?: string | null;
  due_at?: string | null;
  defer_until?: string | null;
  ephemeral?: boolean;

  // Relationship fields (5) - ONLY needed for detail dialog
  parent?: DependencyInfo;
  children?: DependencyInfo[];
  blocks?: DependencyInfo[];
  blocked_by?: DependencyInfo[];
  comments?: Comment[];

  // Event/Agent metadata (15+) - RARELY used
  event_kind?: string | null;
  actor?: string | null;
  // ... 13 more fields ...
}
```

### Proposed: Split into MinimalCard + FullCard

```typescript
// Tier 1: Minimal card (from bd list)
export interface MinimalCard {
  // Core identity
  id: string;
  title: string;

  // Display fields
  status: string;
  priority: number;
  issue_type: string;

  // Timestamps
  created_at: string;
  updated_at: string;
  closed_at?: string | null;

  // Counts (for badges/indicators)
  dependency_count: number;    // From bd list
  dependent_count: number;     // From bd list

  // Minimal description for search
  description: string;         // From bd list (full text)

  // Metadata
  created_by: string;
  close_reason?: string | null;
}

// Tier 2: Enriched card (optional progressive enhancement)
export interface EnrichedCard extends MinimalCard {
  // Display enhancement (loaded in background)
  assignee?: string | null;
  estimated_minutes?: number | null;
  labels?: string[];
  external_ref?: string | null;
  pinned?: boolean;
  blocked_by_count?: number;  // From relationship query
}

// Tier 3: Full card (from bd show, on-demand)
export interface FullCard extends EnrichedCard {
  // All detail fields
  acceptance_criteria: string;
  design: string;
  notes: string;
  due_at?: string | null;
  defer_until?: string | null;
  ephemeral?: boolean;
  is_template?: boolean;

  // Relationships (full objects)
  parent?: DependencyInfo;
  children?: DependencyInfo[];
  blocks?: DependencyInfo[];
  blocked_by?: DependencyInfo[];

  // Comments
  comments?: Comment[];

  // Event/Agent metadata (if needed)
  event_kind?: string | null;
  actor?: string | null;
  // ... rest of metadata ...
}
```

---

## Component Changes

### 1. Adapter Interface Changes

**Add new methods to BeadsAdapter interface:**

```typescript
export interface BeadsAdapter {
  // NEW: Fast minimal load
  getBoardMinimal(): Promise<MinimalCard[]>;

  // NEW: Full details for single issue
  getIssueFull(id: string): Promise<FullCard>;

  // OPTIONAL: Batch enrichment
  getIssuesEnriched(ids: string[]): Promise<EnrichedCard[]>;

  // KEEP: Existing methods for backward compatibility
  getBoard(): Promise<BoardData>;
  getColumnData(column: string, offset: number, limit: number): Promise<BoardCard[]>;
  // ... rest of existing methods ...
}
```

**Implementation in DaemonBeadsAdapter:**

```typescript
public async getBoardMinimal(): Promise<MinimalCard[]> {
  // Single fast query - no batching needed!
  const result = await this.execBd(['list', '--all', '--json', '--limit', '10000']);

  if (!Array.isArray(result)) {
    return [];
  }

  // bd list already returns the exact fields we need
  return result.map(issue => ({
    id: issue.id,
    title: issue.title,
    description: issue.description || '',
    status: issue.status,
    priority: issue.priority,
    issue_type: issue.issue_type,
    created_at: issue.created_at,
    created_by: issue.created_by,
    updated_at: issue.updated_at,
    closed_at: issue.closed_at,
    close_reason: issue.close_reason,
    dependency_count: issue.dependency_count || 0,
    dependent_count: issue.dependent_count || 0
  }));
}

public async getIssueFull(id: string): Promise<FullCard> {
  this.validateIssueId(id);

  // Single bd show call - fast (50ms)
  const result = await this.execBd(['show', '--json', id]);

  if (!Array.isArray(result) || result.length === 0) {
    throw new Error(`Issue not found: ${id}`);
  }

  const issue = result[0];

  // Map to FullCard with all fields
  return {
    // ... map all fields from bd show output ...
  };
}
```

### 2. Extension Message Handler Changes

**Add new message types:**

```typescript
// In src/types.ts
export type WebMsg =
  | { type: 'board.loadMinimal' }           // NEW: Fast minimal load
  | { type: 'issue.getFull'; id: string }   // NEW: Load full details
  | { type: 'board.load' }                  // KEEP: Legacy full load
  // ... existing message types ...

export type ExtMsg =
  | { type: 'board.minimal'; payload: MinimalCard[] }  // NEW
  | { type: 'issue.full'; payload: FullCard }          // NEW
  | { type: 'board.data'; payload: BoardData }         // KEEP: Legacy
  // ... existing message types ...
```

**Handler implementation in src/extension.ts:**

```typescript
case 'board.loadMinimal':
  try {
    const minimalCards = await adapter.getBoardMinimal();

    // Validate all cards (security)
    for (const card of minimalCards) {
      validateMarkdownFields({
        description: card.description
      }, output);
    }

    post('board.minimal', minimalCards);
  } catch (error) {
    const friendlyMsg = getUserFriendlyErrorMessage(error);
    post('mutation.error', { message: friendlyMsg });
  }
  break;

case 'issue.getFull':
  try {
    const validation = z.object({ id: z.string() }).safeParse(msg);
    if (!validation.success) {
      post('mutation.error', { message: 'Invalid issue ID' });
      break;
    }

    const fullIssue = await adapter.getIssueFull(validation.data.id);

    // Validate markdown fields
    validateMarkdownFields({
      description: fullIssue.description,
      acceptance_criteria: fullIssue.acceptance_criteria,
      design: fullIssue.design,
      notes: fullIssue.notes
    }, output);

    post('issue.full', fullIssue);
  } catch (error) {
    const friendlyMsg = getUserFriendlyErrorMessage(error);
    post('mutation.error', { message: friendlyMsg });
  }
  break;
```

### 3. Webview State Management Changes

**New state architecture in media/main.js:**

```javascript
// ━━━ State Management ━━━

// Central card cache: Map<id, card>
const cardCache = new Map();

// Card state levels: 'minimal' | 'enriched' | 'full'
const cardStateLevel = new Map();  // Map<id, level>

// Current filter/sort state (in-memory)
let currentFilters = {
  search: '',
  priority: '',
  type: ''
};

let currentSort = {
  field: 'updated_at',
  direction: 'desc'
};

// ━━━ Data Loading ━━━

async function loadBoard() {
  showLoading('Loading board...');

  // Request minimal data (fast!)
  const response = await postAsync('board.loadMinimal', {}, 'Loading board...');

  if (response.type === 'board.minimal') {
    // Store all cards in cache
    cardCache.clear();
    cardStateLevel.clear();

    for (const card of response.payload) {
      cardCache.set(card.id, card);
      cardStateLevel.set(card.id, 'minimal');
    }

    // Render immediately (in-memory operations)
    render();

    // Optional: Start background enrichment
    // enrichVisibleCards();
  }

  hideLoading();
}

async function loadFullIssue(id) {
  // Check if already loaded
  if (cardStateLevel.get(id) === 'full') {
    return cardCache.get(id);
  }

  showLoading('Loading issue details...');

  const response = await postAsync('issue.getFull', { id }, 'Loading details...');

  if (response.type === 'issue.full') {
    // Update cache with full data
    cardCache.set(id, response.payload);
    cardStateLevel.set(id, 'full');

    hideLoading();
    return response.payload;
  }

  hideLoading();
  throw new Error('Failed to load issue');
}

// ━━━ In-Memory Filtering/Sorting ━━━

function getFilteredCards() {
  const allCards = Array.from(cardCache.values());

  return allCards.filter(card => {
    // Search filter (in-memory!)
    if (currentFilters.search) {
      const search = currentFilters.search.toLowerCase();
      const matches =
        card.title.toLowerCase().includes(search) ||
        card.description.toLowerCase().includes(search) ||
        card.id.toLowerCase().includes(search);

      if (!matches) return false;
    }

    // Priority filter
    if (currentFilters.priority && card.priority !== parseInt(currentFilters.priority)) {
      return false;
    }

    // Type filter
    if (currentFilters.type && card.issue_type !== currentFilters.type) {
      return false;
    }

    return true;
  });
}

function getSortedCards(cards) {
  return cards.sort((a, b) => {
    const aVal = a[currentSort.field];
    const bVal = b[currentSort.field];

    if (currentSort.direction === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });
}

function getCardsByColumn() {
  const filtered = getFilteredCards();
  const sorted = getSortedCards(filtered);

  // Group by column (in-memory!)
  const byCol = {
    ready: [],
    in_progress: [],
    blocked: [],
    closed: []
  };

  for (const card of sorted) {
    // Column logic (same as current)
    if (card.status === 'closed') {
      byCol.closed.push(card);
    } else if (card.status === 'in_progress') {
      byCol.in_progress.push(card);
    } else if (card.status === 'blocked' || card.dependency_count > 0) {
      byCol.blocked.push(card);
    } else if (card.status === 'open') {
      byCol.ready.push(card);
    }
  }

  return byCol;
}

// ━━━ Event Handlers ━━━

filterSearch.addEventListener('input', () => {
  currentFilters.search = filterSearch.value;
  render();  // Instant! No server round-trip
});

filterPriority.addEventListener('change', () => {
  currentFilters.priority = filterPriority.value;
  render();  // Instant!
});

filterType.addEventListener('change', () => {
  currentFilters.type = filterType.value;
  render();  // Instant!
});

async function openEditDialog(card) {
  // Load full details if not already loaded
  const fullCard = await loadFullIssue(card.id);

  // Populate edit form with all fields
  populateEditForm(fullCard);

  // Show dialog
  editDialog.showModal();
}
```

---

## Message Protocol Flow

### Tier 1: Initial Load (100-300ms)

```
User opens Kanban
  ↓
Webview: postAsync('board.loadMinimal', {})
  ↓
Extension: adapter.getBoardMinimal()
  ↓
Daemon: bd list --all --json --limit 10000
  ↓
Daemon: Returns 400 issues with core fields (100-300ms)
  ↓
Extension: Validate markdown fields
  ↓
Extension: post('board.minimal', minimalCards)
  ↓
Webview: Store all in cardCache Map
  ↓
Webview: render() - Group by column, apply filters (in-memory)
  ↓
User sees board (TOTAL: 100-300ms) ✅
```

### Tier 2: Filter/Search (0ms - Instant!)

```
User types in search box "performance"
  ↓
Webview: currentFilters.search = "performance"
  ↓
Webview: render()
  ↓
  ├─ getFilteredCards() - in-memory filter
  ├─ getSortedCards() - in-memory sort
  └─ getCardsByColumn() - in-memory grouping
  ↓
User sees filtered results (TOTAL: <16ms, instant!) ✅
```

### Tier 3: Edit Issue (50-100ms)

```
User clicks "Edit" on issue
  ↓
Webview: Check if cardStateLevel.get(id) === 'full'
  ↓ (if not full)
Webview: postAsync('issue.getFull', { id })
  ↓
Extension: adapter.getIssueFull(id)
  ↓
Daemon: bd show --json <id>
  ↓
Daemon: Returns full issue with all fields (50ms)
  ↓
Extension: Validate all markdown fields
  ↓
Extension: post('issue.full', fullCard)
  ↓
Webview: Update cardCache.set(id, fullCard)
  ↓
Webview: Populate edit form with all fields
  ↓
User sees edit dialog (TOTAL: 50-100ms) ✅
```

---

## Implementation Phases

### Phase 1: Foundation (2-3 hours)

**Goal**: Add new methods without breaking existing functionality

1. ✅ Add `MinimalCard` interface to src/types.ts
2. ✅ Add `FullCard` interface to src/types.ts
3. ✅ Add new message types to WebMsg/ExtMsg unions
4. ✅ Implement `getBoardMinimal()` in DaemonBeadsAdapter
5. ✅ Implement `getIssueFull(id)` in DaemonBeadsAdapter
6. ✅ Add message handlers in src/extension.ts
7. ✅ Test: Verify new methods work without breaking old ones

### Phase 2: Webview Rewrite (4-6 hours)

**Goal**: Switch webview to use new architecture

1. ✅ Add cardCache Map to media/main.js
2. ✅ Add cardStateLevel Map
3. ✅ Rewrite loadBoard() to use 'board.loadMinimal'
4. ✅ Implement getFilteredCards() - in-memory filtering
5. ✅ Implement getSortedCards() - in-memory sorting
6. ✅ Implement getCardsByColumn() - in-memory grouping
7. ✅ Update filter event handlers to use in-memory operations
8. ✅ Update render() to use cardCache
9. ✅ Add loadFullIssue(id) for edit dialog
10. ✅ Test: Verify instant filters, searches, sorts

### Phase 3: BeadsAdapter Implementation (2-3 hours)

**Goal**: Support sql.js adapter with same interface

1. ✅ Implement `getBoardMinimal()` using SQL:
   ```sql
   SELECT id, title, description, status, priority, issue_type,
          created_at, created_by, updated_at, closed_at, close_reason
   FROM issues
   WHERE deleted_at IS NULL
   LIMIT 10000
   ```
2. ✅ Implement `getIssueFull(id)` with joins for relationships
3. ✅ Test: Verify sql.js adapter works with new architecture

### Phase 4: Progressive Enhancement (Optional, 2-4 hours)

**Goal**: Add Tier 2 enrichment for better UX

1. ⭕ Implement `getIssuesEnriched(ids)` batch query
2. ⭕ Add background enrichment after initial render
3. ⭕ Load labels for visible cards
4. ⭕ Load assignees in batch
5. ⭕ Update cards incrementally without flickering

### Phase 5: Cleanup & Deprecation (1-2 hours)

**Goal**: Remove old code paths

1. ⭕ Mark `getBoard()` as deprecated
2. ⭕ Mark `getColumnData()` as deprecated (replaced by in-memory slicing)
3. ⭕ Remove batch processing logic (no longer needed)
4. ⭕ Update CLAUDE.md documentation
5. ⭕ Write migration guide

---

## Performance Comparison

### Current Architecture

| Operation | Time | Method |
|-----------|------|--------|
| Initial load (400 issues) | 5,000ms | bd list + 8× bd show batches |
| Filter by priority | 100-500ms | Re-query database |
| Search "performance" | 100-500ms | Re-query database |
| Sort by date | 100-500ms | Re-query database |
| Open edit dialog | 0ms | Data already loaded |

**Total for typical session**: ~6 seconds (initial + 2 filters)

### Proposed Architecture

| Operation | Time | Method |
|-----------|------|--------|
| Initial load (400 issues) | 100-300ms | Single bd list --all |
| Filter by priority | <16ms | In-memory filter |
| Search "performance" | <16ms | In-memory string search |
| Sort by date | <16ms | In-memory sort |
| Open edit dialog | 50-100ms | Single bd show <id> |

**Total for typical session**: ~0.4 seconds (initial + 2 filters + 1 edit)

**Improvement: 15x faster** ⚡

### Scalability

| Issue Count | Current | Proposed | Improvement |
|-------------|---------|----------|-------------|
| 100 | 1.2s | 0.1s | 12x faster |
| 400 | 5.0s | 0.3s | 16x faster |
| 1,000 | 12.5s | 0.5s | 25x faster |
| 5,000 | 62.5s | 2.0s | 31x faster |

---

## Tradeoffs & Design Decisions

### Decision 1: What fields to include in MinimalCard?

**Options:**

A. **Ultra-minimal** (5 fields: id, title, status, priority, type)
   - ✅ Fastest possible load
   - ❌ No description for search
   - ❌ No dependency_count for blocked badges

B. **Core fields** (10 fields: + description, dates, counts) **← RECOMMENDED**
   - ✅ Fast load (100-300ms)
   - ✅ Enables full-text search
   - ✅ Shows dependency indicators
   - ✅ All fields available in bd list output

C. **Enhanced fields** (15 fields: + assignee, labels, etc.)
   - ✅ Better card display
   - ❌ Requires additional queries (not in bd list)
   - ❌ Slower load

**Recommendation**: Option B (Core fields from bd list)

### Decision 2: Handle missing fields on cards?

**Problem**: MinimalCard doesn't have `assignee` or `labels` fields shown in current cards.

**Options:**

A. **Hide badges initially** **← RECOMMENDED for Phase 1**
   - Show only: Priority, Type, Blocked count (from dependency_count)
   - Hide: Assignee, Labels, Estimated time
   - Re-render when enrichment completes (Phase 4)

B. **Show placeholders**
   - Display "Assignee: ..." while loading
   - May cause visual jitter

C. **Require enrichment before render**
   - Delays initial render
   - Defeats the purpose

**Recommendation**: Option A - Progressive enhancement

### Decision 3: Blocked column logic?

**Problem**: Current code checks `blocked_by_count > 0` or `blocked_by` array, but MinimalCard only has `dependency_count`.

**Options:**

A. **Use dependency_count as proxy** **← RECOMMENDED**
   ```javascript
   if (card.dependency_count > 0) {
     byCol.blocked.push(card);
   }
   ```
   - ✅ Available in bd list
   - ❌ May include "blocks others" not "is blocked by"

B. **Query blocked status separately**
   ```
   bd list --status=blocked --json
   ```
   - ✅ Accurate
   - ❌ Additional query

C. **Accept incomplete blocked column**
   - Show only status=blocked issues
   - Don't show dependency-blocked issues
   - ❌ Changes user experience

**Recommendation**: Option A initially, with option to switch to B in settings

### Decision 4: Cache invalidation?

**Problem**: In-memory cache may become stale.

**Options:**

A. **Manual refresh button** **← RECOMMENDED**
   - User clicks "Refresh" to reload
   - Clear cache and re-fetch
   - Simple to implement

B. **TTL-based refresh**
   - Auto-refresh every 30 seconds
   - May cause flickering

C. **File watcher**
   - Watch .beads/*.db for changes
   - Reload on change
   - Already implemented for sql.js adapter

**Recommendation**: Option A for daemon adapter, Option C for sql.js adapter

---

## Risks & Mitigations

### Risk 1: Incomplete card display

**Risk**: Cards may look "bare" without assignee/labels initially

**Mitigation**:
- Phase 4 implements progressive enrichment
- Or: Accept simpler cards (many Kanban tools don't show labels)

### Risk 2: Stale data in cache

**Risk**: User edits issue in CLI, webview shows old data

**Mitigation**:
- Refresh button (manual)
- File watcher (automatic for sql.js)
- Cache TTL with background refresh

### Risk 3: Memory usage with 10K+ issues

**Risk**: 10,000 MinimalCards × 1KB each = 10MB in webview

**Mitigation**:
- MinimalCard is small (~300 bytes after JSON compression)
- 10,000 cards ≈ 3MB (acceptable)
- Add setting to limit max issues if needed

### Risk 4: Breaking changes

**Risk**: Existing users may experience issues

**Mitigation**:
- Keep old `board.load` message working (backward compat)
- Add feature flag: `beadsKanban.useFastLoading` (default: true)
- Users can opt-out if problems occur

---

## Open Questions

1. **Should we load description in MinimalCard?**
   - Pro: Enables full-text search
   - Con: Increases payload size (descriptions can be 10KB+)
   - **Recommendation**: Include description - bd list already returns it

2. **What about Table view?**
   - Table view may need more columns (assignee, dates, etc.)
   - Should we have separate MinimalTableCard?
   - **Recommendation**: Use same MinimalCard, accept missing columns initially

3. **Should we batch-enrich on scroll?**
   - As user scrolls, load labels/assignees for visible cards
   - Complexity: Intersection Observer
   - **Recommendation**: Phase 4 (optional)

4. **Should dependency_count include "blocks others"?**
   - Need to verify what bd list returns
   - May need to query bd CLI team
   - **Recommendation**: Test and document behavior

---

## Success Metrics

### Performance Goals

- ✅ Initial load: < 500ms (vs 5s = 10x faster)
- ✅ Filter/search: < 16ms (vs 100-500ms = instant)
- ✅ Edit dialog: < 100ms (vs 0ms = acceptable tradeoff)

### User Experience Goals

- ✅ Responsive UI (no 5-second freeze)
- ✅ Instant feedback on filters/searches
- ✅ Scales to 10,000+ issues
- ✅ No regressions in functionality

### Code Quality Goals

- ✅ Backward compatible (old code paths still work)
- ✅ Clean separation of concerns (minimal/enriched/full)
- ✅ Well-documented architecture
- ✅ Test coverage for new code paths

---

## Next Steps

1. **Review this proposal** - Does the approach make sense?
2. **Decide on tradeoffs** - Which options for missing fields, blocked logic, etc.?
3. **Approve Phase 1** - Implement foundation without breaking changes
4. **Test with real data** - Verify performance on your 400+ issue database
5. **Iterate** - Adjust based on feedback

---

## Appendix: bd list vs bd show Field Comparison

| Field | bd list | bd show | Needed for Card | Notes |
|-------|---------|---------|-----------------|-------|
| id | ✅ | ✅ | ✅ Required | Primary key |
| title | ✅ | ✅ | ✅ Required | Card title |
| description | ✅ | ✅ | 🟡 Optional | For search, can be large |
| status | ✅ | ✅ | ✅ Required | Column grouping |
| priority | ✅ | ✅ | ✅ Required | Badge |
| issue_type | ✅ | ✅ | ✅ Required | Badge |
| created_at | ✅ | ✅ | 🟡 Optional | For sorting |
| created_by | ✅ | ✅ | ❌ Not shown | Metadata |
| updated_at | ✅ | ✅ | 🟡 Optional | For sorting |
| closed_at | ✅ | ✅ | ❌ Not shown | Metadata |
| close_reason | ✅ | ✅ | ❌ Not shown | Metadata |
| dependency_count | ✅ | ❌ | 🟡 Optional | Blocked badge |
| dependent_count | ✅ | ❌ | ❌ Not shown | Metadata |
| assignee | ❌ | ✅ | 🟡 Nice to have | Badge |
| estimated_minutes | ❌ | ✅ | 🟡 Nice to have | Badge |
| labels | ❌ | ✅ | 🟡 Nice to have | Badges |
| blocked_by_count | ❌ | ✅ | 🟡 Nice to have | Badge |
| external_ref | ❌ | ✅ | 🟡 Nice to have | Badge |
| pinned | ❌ | ✅ | 🟡 Nice to have | Badge |
| acceptance_criteria | ❌ | ✅ | ❌ Edit only | Detail field |
| design | ❌ | ✅ | ❌ Edit only | Detail field |
| notes | ❌ | ✅ | ❌ Edit only | Detail field |
| due_at | ❌ | ✅ | ❌ Edit only | Detail field |
| defer_until | ❌ | ✅ | ❌ Edit only | Detail field |
| parent | ❌ | ✅ | ❌ Edit only | Relationship |
| children | ❌ | ✅ | ❌ Edit only | Relationship |
| blocks | ❌ | ✅ | ❌ Edit only | Relationship |
| blocked_by | ❌ | ✅ | ❌ Edit only | Relationship |
| comments | ❌ | ✅ | ❌ Edit only | Relationship |

**Legend:**
- ✅ Required: Must have for core functionality
- 🟡 Optional: Nice to have, can load later
- ❌ Not needed: Only for edit/detail view

---

## Appendix: SQL Implementation Reference

For BeadsAdapter (sql.js), here's the equivalent query:

```sql
-- getBoardMinimal()
SELECT
  id,
  title,
  description,
  status,
  priority,
  issue_type,
  created_at,
  created_by,
  updated_at,
  closed_at,
  close_reason,
  (SELECT COUNT(*) FROM dependencies WHERE issue_id = issues.id) as dependency_count,
  (SELECT COUNT(*) FROM dependencies WHERE depends_on_id = issues.id) as dependent_count
FROM issues
WHERE deleted_at IS NULL
ORDER BY updated_at DESC
LIMIT 10000;

-- getIssueFull(id)
SELECT
  i.*,
  (SELECT COUNT(*) FROM dependencies WHERE issue_id = i.id AND type = 'blocks') as blocked_by_count
FROM issues i
WHERE i.id = ? AND i.deleted_at IS NULL;

-- Then separate queries for:
SELECT * FROM labels WHERE issue_id = ?;
SELECT * FROM comments WHERE issue_id = ? ORDER BY created_at;
SELECT * FROM dependencies WHERE issue_id = ? OR depends_on_id = ?;
```

This shows the architecture works equally well for both adapters.
