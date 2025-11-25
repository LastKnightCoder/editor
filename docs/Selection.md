# Selection Plugin

The Selection Plugin enables users to select text within the PDF document, just like on a standard webpage. It provides the `<SelectionLayer />` to visually highlight selected text and a rich API to read the selection.

## Installation

This plugin depends on the Interaction Manager plugin. Install both packages.

```bash
pnpm add @embedpdf/plugin-selection @embedpdf/plugin-interaction-manager
```

## Registration

Import `SelectionPluginPackage` and its `InteractionManager` dependency, then add them to the `plugins` array. Register the Selection plugin after its dependency.

```tsx
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
// ... other imports
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager/react";
import { SelectionPluginPackage } from "@embedpdf/plugin-selection/react";

const plugins = [
  // ... other essential plugins
  createPluginRegistration(LoaderPluginPackage, {
    /* ... */
  }),

  // Register dependency first
  createPluginRegistration(InteractionManagerPluginPackage),

  // Register the selection plugin
  createPluginRegistration(SelectionPluginPackage),
];
```

## Usage

The plugin exposes the `<SelectionLayer />` component for UI and the `useSelectionCapability` hook for interacting with selection data.

### Displaying the Selection

To highlight text, place `<SelectionLayer />` inside the `<Scroller />` `renderPage` prop. For selection to work correctly, it must be a child of `<PagePointerProvider>`.

```tsx
import { PagePointerProvider } from "@embedpdf/plugin-interaction-manager/react";
import { SelectionLayer } from "@embedpdf/plugin-selection/react";

// ...
<Scroller
  renderPage={({ width, height, pageIndex, scale, rotation }) => (
    <PagePointerProvider {...{ width, height, pageIndex, scale, rotation }}>
      <RenderLayer pageIndex={pageIndex} scale={scale} />
      <SelectionLayer pageIndex={pageIndex} scale={scale} />
    </PagePointerProvider>
  )}
/>;
```

### Interacting with the Selection

`useSelectionCapability` lets you work with selected text. The plugin handles clipboard logic when you call `provides.copyToClipboard()`. Use the `onSelectionChange` event to know when a selection exists—useful for enabling or disabling a “Copy” button.

```tsx
import { useState, useEffect } from "react";
import {
  useSelectionCapability,
  SelectionRangeX,
} from "@embedpdf/plugin-selection/react";

const SelectionToolbar = () => {
  const { provides: selection } = useSelectionCapability();
  const [hasSelection, setHasSelection] = useState(false);

  useEffect(() => {
    if (!selection) return;
    return selection.onSelectionChange((sel: SelectionRangeX | null) => {
      setHasSelection(!!sel);
    });
  }, [selection]);

  return (
    <button
      onClick={() => selection?.copyToClipboard()}
      disabled={!hasSelection}
    >
      Copy
    </button>
  );
};
```

## API Reference

### Component: `<SelectionLayer />`

Renders the blue rectangles over selected text.

| Prop         | Type   | Description                                            |
| ------------ | ------ | ------------------------------------------------------ |
| `pageIndex`  | number | **Required.** Index of the page this layer is on.      |
| `scale`      | number | **Required.** Current scale of the page.               |
| `background` | string | Optional highlight color. Default: `rgba(33,150,243)`. |

### Hook: `useSelectionCapability()`

Connects components to the selection plugin’s state and functions.

| Property   | Type                          | Description                                                                   |
| ---------- | ----------------------------- | ----------------------------------------------------------------------------- |
| `provides` | `SelectionCapability \| null` | Methods to interact with the selection, or `null` if the plugin is not ready. |

#### `SelectionCapability` Methods

| Method                    | Description                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `copyToClipboard()`       | Copies the currently selected text to the user’s clipboard.                                                   |
| `getSelectedText()`       | Returns a `Task<string[]>` that resolves with the selected text (one string per line).                        |
| `getFormattedSelection()` | Returns an array describing the selection on each page, including bounding boxes and highlight rectangles.    |
| `onSelectionChange`       | Event hook that fires when text selection is created, updated, or cleared.                                    |
| `onEndSelection`          | Event hook that fires when the user finishes selecting text (mouse up); ideal for fetching selection content. |
