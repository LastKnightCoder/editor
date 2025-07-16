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

```
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
- **whiteboard**: Interactive whiteboard data
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

### Common Patterns

```typescript
// IPC communication
const result = await ipcRenderer.invoke("command-name", data);

// State management
const useStore = create<Store>((set, get) => ({
  items: [],
  loadItems: async () => {
    const items = await command.getAll();
    set({ items });
  },
}));

// Content loading
const [content, setContent] = useState();
useEffect(() => {
  const loadContent = async () => {
    const content = await contentCommand.getById(id);
    setContent(content);
  };
  loadContent();
}, [id]);
```

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

- 使用箭头函数
- 在结束之前使用 npm run lint 检查类型错误和没有使用到的变量、未使用的函数参数，如果存在则删除
