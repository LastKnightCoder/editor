# Editor Architecture Documentation

## Overview

The Editor component is a sophisticated rich text editor built on top of Slate.js framework. It implements a plugin-based architecture with 40+ extensions supporting various content types including text formatting, media, code blocks, tables, mathematical expressions, diagrams, and embedded whiteboards.

## Core Architecture

### Technology Stack

- **Slate.js**: Core rich text editing framework
- **React**: Component rendering and state management
- **TypeScript**: Type safety and development experience
- **Zustand**: Local state management for UI components
- **CodeMirror**: Code editing within code blocks
- **React Icons**: Icon system

### Key Design Principles

1. **Plugin-based Architecture**: Each content type is an independent extension
2. **Immutable Data Flow**: All state changes use Immer for immutability
3. **Performance Optimization**: Extensive use of React.memo and useMemo
4. **Type Safety**: Comprehensive TypeScript definitions for all elements
5. **Accessibility**: Proper ARIA attributes and keyboard navigation

## Directory Structure

```
src/components/Editor/
├── components/                 # Core UI components
│   ├── AddParagraph/          # Paragraph insertion UI
│   ├── BlockPanel/            # Slash command block panel
│   ├── ColorSelect/           # Color picker components
│   ├── FormattedText/         # Text formatting UI
│   ├── Highlight/             # Text highlighting
│   ├── HoveringToolbar/       # Contextual formatting toolbar
│   ├── ImageUploader/         # Image upload interface
│   └── ImagesOverview/        # Image gallery
├── constants/                 # Configuration constants
│   ├── gallery.ts            # Image gallery settings
│   ├── index.ts              # Main constants export
│   └── styled-color.ts       # Color definitions
├── extensions/               # 40+ content type extensions
│   ├── base.ts               # Base extension class
│   ├── types.ts              # Extension interface definitions
│   ├── paragraph/            # Basic paragraph extension
│   ├── image/                # Image embedding
│   ├── code-block/           # Syntax highlighted code
│   ├── table/                # Table support
│   ├── math/                 # Mathematical expressions
│   ├── whiteboard/           # Embedded whiteboards
│   └── [40+ other extensions] # Audio, video, AI, etc.
├── hooks/                    # React hooks
│   ├── useDragAndDrop.ts     # Drag and drop functionality
│   ├── useHideHeaderDecoration.ts
│   ├── useImageResize.ts     # Image resizing
│   ├── useTheme.ts           # Theme integration
│   └── useUploadResource.ts  # File upload handling
├── hotkeys/                  # Keyboard shortcut system
│   ├── formattedText.ts      # Text formatting shortcuts
│   ├── index.ts              # Hotkey configuration
│   ├── inline.ts             # Inline element shortcuts
│   └── slashCommand.ts       # Slash command shortcuts
├── plugins/                  # Core Slate plugins
│   ├── withNormalize.ts      # Normalization plugin
│   ├── withSlashCommands.ts  # Slash command handling
│   └── withUploadResource.ts # File upload plugin
├── stores/                   # Zustand state management
│   ├── useBlockPanelStore.ts # Block panel state
│   └── useImagesOverviewStore.ts # Image gallery state
├── types/                    # TypeScript definitions
│   ├── block-panel.ts        # Block panel types
│   ├── custom-element.ts     # Custom element union types
│   ├── editor.ts             # Editor interface extensions
│   ├── element/              # Individual element types
│   ├── hotkeys.ts            # Hotkey configuration types
│   ├── hovering-bar.ts       # Toolbar configuration types
│   ├── index.ts              # Main types export
│   └── text.ts               # Text node types
└── utils/                    # Utility functions
    ├── PluginOptimizer.ts    # Plugin performance optimization
    ├── editor.ts             # Editor manipulation utilities
    ├── element.ts            # Element type checking
    ├── hotkey.ts             # Hotkey registration
    ├── index.ts              # Main utils export
    ├── insertElement.ts      # Element insertion helpers
    ├── multi-columns-layout.ts
    ├── pasteImage.ts         # Image paste handling
    ├── path.ts               # Path utilities
    ├── plugin.ts             # Plugin creation helpers
    └── table.ts              # Table-specific utilities
```

