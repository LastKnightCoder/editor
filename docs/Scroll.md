# Scroll Plugin

The Scroll Plugin is responsible for page layout, virtualization, and navigation. It provides the essential `<Scroller />` component—which intelligently renders only visible pages for high performance—and the `useScroll` hook for building navigation controls.

## Installation

This plugin depends on the Viewport plugin. Install both packages.

```bash
pnpm add @embedpdf/plugin-scroll @embedpdf/plugin-viewport
```

## Registration

Import `ScrollPluginPackage` and its Viewport dependency, then add them to the `plugins` array.

```tsx
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
// ... other imports
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import {
  ScrollPluginPackage,
  ScrollStrategy,
} from "@embedpdf/plugin-scroll/react";

const plugins = [
  // ... other essential plugins
  createPluginRegistration(LoaderPluginPackage, {
    /* ... */
  }),
  createPluginRegistration(RenderPluginPackage),

  // Register dependencies first
  createPluginRegistration(ViewportPluginPackage),

  // Register and configure the scroll plugin
  createPluginRegistration(ScrollPluginPackage, {
    strategy: ScrollStrategy.Vertical, // or Horizontal
    initialPage: 1,
  }),
];
```

## Usage

Use `<Scroller />` for rendering pages and `useScroll` for navigation.

### `<Scroller />` and the `renderPage` Prop

`<Scroller />` must live inside `<Viewport />`. It does not render pages by itself. Instead, it calculates which pages should be visible and calls the function you provide to its `renderPage` prop. This gives you full control over each page placeholder.

```tsx
import { RenderLayer } from "@embedpdf/plugin-render/react";

// ...
<Scroller
  renderPage={({ pageIndex, width, height, scale }) => (
    // This function is called for each visible page
    <div style={{ width, height, position: "relative" }}>
      <RenderLayer pageIndex={pageIndex} scale={scale} />
    </div>
  )}
/>;
```

### Page Navigation

`useScroll` provides everything you need to build a navigation UI, including action methods and reactive state such as the current page number.

```tsx
import { useScroll } from "@embedpdf/plugin-scroll/react";

const PageControls = () => {
  const { provides: scroll, state } = useScroll();

  return (
    <div>
      <span>
        Page {state.currentPage} of {state.totalPages}
      </span>
      <button onClick={() => scroll?.scrollToNextPage()}>Next</button>
    </div>
  );
};
```

## API Reference

### Configuration (`ScrollPluginConfig`)

| Option        | Type             | Description                                                                                                      |
| ------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `strategy`    | `ScrollStrategy` | Scroll direction (`ScrollStrategy.Vertical` or `ScrollStrategy.Horizontal`). Default: `ScrollStrategy.Vertical`. |
| `pageGap`     | number           | Space in pixels between pages or spreads. Default: `10`.                                                         |
| `initialPage` | number           | 1-based page number to show when the document first loads.                                                       |
| `bufferSize`  | number           | Number of pages to render outside the visible area for smoother scrolling. Default: `2`.                         |

### Component: `<Scroller />`

Virtualized container that lays out pages.

| Prop         | Type                   | Description                                                                                                                    |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `renderPage` | `(props) => ReactNode` | **Required.** Function called for each visible page. Receives layout data such as `pageIndex`, `width`, `height`, and `scale`. |

### Hook: `useScroll()`

Convenience hook for building page navigation UIs. Returns a `provides` object for actions and a `state` object with reactive data.

| Property   | Type                       | Description                                                        |
| ---------- | -------------------------- | ------------------------------------------------------------------ |
| `provides` | `ScrollCapability \| null` | Methods to control scrolling and navigation (`null` if not ready). |
| `state`    | object                     | Current reactive scroll state.                                     |

#### `state` Properties

| Property      | Type   | Description                                       |
| ------------- | ------ | ------------------------------------------------- |
| `currentPage` | number | Page number that is most visible in the viewport. |
| `totalPages`  | number | Total number of pages in the document.            |

#### `ScrollCapability` Methods

| Method                   | Description                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `scrollToPage(options)`  | Scrolls to a specific page. Accepts `pageNumber` and optional `behavior: 'smooth'`. |
| `scrollToNextPage()`     | Scrolls to the next page or spread.                                                 |
| `scrollToPreviousPage()` | Scrolls to the previous page or spread.                                             |
