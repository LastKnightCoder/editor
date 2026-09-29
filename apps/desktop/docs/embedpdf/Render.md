# Render Plugin

The Render Plugin is the visual heart of the PDF viewer. It takes PDF data from the core engine and paints it on screen. Its primary feature is the `<RenderLayer />` component.

## Installation

The plugin ships as a standalone NPM package and is essential for any visual viewer.

```bash
pnpm add @embedpdf/plugin-render
```

## Registration

Import `RenderPluginPackage` and add it to the `plugins` array. This plugin has no configuration options.

```tsx
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
// ... other imports
import { RenderPluginPackage } from "@embedpdf/plugin-render/react";

const plugins = [
  // ... other essential plugins
  createPluginRegistration(LoaderPluginPackage, {
    /* ... */
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),

  // Register the render plugin
  createPluginRegistration(RenderPluginPackage),
];
```

## Usage

Use the simple `<RenderLayer />` component to display pages within the viewer, or the `useRenderCapability` hook for on-demand rendering tasks.

### `<RenderLayer />` Component

Place `<RenderLayer />` inside the `renderPage` prop of `<Scroller />`. It renders the correct page at the proper size and resolution as the user scrolls.

```tsx
<Scroller
  renderPage={({ width, height, pageIndex, scale }) => (
    <div style={{ width, height, position: "relative" }}>
      {/* The RenderLayer is responsible for drawing the page */}
      <RenderLayer pageIndex={pageIndex} scale={scale} />
    </div>
  )}
/>
```

### On-Demand Rendering

For features that require rendering outside the main viewer—such as exporting a page as a high-resolution image—use `useRenderCapability` for direct access to rendering functions.

```tsx
import { useState } from "react";
import { useRenderCapability } from "@embedpdf/plugin-render/react";

const ExportButton = () => {
  const { provides: render } = useRenderCapability();
  const [isExporting, setIsExporting] = useState(false);

  const exportPage = () => {
    setIsExporting(true);
    const task = render.renderPage({
      pageIndex: 0,
      options: { scaleFactor: 3.0 },
    });
    task.wait((blob) => {
      // ... trigger download from the blob ...
      setIsExporting(false);
    });
  };

  return (
    <button onClick={exportPage}>{isExporting ? "..." : "Export Page"}</button>
  );
};
```

### Live Example

A standard PDF viewer can expose an “Export Page” button powered by `useRenderCapability`. Clicking it renders and downloads Page 1 as a high-resolution PNG (2×).

## API Reference

### Component: `<RenderLayer />`

Renders a single PDF page as an image.

| Prop        | Type   | Description                                                                                |
| ----------- | ------ | ------------------------------------------------------------------------------------------ |
| `pageIndex` | number | **Required.** Index of the page to render.                                                 |
| `scale`     | number | Scale factor for rendering. Higher values yield higher resolution.                         |
| `dpr`       | number | Device pixel ratio for crisp text on high-DPI screens. Default: `window.devicePixelRatio`. |

### Hook: `useRenderCapability()`

Connects your component to the render plugin’s low-level functions.

| Property   | Type                       | Description                                                    |
| ---------- | -------------------------- | -------------------------------------------------------------- |
| `provides` | `RenderCapability \| null` | Methods to render pages, or `null` if the plugin is not ready. |

#### `RenderCapability` Methods

| Method                    | Description                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `renderPage(options)`     | Renders a full page. Accepts `pageIndex` and `PdfRenderPageOptions`. Returns a `Task<Blob>`.    |
| `renderPageRect(options)` | Renders a specific rectangular portion of a page. Useful for snapshots. Returns a `Task<Blob>`. |

### `PdfRenderPageOptions`

| Option            | Type     | Description                                                                           |
| ----------------- | -------- | ------------------------------------------------------------------------------------- |
| `scaleFactor`     | number   | Render scale. Default: `1.0`.                                                         |
| `rotation`        | Rotation | Apply a rotation to the output. Default: `Rotation.Degree0`.                          |
| `dpr`             | number   | Device pixel ratio. Default: `window.devicePixelRatio`.                               |
| `withAnnotations` | boolean  | Include annotations in the render. Default: `true`.                                   |
| `imageType`       | string   | Output image format (`image/webp`, `image/jpeg`, `image/png`). Default: `image/webp`. |
| `imageQuality`    | number   | Value between `0` and `1` for lossy formats such as JPEG or WebP.                     |
