# Understanding Plugins

Plugins are the heart of EmbedPDF’s headless architecture. They are modular packages that add specific capabilities to your viewer. This à la carte approach keeps the application lean by loading only the functionality you need.

Think of the `<EmbedPDF>` component as a smartphone: powerful on its own, but the apps (plugins) you install add features such as navigation, search, or annotations.

## How Plugins Work

Adding a new feature follows a simple three-step process.

### 1. Install the Plugin Package

Each plugin is its own NPM package. For example, to add zooming capabilities you install the zoom plugin:

```bash
pnpm add @embedpdf/plugin-zoom
```

### 2. Register the Plugin

Import the plugin’s `...PluginPackage` and register it in the `plugins` array passed to `<EmbedPDF>` using `createPluginRegistration`.

```tsx
// PDFViewer.tsx
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
// ... other imports
import { ZoomPluginPackage } from "@embedpdf/plugin-zoom/react";

const plugins = [
  // ... other essential plugins like Loader, Viewport, etc.
  createPluginRegistration(LoaderPluginPackage, {
    /* ... */
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),

  // Add the zoom plugin to the array
  createPluginRegistration(ZoomPluginPackage, {
    defaultZoomLevel: 1.5, // You can pass options here!
  }),
];

// ... rest of your component
```

Registering the plugin activates its core logic and exposes its features to your app.

### 3. Use the Plugin’s Components and Hooks

Once registered, you can use the plugin’s React components and hooks. The zoom plugin provides `<MarqueeZoom />` for drag-to-zoom interactions and `useZoom()` for toolbar controls.

```tsx
// ZoomToolbar.tsx
import { useZoom } from "@embedpdf/plugin-zoom/react";

export const ZoomToolbar = () => {
  const { provides: zoomProvides, state: zoomState } = useZoom();

  if (!zoomProvides) {
    return null;
  }

  return (
    <div>
      <span>Current Zoom: {Math.round(zoomState.currentZoomLevel * 100)}%</span>
      <button onClick={zoomProvides.zoomOut}>-</button>
      <button onClick={zoomProvides.zoomIn}>+</button>
      <button onClick={() => zoomProvides.requestZoom(1.0)}>Reset</button>
    </div>
  );
};
```

This separation of logic (the plugin) from the view (your components) gives you complete control over UI.

### 4. Add the Component to Your Viewer

Place your new UI component—such as `<ZoomToolbar />`—inside the `<EmbedPDF>` provider so its hooks can access the plugin context.

```tsx
// PDFViewer.tsx
import { EmbedPDF } from '@embedpdf/core/react';
// ... other imports
import { Viewport } from '@embedpdf/plugin-viewport/react';
import { ZoomToolbar } from './ZoomToolbar'; // 1. Import the toolbar

// ... plugins array and PDFViewer component setup
export const PDFViewer = () => {
  // ...
  return (
    <div style={{ height: '500px', border: '1px solid black', display: 'flex', flexDirection: 'column' }}>
      <EmbedPDF engine={engine} plugins={plugins}>
        <div style={{display: 'flex, height: '100%', flexDirection: 'column'}}>
          <ZoomToolbar /> {/* 2. Add the component here */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Viewport>
              {/* ... Scroller and RenderLayer ... */}
            </Viewport>
          </div>
        </div>
      </EmbedPDF>
    </div>
  );
};
```

## Types of Plugin Features

Plugins can provide several types of tools:

- **Core logic:** Background functionality that manages state (for example, `ScrollPluginPackage`).
- **React components:** UI pieces you place in the viewer (for example, `<RenderLayer />`, `<SelectionLayer />`, `<MarqueeZoom />`).
- **React hooks:** Functions such as `useZoom()` or `useSearch()` that allow your custom components to access plugin data and trigger actions.

Combine plugins to compose a feature-rich PDF experience tailored to your application’s design.