## Extension System Architecture

### Base Extension Class

All extensions extend from `Base` class and implement `IExtension` interface:

```typescript
interface IExtension {
  type: string; // Unique element type
  getPlugins: () => Plugin[]; // Slate plugins
  render: (props: RenderElementProps) => JSX.Element; // React renderer
  getHotkeyConfigs: () => IHotKeyConfig[]; // Keyboard shortcuts
  getBlockPanelItems: () => IBlockPanelListItem[]; // Block panel items
  getHoveringBarElements: () => IConfigItem[]; // Toolbar items
}
```

### Extension Implementation Pattern

```typescript
class ParagraphExtension extends Base implements IExtension {
  override type = "paragraph";

  override getPlugins() {
    return [
      inlineCode,
      normalizeParagraph,
      createBlockElementPlugin(this.type),
    ];
  }

  override getHoveringBarElements() {
    return hoveringElements;
  }

  render(props: RenderElementProps) {
    return <MemoizedParagraphRenderer {...props} />;
  }
}
```

### Plugin System

Extensions use Slate plugins to modify editor behavior:

- **Block Elements**: `createBlockElementPlugin(type)`
- **Inline Elements**: `createInlineElementPlugin(type)`
- **Void Elements**: `createVoidElementPlugin(type)`
- **Custom Plugins**: Element-specific behavior modification

## Element Type System

### Custom Element Types

All elements are defined in `src/components/Editor/types/element/`:

```typescript
export interface ParagraphElement {
  type: "paragraph";
  children: Array<InlineElement | FormattedText>;
  disableDrag?: boolean;
}
```

### Element Union Types

All element types are combined in `custom-element.ts`:

```typescript
export type CustomElement =
  | ParagraphElement
  | HeaderElement
  | ImageElement
  | CodeBlockElement
  | TableElement
  | // ... 40+ other element types
```

### Text Formatting

Text nodes support rich formatting through marks:

```typescript
export interface FormattedText {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  highlight?: boolean;
  code?: boolean;
  color?: string;
  backgroundColor?: string;
}
```

## UI Components Architecture

### Block Panel (Slash Commands)

- Triggered by typing "/"
- Context-aware positioning
- Fuzzy search through extension keywords
- Keyboard navigation support

```typescript
// Block panel state management
const useBlockPanelStore = create<IState & IActions>((set, get) => ({
  blockPanelVisible: false,
  position: { x: 0, y: 0 },
  inputValue: "",
  list: [],
  // ... actions for filtering and selection
}));
```

### Hovering Toolbar

- Context-sensitive formatting options
- Positioned based on text selection
- Extension-specific toolbar items

### Component Patterns

1. **Memoization**: All components use React.memo for performance
2. **Props Interface**: Consistent `I[Component]Props` naming
3. **Children Handling**: Proper `React.PropsWithChildren` usage
4. **Style Modules**: CSS modules with `.module.less` extension

## Hotkey System

### Configuration Structure

```typescript
interface IHotKeyConfig {
  hotKey: string; // Keyboard combination
  action: (editor, event) => void; // Action handler
  when?: (editor) => boolean; // Conditional activation
}
```

### Hotkey Categories

- **Text Formatting**: `mod+b`, `mod+i`, `mod+u`
- **Element Navigation**: Arrow keys, Tab/Shift+Tab
- **Block Operations**: Enter, Backspace, Delete
- **Slash Commands**: "/" trigger

### Implementation Pattern

```typescript
export const formattedText: IHotKeyConfig[] = [
  {
    hotKey: "mod+b",
    action: markAction("bold"),
  },
  // ... more hotkeys
];
```

## Data Flow and State Management

### Editor State

- **Slate Editor**: Core editing state managed by Slate
- **React Context**: `EditorContext` for theme and upload handling
- **Zustand Stores**: UI state (block panel, image gallery)

### Content Flow

1. **User Input**: Keyboard/mouse events
2. **Plugin Processing**: Slate plugins modify behavior
3. **State Updates**: Slate updates internal state
4. **React Re-render**: Components re-render based on state changes
5. **DOM Updates**: React updates the DOM

### Extension Registration

