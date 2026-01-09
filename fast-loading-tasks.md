# Phase 1: Tier 1 Foundation Tasks

## Add MinimalCard interface to types.ts
- type: task
- priority: 1
- estimate: 30
- labels: phase:1, feature:tier1-foundation
- description: Add MinimalCard interface with 10 core fields (id, title, description, status, priority, issue_type, created_at, created_by, updated_at, closed_at, close_reason, dependency_count, dependent_count). Part of Feature: Tier 1 Foundation

## Add FullCard interface to types.ts
- type: task
- priority: 1
- estimate: 30
- labels: phase:1, feature:tier1-foundation
- description: Add FullCard interface extending EnrichedCard with all 40+ fields including relationships, comments, and event/agent metadata. Part of Feature: Tier 1 Foundation

## Add EnrichedCard interface to types.ts
- type: task
- priority: 1
- estimate: 20
- labels: phase:1, feature:tier1-foundation
- description: Add EnrichedCard interface extending MinimalCard with optional display enhancement fields (assignee, estimated_minutes, labels, external_ref, pinned, blocked_by_count). Part of Feature: Tier 1 Foundation

## Add new message types to WebMsg/ExtMsg unions
- type: task
- priority: 1
- estimate: 20
- labels: phase:1, feature:tier1-foundation
- description: Add board.loadMinimal, issue.getFull, board.minimal, issue.full message types to src/types.ts for new loading protocol. Part of Feature: Tier 1 Foundation

## Implement getBoardMinimal() in DaemonBeadsAdapter
- type: task
- priority: 1
- estimate: 60
- labels: phase:1, feature:tier1-foundation
- description: Implement fast minimal load using single 'bd list --all --json --limit 10000' query. Map results to MinimalCard[] without batching. Expected 100-300ms for 400 issues. Part of Feature: Tier 1 Foundation

## Implement getIssueFull() in DaemonBeadsAdapter
- type: task
- priority: 1
- estimate: 45
- labels: phase:1, feature:tier1-foundation
- description: Implement on-demand full details load using single 'bd show --json <id>' query. Map to FullCard with all fields including relationships. Expected 50ms per issue. Part of Feature: Tier 1 Foundation

## Add message handlers in extension.ts
- type: task
- priority: 1
- estimate: 45
- labels: phase:1, feature:tier1-foundation
- description: Add handlers for board.loadMinimal and issue.getFull messages. Include validation with validateMarkdownFields and error handling with getUserFriendlyErrorMessage. Part of Feature: Tier 1 Foundation

## Add unit tests for new adapter methods
- type: task
- priority: 1
- estimate: 60
- labels: phase:1, feature:tier1-foundation
- description: Test getBoardMinimal() returns correct MinimalCard format, getIssueFull() loads all fields, error handling for missing issues. Part of Feature: Tier 1 Foundation

# Phase 2: Client-Side State Management Tasks

## Add cardCache Map to webview
- type: task
- priority: 1
- estimate: 30
- labels: phase:2, feature:client-state
- description: Add Map<id, card> to media/main.js to store all loaded cards in memory. Initialize on board load, update on mutations. Part of Feature: Client-Side State Management

## Add cardStateLevel Map to webview
- type: task
- priority: 1
- estimate: 20
- labels: phase:2, feature:client-state
- description: Add Map<id, level> tracking card state ('minimal'|'enriched'|'full') to avoid redundant loads. Part of Feature: Client-Side State Management

## Rewrite loadBoard() to use board.loadMinimal
- type: task
- priority: 1
- estimate: 60
- labels: phase:2, feature:client-state
- description: Replace existing board.load with board.loadMinimal message. Store all results in cardCache, call render(). Part of Feature: Client-Side State Management

## Implement getFilteredCards() in-memory filtering
- type: task
- priority: 1
- estimate: 45
- labels: phase:2, feature:client-state
- description: Implement client-side filtering (search, priority, type, status) over cardCache without server round-trips. Returns filtered array in <16ms. Part of Feature: Client-Side State Management

## Implement getSortedCards() in-memory sorting
- type: task
- priority: 1
- estimate: 30
- labels: phase:2, feature:client-state
- description: Implement client-side sorting by field (updated_at, created_at, priority, title) with asc/desc direction in <16ms. Part of Feature: Client-Side State Management

## Implement getCardsByColumn() in-memory grouping
- type: task
- priority: 1
- estimate: 45
- labels: phase:2, feature:client-state
- description: Implement column grouping logic (ready/in_progress/blocked/closed) over filtered+sorted cards in <16ms. Part of Feature: Client-Side State Management

