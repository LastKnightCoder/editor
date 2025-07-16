# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a desktop knowledge management application built with **Electron + React + TypeScript**, implementing a card-based note-taking system inspired by the Zettelkasten method. The application features rich text editing, project management, knowledge graph visualization, and AI-assisted features.

## Quick Start

### Prerequisites

```bash
npm install -g pnpm
```

### Development

```bash
pnpm install          # Install dependencies
pnpm dev              # Start development server
pnpm build            # Build for production
```

### Testing

```bash
pnpm test             # Run tests in watch mode
pnpm test:run         # Run tests once
pnpm test:ui          # Open Vitest UI
```

### Release

```bash
pnpm release          # Create release
pnpm updater          # Update app
```

## Architecture

### Technology Stack

- **Frontend**: React 18.2 + TypeScript + Slate.js (rich text editor)
- **Backend**: Electron 34.0 main process
- **Database**: SQLite via better-sqlite3 with sqlite-vec for vector search
- **Styling**: Tailwind CSS 4.1 + Ant Design
- **State**: Zustand for state management
- **Build**: Vite 4.3 + electron-builder

### Key Directories

```bash
src/                    # React frontend
├── components/         # Reusable React components
├── pages/             # Route-based page components
├── stores/            # Zustand state management
├── commands/          # API commands for Electron IPC
├── editor-extensions/ # Slate editor extensions
└── types/             # TypeScript type definitions

src-electron/          # Electron main process
├── main/              # Main process modules
│   ├── modules/       # Core modules (database, file, etc.)
│   └── utils/         # Utility modules
└── preload/           # Preload scripts for IPC
```

## Database Structure

### Core Tables

- **contents**: Central content storage (referenced by cards, articles, documents)
- **cards**: Individual note cards with tags and links
- **articles**: Long-form content with metadata
- **documents**: Hierarchical document structure
- **projects**: Project management with task organization
- **daily_notes**: Daily journaling
- **whiteboard**: Interactive whiteboard data (stores metadata)
- **white_boards**: Whiteboard metadata (id, title, description, tags, snapshot)
- **white_board_contents**: Actual whiteboard data (id, name, data JSON, ref_count)
- **vec_document**: Vector embeddings for semantic search

### Data Strategy

- **Content reuse**: Single content table prevents duplication
- **Hierarchical structures**: JSON arrays for tree relationships
- **Cross-references**: Cards, articles, documents can reference each other
- **Vector search**: SQLite extension for semantic similarity

## Development Patterns

### Adding New Features

1. **Database**: Add table in `src-electron/main/modules/tables/`
2. **API**: Add methods to table class and IPC handlers
3. **Types**: Define TypeScript interfaces in `src/types/`
4. **Commands**: Add API methods in `src/commands/`
5. **UI**: Create React components in appropriate page/view
6. **Editor**: Add extensions if needed in `src/components/Editor/extensions/`

## Editor System

### Slate-based Rich Text Editor

- **40+ extensions**: AI, tables, whiteboards, code blocks, etc.
- **Plugin architecture**: Easy to add new block types
- **Hotkey system**: Configurable keyboard shortcuts
- **Hovering toolbar**: Context-sensitive formatting
- **Block panel**: Visual block insertion

### Key Editor Features

- **Real-time collaboration**: Cross-window synchronization
- **Content reuse**: Reference existing content blocks
- **Rich media**: Images, PDFs, videos, whiteboards
- **AI integration**: Content generation and assistance

## Whiteboard System

### Overview

The whiteboard system is a sophisticated interactive SVG-based canvas for visual thinking, diagramming, and presentation creation. It operates both as a standalone feature and as embeddable content within the rich text editor.

### Architecture

- **Plugin-based Design**: Modular architecture with dedicated plugins for each element type
- **Event-Driven**: Real-time updates via EventEmitter
- **Immutability**: Immer-based state management with draft modifications
- **MVC Pattern**: Clear separation of data, presentation, and control

### Data Structure

- **Board Elements**: JSON-serializable objects with type-specific properties
- **Viewport Management**: Infinite canvas with zoom/pan support
- **Presentation System**: Multi-sequence, frame-based presentations

### Element Types

- **Geometry**: Rectangles, circles, lines with full styling
- **Arrows**: Straight/curved connectors with anchor points
- **Rich Text**: Formatted text blocks with editor integration
- **Cards**: Knowledge base-linked note cards
- **Media**: Images, videos, web content embedding
- **Mind Maps**: Hierarchical node-based diagrams

### Key Features

- **Real-time Sync**: Changes reflect across all windows
- **Infinite Canvas**: Unlimited workspace with viewport management
- **Presentation Mode**: Full-screen presentations with frame navigation
- **Grouping System**: Element grouping and batch operations
- **Snap-to-Grid**: Configurable alignment and grid system
- **Undo/Redo**: 100-step history with state snapshots
- **Export**: PNG/JPG snapshots, JSON data export

### File Structure

```bash
src/components/WhiteBoard/
├── Board.tsx                 # Core board controller
├── plugins/                  # Element type handlers (15+ plugins)
├── components/               # UI components (toolbar, panels)
├── hooks/                    # React hooks for board operations
├── utils/                    # Utility functions
├── transforms/               # Data transformation logic
└── types/                    # TypeScript definitions
```

## Testing Strategy

### Test Types

- **Unit tests**: Utility functions and data transformations
- **Integration tests**: Database operations
- **Component tests**: React components with Vitest
- **E2E tests**: Critical user flows

### Testing Commands

```bash
pnpm test             # Watch mode
pnpm test:run         # Single run
pnpm test:ui          # Interactive UI
```

## Performance Considerations

### Large Dataset Handling

- **Pagination**: Use for lists and search results
- **Virtualization**: React Virtual for long lists
- **Lazy loading**: Content loaded on demand
- **Memory management**: Reference counting for content reuse

### Search & Discovery

- **Full-text search**: SQLite FTS5
- **Vector search**: Semantic similarity
- **Tag-based organization**: Flexible categorization
- **Knowledge graph**: Visual relationship mapping

## Security & Data Integrity

### File Access

- **Restricted**: Only user data directory
- **No external access**: Sandboxed file operations

### Data Protection

- **Transactions**: All database operations are transactional
- **Backup**: Automatic WAL checkpointing
- **Migration**: Automatic schema upgrades
- **Content sanitization**: XSS protection in editor

## Common Tasks

### Adding a New Content Type

1. Create table schema in `src-electron/main/modules/tables/`
2. Add TypeScript interface in `src/types/`
3. Create command handler in `src/commands/`
4. Add UI components in appropriate page directory
5. Update editor extensions if needed

### Creating New Whiteboard Element Type

1. Create plugin in `src/components/WhiteBoard/plugins/`
2. Define element interface in `src/components/WhiteBoard/types/`
3. Add rendering logic in plugin file
4. Register plugin in `Board.tsx`
5. Add toolbar button in `Toolbar` component
6. Handle serialization/deserialization in transforms

### Creating New Editor Extension

1. Add extension file in `src/components/Editor/extensions/`
2. Register extension in `src/components/Editor/extensions/index.ts`
3. Add block panel item if needed
4. Update hotkey system if required

### Adding New Page/View

1. Create directory in `src/pages/`
2. Add route in `src/router.tsx`
3. Create store in `src/stores/` if needed
4. Add navigation/menu items as appropriate

## Code Style Guidelines

- Use arrow functions.
- Before finishing, run `npm run lint` to check for type errors, unused variables, and unused function parameters. If there are unused variables, remove them (you can pass parameters to only check the files you modified).
