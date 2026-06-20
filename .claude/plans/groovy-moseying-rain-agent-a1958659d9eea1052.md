# Data Models and API Services Exploration Report

## Overview

This report documents the data models, API services, state management, and analytics implementations for all major modules in the application.

---

## 1. Todo/Task System

### Database Schema (`50_learning.sql`)

- **todo_group**: Task groups/lists with title, color, sort order, archive status
- **todo_item**: Individual tasks with title, description, completion status, due dates, parent-child relationships
- **todo_note_link**: Links between todos and content notes
- **todo_recurrence**: Recurring task rules (daily, weekly, monthly patterns)
- **todo_recurrence_completion**: Tracks completion of recurring task instances
- **todo_calendar_mapping**: Syncs todos with calendar events

### Store (`useTodoStore.ts`)

Location: `/d/coding/editor/apps/desktop/src/stores/useTodoStore.ts`

**State Management:**

- Groups, system groups, and group statistics
- Items organized by groupId
- Notes linked to todos
- UI state (left/right panels, widths)
- Filter state (completed, overdue, keyword search)

**Key APIs:**

- Group management: `listTodoGroups`, `createTodoGroup`, `updateTodoGroup`, `archiveTodoGroup`, `reorderTodoGroups`
- Item management: `listTodoItems`, `createTodoItem`, `updateTodoItem`, `toggleCompleteCascade`, `moveAndReorderTodoItem`, `deleteTodoItem`
- Note linking: `attachExistingNote`, `createAndAttachNote`, `detachNote`
- Statistics: `getTodoGroupStats`, `getSystemGroupStats`

**Command File:** `/d/coding/editor/apps/desktop/src/commands/todo.ts`

---

## 2. Flashcard/Review System

### Database Schema (`50_learning.sql`)

- **flashcard_decks**: Deck metadata (name, description, cover, emoji, sort order)
- **flashcards**: Individual cards with type, prompt, data, tags, difficulty, review level, due time, ease factor, status
- **flashcard_reviews**: Review history (rating, interval, ease factor, notes)
- **flashcard_references**: Links cards to content sources

### Store (`useFlashcardStore.ts`)

Location: `/d/coding/editor/apps/desktop/src/stores/useFlashcardStore.ts`

**State Management:**

- Decks list and active deck
- Cards organized by deckId
- Review queue and queue deck
- Review history (last 20 reviews)
- Filters (search, tag, statuses)
- View mode (overview, table, review)

**Key APIs:**

- Deck management: `listFlashcardDecks`, `createFlashcardDeck`, `updateFlashcardDeck`, `deleteFlashcardDeck`
- Card management: `listFlashcards`, `createFlashcard`, `updateFlashcard`, `deleteFlashcard`
- Review system: `getFlashcardReviewQueue`, `submitFlashcardReview`

**Command File:** `/d/coding/editor/apps/desktop/src/commands/flashcard.ts`

---

## 3. Notes System

### Database Schema (`10_core.sql`)

- **contents**: Core content table (shared by cards, articles, documents)
- **cards**: Fleeting/permanent notes with tags, links, category, content_id
- **articles**: Full articles with title, author, tags, links, banner, content_id
- **documents**: Document tree structure with title, desc, children, content
- **document_items**: Document items that can reference articles/cards or other content

### Stores

- **Cards Store:** `/d/coding/editor/apps/desktop/src/stores/useCardsManagementStore.ts`
  - View modes: list, graph, database, timeline
  - Category filtering (permanent/fleeting)
  - Presentation mode
- **Articles Store:** `/d/coding/editor/apps/desktop/src/stores/useArticleManagementStore.ts`
  - Article list visibility
  - Presentation mode

**Command Files:**

- `/d/coding/editor/apps/desktop/src/commands/card.ts`
- `/d/coding/editor/apps/desktop/src/commands/article.ts`
- `/d/coding/editor/apps/desktop/src/commands/document.ts`
- `/d/coding/editor/apps/desktop/src/commands/content.ts`

**Statistics Available:**

- Word count stored in `contents.count`
- Word count in `diary_entries.word_count`

---

## 4. RSS/Subscription System

### Database Schema (`45_rss.sql`)

- **rss_feed**: Feed metadata (title, url, feed type, fetch interval, error tracking)
- **rss_subscription**: User subscriptions with categories and view types
- **rss_entry**: Individual feed entries (guid, title, url, content, read/starred status)
- **read_later**: Read later queue from various sources

### Store (`useRssStore.ts`)

Location: `/d/coding/editor/apps/desktop/src/stores/useRssStore.ts`

**State Management:**

- Feeds, subscriptions, categories
- Entries with pagination (50 per page)
- Unread counts by feed
- Starred count
- Filter modes (all, unread, starred)
- Entry scope (feed, unread, starred, all, category)

**Key APIs:**