## Update filter event handlers for instant UI
- type: task
- priority: 1
- estimate: 30
- labels: phase:2, feature:client-state
- description: Update filterSearch, filterPriority, filterType, filterStatus event handlers to use in-memory operations and render() immediately. Part of Feature: Client-Side State Management

## Update render() to use cardCache
- type: task
- priority: 1
- estimate: 60
- labels: phase:2, feature:client-state
- description: Rewrite render() to get cards from getCardsByColumn() instead of boardData global. Update column counts, badges, card creation. Part of Feature: Client-Side State Management

## Add loadFullIssue(id) for edit dialog
- type: task
- priority: 1
- estimate: 45
- labels: phase:2, feature:client-state
- description: Implement loadFullIssue(id) that checks cardStateLevel, sends issue.getFull if needed, updates cache, returns FullCard. Part of Feature: Client-Side State Management

## Update edit dialog to use loadFullIssue()
- type: task
- priority: 1
- estimate: 30
- labels: phase:2, feature:client-state
- description: Call loadFullIssue() when opening edit dialog, populate all form fields from FullCard data. Part of Feature: Client-Side State Management

# Phase 3: BeadsAdapter (sql.js) Implementation Tasks

## Implement getBoardMinimal() in BeadsAdapter
- type: task
- priority: 1
- estimate: 60
- labels: phase:3, feature:beads-adapter
- description: Implement SQL query with COUNT subqueries for dependency counts. Map results to MinimalCard[]. Expected <100ms for 400 issues. Part of Feature: BeadsAdapter Implementation

## Implement getIssueFull() in BeadsAdapter
- type: task
- priority: 1
- estimate: 60
- labels: phase:3, feature:beads-adapter
- description: Implement SQL query with JOINs for labels/comments/dependencies. Map to FullCard with all relationships. Expected <50ms per issue. Part of Feature: BeadsAdapter Implementation

## Add tests for BeadsAdapter minimal/full loading
- type: task
- priority: 1
- estimate: 60
- labels: phase:3, feature:beads-adapter
- description: Test getBoardMinimal() and getIssueFull() with sql.js adapter. Verify same behavior as DaemonBeadsAdapter. Part of Feature: BeadsAdapter Implementation

# Phase 4: Progressive Enhancement Tasks (Optional)

## Implement getIssuesEnriched() batch query
- type: task
- priority: 2
- estimate: 60
- labels: phase:4, feature:progressive-enhancement, optional
- description: Implement batch enrichment query for labels/assignees. Takes array of IDs, returns EnrichedCard[]. Part of Feature: Progressive Enhancement

## Add background enrichment after initial render
- type: task
- priority: 2
- estimate: 45
- labels: phase:4, feature:progressive-enhancement, optional
- description: After render(), call enrichVisibleCards() in background to load labels/assignees for visible cards. Update incrementally without flickering. Part of Feature: Progressive Enhancement

## Implement enrichVisibleCards() for visible cards
- type: task
- priority: 2
- estimate: 60
- labels: phase:4, feature:progressive-enhancement, optional
- description: Detect visible cards using IntersectionObserver or simple viewport check. Batch enrich, update cardCache, re-render affected cards. Part of Feature: Progressive Enhancement

# UI/UX Enhancement Tasks

## Add Status dropdown filter to title bar
- type: task
- priority: 2
- estimate: 45
- labels: feature:status-filter, epic:ui-ux
- description: Add <select> element to title bar row after Search box with options: All, Open, In Progress, Blocked, Closed. Style to match existing filters. Part of Feature: Status Filter Dropdown

## Wire Status filter to in-memory filtering
- type: task
- priority: 2
- estimate: 30
- labels: feature:status-filter, epic:ui-ux
- description: Add filterStatus variable and event handler. Update getFilteredCards() to filter by status. Render() on change. Part of Feature: Status Filter Dropdown

## Move TableView pagination to header row
- type: task
- priority: 2
- estimate: 60
- labels: feature:table-pagination, epic:ui-ux
- description: Restructure TableView header to have single row with 'Rows per page', page indicator, Previous/Next buttons. Adjust CSS flexbox layout. Part of Feature: TableView Pagination Layout

## Test TableView pagination responsive behavior
- type: task
- priority: 2
- estimate: 30
- labels: feature:table-pagination, epic:ui-ux
- description: Test pagination layout at different viewport widths. Ensure controls don't overflow or wrap awkwardly. Part of Feature: TableView Pagination Layout
