# Zoom Plugin

The Zoom Plugin provides tools for controlling PDF magnification. It supports standard zoom in/out, preset zoom levels (fit-to-page, fit-to-width), and interactive marquee (area) zoom.

## Installation

Install the zoom plugin and the interaction manager if you plan to use marquee zoom.

```bash
pnpm add @embedpdf/plugin-zoom @embedpdf/plugin-interaction-manager
```

## Registration

Import `ZoomPluginPackage` and, if needed, `InteractionManagerPluginPackage`. Add them to the `plugins` array passed to `<EmbedPDF>`, configuring default zoom behavior as desired.

```tsx
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
// ... other imports
import { ZoomPluginPackage, ZoomMode } from "@embedpdf/plugin-zoom/react";
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager/react";

const plugins = [
  // ... other essential plugins like Loader, Viewport, etc.
  createPluginRegistration(LoaderPluginPackage, {
    /* ... */
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),

  // Register the interaction manager (required for marquee zoom)
  createPluginRegistration(InteractionManagerPluginPackage),

  // Register and configure the zoom plugin
  createPluginRegistration(ZoomPluginPackage, {
    // Set the initial zoom level when a document loads
    defaultZoomLevel: ZoomMode.FitPage,
  }),
];
```

## Usage

Use the `useZoom` hook to connect UI components to zoom state and logic, and `<MarqueeZoom />` for area selection.

### Building a Zoom Toolbar

`useZoom` returns the current zoom state plus methods to change it. Example toolbar:

```tsx
// ZoomToolbar.tsx
import { useZoom } from "@embedpdf/plugin-zoom/react";

export const ZoomToolbar = () => {
  const { provides: zoom, state } = useZoom();

  if (!zoom) {
    return null;
  }

  return (
    <div className="toolbar">
      {/* Display current zoom */}
      <span>{Math.round(state.currentZoomLevel * 100)}%</span>

      {/* Buttons to control zoom */}
      <button onClick={zoom.zoomOut}>-</button>
      <button onClick={zoom.zoomIn}>+</button>
      <button onClick={() => zoom.requestZoom(1.0)}>Reset</button>

      {/* Button to toggle area zoom mode */}
      <button onClick={zoom.toggleMarqueeZoom}>Area Zoom</button>
    </div>
  );
};
```

To visually reflect whether “Area Zoom” is active, read the active mode from the Interaction Manager plugin.

### Adding Marquee (Area) Zoom

Marquee zoom lets users drag to select an area and zoom into it. Place `<MarqueeZoom />` inside the `<Scroller />` `renderPage` prop. It automatically renders the selection rectangle when marquee mode is active.

```tsx
import { PagePointerProvider } from "@embedpdf/plugin-interaction-manager/react";

// Inside your main PDFViewer component
<Scroller
  renderPage={({ width, height, pageIndex, scale, rotation }) => (
    <PagePointerProvider
      pageIndex={pageIndex}
      pageWidth={width}
      pageHeight={height}
      rotation={rotation}
      scale={scale}
    >
      {/* Base render layer - renders a low resolution version of the entire page for immediate display */}
      <RenderLayer pageIndex={pageIndex} scale={1} />

      {/* Tiling layer - renders high resolution tiles only for the visible area, scales with zoom level */}
      <TilingLayer pageIndex={pageIndex} scale={scale} />

      {/* Marquee layer for area zoom */}
      <MarqueeZoom pageIndex={pageIndex} scale={scale} />
    </PagePointerProvider>
  )}
/>;
```

This setup requires the interaction manager. When the toolbar’s “Area Zoom” button calls `toggleMarqueeZoom`, the `<MarqueeZoom />` component handles the drag interaction.

## API Reference

### Configuration (`ZoomPluginConfig`)

| Option             | Type                 | Description                                                                                                                                 |
| ------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `defaultZoomLevel` | `ZoomMode \| number` | Initial zoom level. Use numeric scale (e.g., `1.5`) or `ZoomMode` enum (`Automatic`, `FitPage`, `FitWidth`). Default: `ZoomMode.Automatic`. |
| `minZoom`          | number               | Minimum allowed numeric zoom level. Default: `0.2`.                                                                                         |
| `maxZoom`          | number               | Maximum allowed numeric zoom level. Default: `60`.                                                                                          |
| `presets`          | `ZoomPreset[]`       | `{ name: string, value: ZoomMode \| number }` objects for a zoom dropdown. Retrieve via `provides.getPresets()`.                            |

### Hook: `useZoom()`

Connects components to zoom state and actions.

| Property   | Type                     | Description                                         |
| ---------- | ------------------------ | --------------------------------------------------- |
| `state`    | `ZoomState`              | Current zoom data.                                  |
| `provides` | `ZoomCapability \| null` | Methods to control zooming, or `null` if not ready. |

#### `ZoomState` Properties

| Property           | Type                 | Description                                                |
| ------------------ | -------------------- | ---------------------------------------------------------- |
| `currentZoomLevel` | number               | Actual calculated zoom factor applied to the document.     |
| `zoomLevel`        | `ZoomMode \| number` | Last requested zoom level (may be a mode like `fit-page`). |

#### `ZoomCapability` Methods

| Method                  | Description                                                       |
| ----------------------- | ----------------------------------------------------------------- |
| `zoomIn()`              | Zooms in by one step.                                             |
| `zoomOut()`             | Zooms out by one step.                                            |
| `requestZoom(level)`    | Sets zoom to a specific level (`1.0`, `ZoomMode.FitWidth`, etc.). |
| `toggleMarqueeZoom()`   | Enables or disables area zoom mode.                               |
| `isMarqueeZoomActive()` | Returns `true` if area zoom is active.                            |
| `getPresets()`          | Returns configured presets.                                       |

### Component: `<MarqueeZoom />`

Renders the visual rectangle when users select an area to zoom into.

| Prop        | Type   | Description                                               |
| ----------- | ------ | --------------------------------------------------------- |
| `pageIndex` | number | **Required.** Page index this component renders on.       |
| `scale`     | number | **Required.** Current page scale.                         |
| `className` | string | Optional CSS class for customizing the marquee rectangle. |
| `stroke`    | string | Optional border color.                                    |
| `fill`      | string | Optional background color.                                |