- Feed management: `listRssFeeds`, `createRssFeed`, `deleteRssFeed`, `refreshRssFeed`, `refreshAllRssFeeds`
- Subscription management: `listRssSubscriptions`, `createRssSubscription`, `updateRssSubscription`, `deleteRssSubscription`
- Entry operations: `listRssEntriesByFeed`, `listUnreadRssEntries`, `listStarredRssEntries`, `markRssEntryRead`, `toggleRssEntryStar`
- Statistics: `countRssEntriesByFeed`, `countUnreadRssEntries`, `getUnreadCounts`, `getStarredCount`
- Discovery: `discoverFeeds`, `previewFeed`, `extractContent`

**Command File:** `/d/coding/editor/apps/desktop/src/commands/rss.ts`

---

## 5. Issues/Problem Tracking

### Database Schema (`20_content.sql`)

- **question_group**: Question groups with title, color, sort order, default status
- **questions**: Individual questions with content, answers (JSON array), group, sort order, status (not_started, in_progress, resolved), description

### Store (`useQuestionStore.ts`)

Location: `/d/coding/editor/apps/desktop/src/stores/useQuestionStore.ts`

**State Management:**

- Groups and group statistics (total, answered, unanswered)
- Items organized by groupId
- Filter options (all, answered, unanswered, not_started, in_progress, resolved)
- Search query

**Key APIs:**

- Group management: `listQuestionGroups`, `createQuestionGroup`, `updateQuestionGroup`, `deleteQuestionGroup`, `reorderQuestionGroups`
- Question management: `listQuestionsByGroup`, `createQuestion`, `updateQuestion`, `deleteQuestion`, `reorderQuestions`, `moveQuestionToGroup`
- Answer management: `addAnswer`, `createAnswer`, `deleteAnswer`
- Status updates: `updateQuestionStatus`
- Statistics: `getQuestionGroupStats`

**Command Files:**

- `/d/coding/editor/apps/desktop/src/commands/question.ts`
- `/d/coding/editor/apps/desktop/src/commands/question-group.ts`

---

## 6. Projects and Knowledge Bases

### Database Schema (`30_project.sql`)

- **project**: Projects with title, desc, children, archived/pinned status, project_type (document-tree, etc.), data_table_id
- **project_item**: Project items with title, children, parents, projects, ref_type/ref_id (polymorphic references), content_id, white_board_content_id

### Store (`useProjectsStore.ts`)

Location: `/d/coding/editor/apps/desktop/src/stores/useProjectsStore.ts`

**Command File:** `/d/coding/editor/apps/desktop/src/commands/project.ts`

**Related:**

- **Vibe Learning Resources** (`50_learning.sql`): Learning resources attached to projects
- **Vibe Learning Chats** (`50_learning.sql`): Chat conversations for learning projects
- **VL Notes** (`50_learning.sql`): Notes within learning projects
- **VL Quiz Sets** (`50_learning.sql`): Quiz sets for learning projects

---

## 7. Whiteboard System

### Database Schema (`10_core.sql`)

- **white_board_contents**: Whiteboard content data (name, data as JSON/text, img_url, ref_count)
- **white_boards**: Whiteboard metadata (title, description, tags, snapshot, active content id, content ids array)

### Store (`useWhiteBoardStore.ts`)

Location: `/d/coding/editor/apps/desktop/src/stores/useWhiteBoardStore.ts`

**Command File:** `/d/coding/editor/apps/desktop/src/commands/white-board.ts`

**Services:**

- `/d/coding/editor/apps/desktop/src/components/WhiteBoard/services/CapabilityService.ts`
- `/d/coding/editor/apps/desktop/src/components/WhiteBoard/services/DOMSizeMeasurer.tsx`

---

## 8. Pomodoro Timer

### Database Schema (`50_learning.sql`)

- **pomodoro_presets**: Timer presets (name, mode, duration, sort order, archived)
- **pomodoro_sessions**: Session records (preset_id, start/end time, expected/focus/pause durations, pause count, status)
- **pomodoro_calendar_mapping**: Links pomodoro sessions to calendar events

### Store (`usePomodoroStore.ts`)

Location: `/d/coding/editor/apps/desktop/src/stores/usePomodoroStore.ts`

**State Management:**

- Presets and active preset
- Sessions history (100 per page, with pagination)
- Active session with real-time elapsed/remain time
- Background sound settings
- Statistics: today count/focusMs, total count/focusMs

**Key APIs:**

- Session management: `getActivePomodoroSession`, `listPomodoroSessions`
- Preset management: `listPomodoroPresets`
- Statistics: `summaryPomodoroToday`, `summaryPomodoroTotal`
- Settings: `setBackgroundSound`
- Real-time updates via WebSocket: `pomodoro:tick`, `pomodoro:active-session-changed`

**Command Files:**

- `/d/coding/editor/apps/desktop/src/commands/pomodoro.ts`
- `/d/coding/editor/apps/desktop/src/commands/pomodoro-calendar-mapping.ts`

---

## 9. Calendar Events

### Database Schema (`50_learning.sql`)

- **calendar_group**: Calendar groups (name, parent_id, order_index, system flag)
- **calendar**: Individual calendars (title, color, description, archived/pinned/visible status, group_id)
- **calendar_event**: Events (title, detail_content_id, start/end date/time, color, all_day flag, value)

### Store (`useCalendarStore.ts`)

