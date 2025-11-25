# Viewport Plugin

The Viewport Plugin is foundational for any viewer. It provides the `<Viewport />` component, which acts as the scrollable window users look through. It tracks its own dimensions and scroll position and shares that information with other plugins.

## Installation

Install the plugin from NPM.

```bash
pnpm add @embedpdf/plugin-viewport
```

## Registration

Import `ViewportPluginPackage` and add it to the `plugins` array. Every viewer build should include this plugin.

```tsx
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
// ... other imports
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";

const plugins = [
  // ... other essential plugins
  createPluginRegistration(LoaderPluginPackage, {
    /* ... */
  }),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),

  // Register and configure the viewport plugin
  createPluginRegistration(ViewportPluginPackage, {
    viewportGap: 10, // Adds 10px of padding inside the viewport
  }),
];
```

## Usage

Use `<Viewport />` to wrap your `<Scroller />` and interact with it using the provided hooks.

### `<Viewport />` Component

`<Viewport />` is the main scrollable container. Place it in your layout with a defined size (for example, `height: '500px'` or `flex-grow: 1`). It automatically listens to scroll and resize events.

```tsx
// Inside your viewer component
<div style={{ height: "500px", display: "flex" }}>
  <Viewport>{/* ... */}</Viewport>
</div>
```

### Programmatic Scrolling

Control the viewport’s scroll position from other components using `useViewportCapability`. This is useful for “Scroll to top” buttons or navigation from a table of contents.

```tsx
import { useViewportCapability } from "@embedpdf/plugin-viewport/react";

const MyToolbar = () => {
  const { provides: viewport } = useViewportCapability();

  const scrollToTop = () => {
    viewport?.scrollTo({ x: 0, y: 0, behavior: "smooth" });
  };

  return <button onClick={scrollToTop}>Scroll to Top</button>;
};
```

### Monitoring Scroll Activity

`useViewportScrollActivity` returns the current scrolling state so you can build UIs that react to user movement (for example, auto-hiding toolbars).

## API Reference

### Configuration (`ViewportPluginConfig`)

| Option           | Type   | Description                                                                                    |
| ---------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `viewportGap`    | number | Padding (pixels) applied around the content inside the viewport. Default: `10`.                |
| `scrollEndDelay` | number | Milliseconds after the last scroll event before `isScrolling` becomes `false`. Default: `300`. |

### Component: `<Viewport />`

`div`-based scrollable container. Accepts all standard `div` props like `style` and `className`.

### Hook: `useViewportCapability()`

Connects your component to viewport functions.

| Property   | Type                         | Description                                                    |
| ---------- | ---------------------------- | -------------------------------------------------------------- |
| `provides` | `ViewportCapability \| null` | Methods to interact with the viewport, or `null` if not ready. |

#### `ViewportCapability` Methods

| Method               | Description                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `getMetrics()`       | Returns `ViewportMetrics` containing current dimensions, scroll offsets, and total scrollable area. |
| `scrollTo(position)` | Programmatically scrolls the viewport. Accepts `x`, `y`, `behavior: 'smooth'`, and `center: true`.  |
| `getBoundingRect()`  | Returns the `Rect` of the viewport element relative to the browser viewport.                        |

### Hook: `useViewportScrollActivity()`

Tracks viewport scroll state.

| Property            | Type    | Description                                                           |
| ------------------- | ------- | --------------------------------------------------------------------- |
| `isScrolling`       | boolean | `true` while the user scrolls or a smooth scroll animation runs.      |
| `isSmoothScrolling` | boolean | `true` only during smooth scroll animations initiated via `scrollTo`. |

_Last updated on October 28, 2025._
