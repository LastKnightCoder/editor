# Thumbnail Plugin

The Thumbnail Plugin adds a classic sidebar with small, clickable previews of each page. It gives users an overview of the document and an easy way to jump to any page. For optimal performance with long documents, the plugin virtualizes the list, rendering only the thumbnails that are visible.

## Installation

This plugin requires the Render plugin. The Scroll plugin is optional but required for the auto-scroll feature.

```bash
pnpm add @embedpdf/plugin-thumbnail @embedpdf/plugin-render @embedpdf/plugin-scroll
```

## Registration

Import `ThumbnailPluginPackage` and its dependencies, then add them to the `plugins` array. Register dependencies first.

```tsx
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
// ... other imports
import { RenderPluginPackage } from "@embedpdf/plugin-render/react";
import { ScrollPluginPackage } from "@embedpdf/plugin-scroll/react";
import { ThumbnailPluginPackage } from "@embedpdf/plugin-thumbnail/react";

const plugins = [
  // ... other essential plugins
  createPluginRegistration(LoaderPluginPackage, {
    /* ... */
  }),
  createPluginRegistration(ViewportPluginPackage),

  // Register dependencies first
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(ScrollPluginPackage),

  // Register and configure the thumbnail plugin
  createPluginRegistration(ThumbnailPluginPackage, {
    width: 120, // Sets the width of thumbnail images
  }),
];
```

## Usage

The plugin exposes two primary components:

- `<ThumbnailsPane />`: virtualized container.
- `<ThumbImg />`: renders each page image.

### Building a Thumbnail Sidebar

Place `<ThumbnailsPane />` in a sidebar next to the main `<Viewport />`. It uses a render-prop pattern, calling your function for each visible thumbnail with metadata (`m`) describing dimensions and position. Style your container using this metadata, then render `<ThumbImg meta={m} />` inside.

Use `useScroll` to access `scrollToPage` for navigation and `currentPage` for highlighting the active thumbnail.

#### Using the `meta` Object

`meta` contains pre-calculated values required for virtualization:

- `m.top`: Absolute vertical position of the wrapper. Apply to the wrapper’s `top`.
- `m.wrapperHeight`: Total container height (image + label + padding). Apply to the wrapper’s `height`.
- `m.width` / `m.height`: Image dimensions. Apply to the element containing `<ThumbImg />`.
- `m.labelHeight`: Reserved height for the page label.
- `m.padding`: Padding around the image.

Always apply `top` and `wrapperHeight` to avoid gaps or overlaps.

```tsx
import { useScroll } from "@embedpdf/plugin-scroll/react";
import { ThumbnailsPane, ThumbImg } from "@embedpdf/plugin-thumbnail/react";

const ThumbnailSidebar = () => {
  const { state, provides } = useScroll();

  return (
    <ThumbnailsPane>
      {(m) => {
        const isActive = state.currentPage === m.pageIndex + 1;
        return (
          <div
            key={m.pageIndex}
            style={{
              position: "absolute",
              top: m.top,
              height: m.wrapperHeight,
              // ... other wrapper styles
            }}
            onClick={() =>
              provides?.scrollToPage({ pageNumber: m.pageIndex + 1 })
            }
          >
            <div
              style={{
                border: `2px solid ${isActive ? "blue" : "grey"}`,
                width: m.width,
                height: m.height,
              }}
            >
              <ThumbImg meta={m} />
            </div>
            <span style={{ height: m.labelHeight }}>{m.pageIndex + 1}</span>
          </div>
        );
      }}
    </ThumbnailsPane>
  );
};
```

## API Reference

### Configuration (`ThumbnailPluginConfig`)

| Option           | Type    | Description                                                                      |
| ---------------- | ------- | -------------------------------------------------------------------------------- |
| `width`          | number  | Width of each thumbnail image (CSS pixels). Default: `120`.                      |
| `gap`            | number  | Vertical space between thumbnails (CSS pixels). Default: `8`.                    |
| `buffer`         | number  | Number of off-screen thumbnails rendered above/below the viewport. Default: `3`. |
| `labelHeight`    | number  | Height reserved for the page label. Default: `16`.                               |
| `autoScroll`     | boolean | Automatically keep the current page’s thumbnail in view. Default: `true`.        |
| `scrollBehavior` | string  | Scroll animation (`'smooth'` or `'auto'`). Default: `'smooth'`.                  |
| `imagePadding`   | number  | Padding inside the thumbnail border. Default: `0`.                               |
| `paddingY`       | number  | Vertical padding for the overall thumbnail container. Default: `0`.              |

### Component: `<ThumbnailsPane />`

Virtualized scroll container for thumbnails.

| Prop       | Type                             | Description                                                                                       |
| ---------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `children` | `(meta: ThumbMeta) => ReactNode` | **Required.** Render prop that receives thumbnail metadata and returns UI for a single thumbnail. |

### Component: `<ThumbImg />`

Renders the rasterized image for a single thumbnail.

| Prop   | Type      | Description                                                     |
| ------ | --------- | --------------------------------------------------------------- |
| `meta` | ThumbMeta | **Required.** Metadata object provided by `<ThumbnailsPane />`. |

### Hook: `useThumbnailCapability()`

Direct interaction is rarely needed thanks to auto-scroll, but the hook exposes low-level control.

| Property   | Type                          | Description                                                  |
| ---------- | ----------------------------- | ------------------------------------------------------------ |
| `provides` | `ThumbnailCapability \| null` | Methods to interact with the plugin, or `null` if not ready. |

#### `ThumbnailCapability` Methods

| Method                        | Description                                                               |
| ----------------------------- | ------------------------------------------------------------------------- |
| `scrollToThumb(pageIndex)`    | Programmatically scrolls the sidebar so the specified page is visible.    |
| `renderThumb(pageIndex, dpr)` | Manually triggers rendering of a thumbnail image. Returns a `Task<Blob>`. |