Location: `/d/coding/editor/apps/desktop/src/stores/useCalendarStore.ts`

**State Management:**

- Calendars and calendar groups
- Events for current view
- Current view type (day, week, month, agenda)
- Selected calendar IDs for filtering
- Merge mode for combining calendars

**Key APIs:**

- Calendar management: `getAllCalendars`, `createCalendar`, `updateCalendar`, `deleteCalendar`, `mergeCalendars`
- Calendar group management: `getAllCalendarGroups`, `createCalendarGroup`, `updateCalendarGroup`, `deleteCalendarGroup`
- Event management: `createCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent`
- Event loading: `getEventsForDay`, `getEventsForWeek`, `getEventsForMonth`

**Command Files:**

- `/d/coding/editor/apps/desktop/src/commands/calendar.ts`
- `/d/coding/editor/apps/desktop/src/commands/calendar-group.ts`

---

## 10. Recent Activity/Operation Logging

### Database Schema (`10_core.sql`)

- **operation**: Operation records (operation_time, operation_id, operation_content_type, operation_action)
- **statistic**: Statistics aggregation (date, statistic_type, content as JSON)

### APIs (`operation.ts`, `statistic.ts`)

Location:

- `/d/coding/editor/apps/desktop/src/commands/operation.ts`
- `/d/coding/editor/apps/desktop/src/commands/statistic.ts`

**Operation APIs:**

- `getLatestOperations(number)`: Returns cards, articles, projectItems, documentItems
- `getOperationsByDates(dates[], contentType)`: Operations by specific dates
- `getOperationsByDateRange(startDate, endDate, contentType)`: Operations in date range
- `analyzeOperations(params)`: Analyze operations data

**Statistic APIs:**

- `getCalendarHeatmap(year)`: Year-long heatmap of operations
- `getStatisticByDate(date)`: Stats for specific date
- `getStatisticByType(type)`: Stats by type
- `getStatisticByDateAndType(date, type)`: Combined filter
- `getStatisticByDateRange(startDate, endDate)`: Range query
- `getStatisticByDateRangeAndType(startDate, endDate, type)`: Range + type query
- `getAllStatistic()`: All statistics

---

## Additional Data Sources

### Time Tracking

- **time_record table** (not in provided schemas but referenced in stores)
- Store: `/d/coding/editor/apps/desktop/src/stores/useTimeRecordStore.ts`
- Command: `/d/coding/editor/apps/desktop/src/commands/time-record.ts`

### Media Content

- **PDFs**: `pdfs`, `pdf_annotations`, `pdf_bookmarks`, `pdf_chats` (`10_core.sql`)
- **EPUBs**: `epubs`, `epub_annotations`, `epub_bookmarks` (`50_learning.sql`)
- **Video Notes**: `video_notes`, `video_note_item`, `video_note_chats` (`10_core.sql`)
- **Audio Notes**: `audio_notes`, `audio_note_item`, `audio_note_chats` (`10_core.sql`)
- **Podcasts**: `podcasts` (`10_core.sql`)

### Resources

- **resources**: File resources with grouping (`40_resource.sql`)
- **web_clip**: Web clippings (`40_resource.sql`)
- **web_link**: Web links (`40_resource.sql`)
- **web_note**: Web notes (`40_resource.sql`)

### Integrations

- **Weread**: `weread_notebook`, `weread_view`, `weread_config` (`50_learning.sql`)
- **Notion**: `notion_sync` (`50_learning.sql`)

---

## State Management Architecture

The application uses **Zustand** for state management with:

- **Persist middleware**: For persisting selected state to localStorage
- **Devtools middleware**: For debugging (some stores)
- **Immer/Produce**: For immutable state updates (some stores)

### Common Patterns:

1. **Loading states**: Separate loading flags for different operations
2. **Active item tracking**: activeGroupId, activeItemId patterns
3. **Pagination**: Page size constants (50 for RSS entries, 100 for Pomodoro sessions)
4. **Filter states**: Multiple filter options with local filtering
5. **UI state**: Panel visibility, widths, view modes stored in state
6. **Real-time sync**: WebSocket notifications for live updates (Pomodoro, RSS)

### Command Layer

- All commands use Electron IPC via `invoke()` function
- Consistent async/await patterns
- Type-safe command parameters and returns
- Located in: `/d/coding/editor/apps/desktop/src/commands/`

---

## Summary of Available Analytics

1. **Todo System**: Group stats (total, completed, system group stats)
2. **Flashcard System**: Review statistics (review count, intervals, ease factors)
3. **Pomodoro System**: Daily/total focus time and session counts
4. **RSS System**: Unread counts per feed, starred counts, entry counts by category
5. **Question System**: Group stats (total, answered, unanswered)
6. **Operation Logging**: Recent operations, calendar heatmaps, operation analysis
7. **Statistics System**: Date-based and type-based aggregations
8. **Notes System**: Word counts in contents and diary entries
9. **Calendar System**: Event counts and date-based event loading
10. **Time Records**: Time tracking data (external to main schemas reviewed)

All systems support filtering, searching, and pagination where appropriate.
