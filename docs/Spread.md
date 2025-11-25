# Spread Plugin

The Spread Plugin controls page layout, letting you switch between single-page and two-page “spread” views similar to an open book. It is purely logical; it changes how pages are grouped before rendering and does not ship UI components.

## Installation

Install the plugin from NPM.

```bash
pnpm add @embedpdf/plugin-spread
```

## Registration

Import `SpreadPluginPackage` and add it to the `plugins` array. Configure the default layout mode when the viewer loads.

```tsx
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
// ... other imports
import { SpreadPluginPackage, SpreadMode } from "@embedpdf/plugin-spread/react";

const plugins = [
  // ... other essential plugins
  createPluginRegistration(LoaderPluginPackage, {
    /* ... */
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),

  // Register and configure the spread plugin
  createPluginRegistration(SpreadPluginPackage, {
    defaultSpreadMode: SpreadMode.None,
  }),
];
```

## Usage

`useSpread` controls the layout mode. Changing the mode recalculates page groupings, and `<Scroller />` automatically updates to reflect the new layout.

### Building a Spread Mode Toolbar

Use `useSpread` to read the current `spreadMode` and change it via the provided capability. Build UI elements such as buttons to switch layouts.

```tsx
import { SpreadMode } from "@embedpdf/plugin-spread";
import { useSpread } from "@embedpdf/plugin-spread/react";

export const SpreadToolbar = () => {
  const { provides: spread, spreadMode } = useSpread();

  if (!spread) return null;

  return (
    <div>
      <span>Current Layout: {spreadMode}</span>
      <button onClick={() => spread.setSpreadMode(SpreadMode.None)}>
        Single Page
      </button>
      <button onClick={() => spread.setSpreadMode(SpreadMode.Odd)}>
        Two-Page (Odd)
      </button>
      <button onClick={() => spread.setSpreadMode(SpreadMode.Even)}>
        Two-Page (Even)
      </button>
    </div>
  );
};
```

## API Reference

### Configuration (`SpreadPluginConfig`)

| Option              | Type       | Description                                                            |
| ------------------- | ---------- | ---------------------------------------------------------------------- |
| `defaultSpreadMode` | SpreadMode | Initial page layout when a document loads. Default: `SpreadMode.None`. |

### Hook: `useSpread()`

Connects components to the spread plugin’s state and functions.

| Property     | Type                       | Description                                                          |
| ------------ | -------------------------- | -------------------------------------------------------------------- |
| `spreadMode` | SpreadMode                 | Current reactive spread mode (`'none'`, `'odd'`, or `'even'`).       |
| `provides`   | `SpreadCapability \| null` | Methods to control the layout, or `null` if the plugin is not ready. |

#### `SpreadCapability` Methods

| Method                | Description                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `setSpreadMode(mode)` | Sets the layout to the specified `SpreadMode`, causing the viewer to re-render with the new groupings. |
| `getSpreadMode()`     | Returns the current `SpreadMode`.                                                                      |

### SpreadMode Enum

Determines how pages are grouped.

| Mode   | Description                                                                                       | Page Grouping Example             |
| ------ | ------------------------------------------------------------------------------------------------- | --------------------------------- |
| `None` | Default view; each page displays individually.                                                    | `[[p1], [p2], [p3], ...]`         |
| `Odd`  | Pages are paired starting from the first page (ideal when page 1 is on the right-hand side).      | `[[p1, p2], [p3, p4], ...]`       |
| `Even` | Page 1 is standalone, and subsequent pages are paired (ideal for books with a single cover page). | `[[p1], [p2, p3], [p4, p5], ...]` |