```typescript
// Extensions are registered at startup
export const startExtensions = [
  paragraph,
  underline,
  header,
  image,
  codeBlock,
  table,
  math,
  whiteboard,
  // ... 40+ extensions
];
```

## Performance Optimizations

### Plugin Optimization

- Extensions cached to prevent re-creation
- Plugin results memoized
- Lazy loading for complex components

### Component Optimization

```typescript
// Memoized component pattern
const MemoizedComponent = React.memo(
  ({ element, attributes, children }) => {
    return <Component {...props}>{children}</Component>;
  },
  (prevProps, nextProps) => {
    // Custom comparison logic
    return prevProps.element === nextProps.element;
  }
);
```

### Rendering Optimization

- Virtual scrolling for large documents
- Lazy loading for images and media
- Debounced updates for expensive operations

## Development Patterns

### Creating New Extensions

1. **Define Element Type**

```typescript
// In src/components/Editor/types/element/
export interface NewElement {
  type: "new-element";
  children: Array<InlineElement | FormattedText>;
  // custom properties
}
```

2. **Create Extension Class**

```typescript
// In src/components/Editor/extensions/
class NewExtension extends Base implements IExtension {
  type = "new-element";

  getPlugins() {
    return [createBlockElementPlugin(this.type)];
  }

  render(props) {
    return <NewElementComponent {...props} />;
  }
}
```

3. **Add to Element Union**

```typescript
// In custom-element.ts
export type CustomElement =
  | // ... existing elements
  | NewElement;
```

4. **Register Extension**

```typescript
// In extensions/index.ts
export const newElement = new NewExtension();
```

### Component Development Guidelines

1. **Type Safety**: Always use proper TypeScript interfaces
2. **Memoization**: Wrap components in React.memo
3. **Props Interface**: Use `I[Component]Props` naming convention
4. **Children**: Use `React.PropsWithChildren` when needed
5. **Styling**: Use CSS modules with `.module.less`
6. **Performance**: Use `useMemo` and `useCallback` for expensive operations

### Plugin Development

1. **Plugin Function**: Export a function that takes editor and returns modified editor
2. **Preserve Original**: Always call original editor methods
3. **Type Safety**: Use proper TypeScript types
4. **Testing**: Test with various editor states

## Common Utilities

### Element Insertion

```typescript
// Insert element at current cursor position
insertImage(editor, {
  url: "image-url",
  alt: "description",
  width: 400,
  height: 300,
});
```

### Text Formatting

```typescript
// Apply text formatting
Editor.addMark(editor, "bold", true);
Editor.removeMark(editor, "italic");
```

### Element Navigation

```typescript
// Get current element
const [currentElement] = getClosestCurrentElement(editor);

// Check element type
const isParagraph = isParagraphElement(element);
```

## Testing Considerations

### Unit Testing

- Test individual extensions in isolation
- Mock Slate editor for plugin testing
- Test hotkey configurations

### Integration Testing

- Test extension interactions
- Verify data flow between components
- Test serialization/deserialization

### Performance Testing

- Monitor render performance with large documents
- Test memory usage with many extensions
- Verify plugin optimization effectiveness

## Troubleshooting

### Common Issues

1. **Extension Not Rendering**

   - Verify type registration in custom-element.ts
   - Check extension export in index.ts
   - Ensure proper React.memo usage

2. **Hotkeys Not Working**

   - Verify hotkey registration in extension
   - Check for conflicting hotkeys
   - Test with different selection states

3. **Performance Issues**

   - Check for missing React.memo
   - Verify plugin caching
   - Monitor component re-renders

4. **Type Errors**
   - Ensure all element types are properly exported
   - Check custom-element.ts union type
   - Verify extension interface implementation

## Best Practices

### Code Organization

- Keep extensions focused and single-purpose
- Use consistent naming conventions
- Document complex plugin logic
- Separate UI components from logic

### Performance

- Always use React.memo for components
- Cache expensive computations
- Lazy load heavy components
- Optimize re-render conditions

### Maintainability

- Write comprehensive TypeScript definitions
- Add JSDoc comments for complex functions
- Test edge cases thoroughly
- Follow established patterns consistently

This architecture enables easy extension of the editor with new content types while maintaining performance and type safety throughout the system.
