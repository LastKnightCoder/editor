# Tiling Plugin

The Tiling Plugin optimizes performance for large documents or high zoom levels. Instead of rendering a page as one large image, it breaks the page into a grid of smaller tiles and renders only those currently visible in the viewport—similar to how online maps load content as you pan and zoom.

## Installation

This plugin depends on the Render, Scroll, and Viewport plugins. Install all four packages.

```bash
pnpm add @embedpdf/plugin-tiling @embedpdf/plugin-render @embedpdf/plugin-scroll @embedpdf/plugin-viewport
```

## Registration

Import `TilingPluginPackage` and its dependencies, then add them to the `plugins` array. Register the tiling plugin after its dependencies.

```tsx
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
// ... other imports
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import { ScrollPluginPackage } from "@embedpdf/plugin-scroll/react";
import { RenderPluginPackage } from "@embedpdf/plugin-render/react";
import { TilingPluginPackage } from "@embedpdf/plugin-tiling/react";

const plugins = [
  // ... other essential plugins
  // Register dependencies first
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),

  // Register and configure the tiling plugin
  createPluginRegistration(TilingPluginPackage, {
    tileSize: 768,
    overlapPx: 5,
    extraRings: 1, // Pre-render one ring of tiles outside the viewport
  }),
];
```

## Usage

Adopt a two-layer rendering strategy for the best experience: show a fast, low-resolution preview immediately, then progressively enhance it with high-resolution tiles.

- `<RenderLayer />`: Base layer. Use a low, fixed `scale` (for example, `0.5`) for a quick, blurry preview.
- `<TilingLayer />`: Renders on top. Receives the dynamic `scale` from the scroller and paints crisp tiles over the preview.

```tsx
import { RenderLayer } from "@embedpdf/plugin-render/react";
import { TilingLayer } from "@embedpdf/plugin-tiling/react";

// ...

<Scroller
  renderPage={({ width, height, pageIndex, scale }) => (
    <div style={{ width, height, position: "relative" }}>
      {/* 1. Low-resolution base layer for immediate feedback */}
      <RenderLayer pageIndex={pageIndex} scale={0.5} />

      {/* 2. High-resolution tile layer on top */}
      <TilingLayer pageIndex={pageIndex} scale={scale} />
    </div>
  )}
/>;
```

## API Reference

### Configuration (`TilingPluginConfig`)

| Option       | Type   | Description                                                                                                                                     |
| ------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `tileSize`   | number | Width and height of each square tile in screen pixels. Larger tiles mean fewer draw calls but higher memory per tile. Default: `768`.           |
| `overlapPx`  | number | Pixels of overlap between tiles to prevent visible seams. Default: `2.5`.                                                                       |
| `extraRings` | number | Number of tile “rings” to pre-render outside the viewport. Values like `1` or `2` smooth scrolling at the cost of more rendering. Default: `0`. |

### Component: `<TilingLayer />`

Orchestrates the rendering of individual tiles for a page.

| Prop        | Type   | Description                                                                            |
| ----------- | ------ | -------------------------------------------------------------------------------------- |
| `pageIndex` | number | **Required.** Index of the page whose tiles should render.                             |
| `scale`     | number | **Required.** Current page scale used to determine visible tiles and their resolution. |
