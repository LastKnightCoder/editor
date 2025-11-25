# Rotate Plugin

The Rotate Plugin changes the orientation of the entire document. It applies a rotation to every page, letting users view content in 90-degree increments.

## Installation

Install the plugin from NPM.

```bash
pnpm add @embedpdf/plugin-rotate
```

## Registration

Import `RotatePluginPackage` and add it to the `plugins` array. Optionally specify a default rotation for newly loaded documents.

```tsx
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { Rotation } from "@embedpdf/models";
import { RotatePluginPackage } from "@embedpdf/plugin-rotate/react";

const plugins = [
  // ... other essential plugins
  createPluginRegistration(LoaderPluginPackage, {
    /* ... */
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),

  // Register and configure the rotate plugin
  createPluginRegistration(RotatePluginPackage, {
    defaultRotation: Rotation.Degree90, // Start documents rotated 90° clockwise
  }),
];

// ... rest of your component
```

## Usage

The plugin exposes the `useRotate` hook to control rotation from your UI and a `<Rotate />` component to apply the visual transformation to each page.

### Building a Rotate Toolbar

Use `useRotate` to read the current rotation and access methods that change it. The rotation state is a `Rotation` enum value (`0`, `1`, `2`, `3` → `0°`, `90°`, `180°`, `270°`).

```tsx
// RotateToolbar.tsx
import { useRotate } from "@embedpdf/plugin-rotate/react";

export const RotateToolbar = () => {
  const { rotation, provides: rotate } = useRotate();

  if (!rotate) {
    return null;
  }

  return (
    <div className="toolbar">
      <span>Current Rotation: {rotation * 90}°</span>
      <button onClick={rotate.rotateBackward}>Rotate Left</button>
      <button onClick={rotate.rotateForward}>Rotate Right</button>
    </div>
  );
};
```

### Applying the Rotation

Wrap your page layers with `<Rotate />` inside the `<Scroller />` `renderPage` function. Place it outside `<PagePointerProvider>` so interactions map correctly to the rotated page.

```tsx
// Inside your main PDFViewer component
<Scroller
  renderPage={({ width, height, pageIndex, scale, rotation }) => (
    <Rotate pageSize={{ width, height }}>
      <PagePointerProvider
        pageIndex={pageIndex}
        {/* ... other props */}
      >
        <RenderLayer pageIndex={pageIndex} scale={scale} />
      </PagePointerProvider>
    </Rotate>
  )}
/>
```

## API Reference

### Configuration (`RotatePluginConfig`)

| Option            | Type     | Description                                                                                                    |
| ----------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `defaultRotation` | Rotation | Initial rotation for loaded documents. Import `Rotation` from `@embedpdf/models`. Default: `Rotation.Degree0`. |

### Hook: `useRotate()`

Connects your component to the rotate plugin’s state and functions.

| Property   | Type                       | Description                                                        |
| ---------- | -------------------------- | ------------------------------------------------------------------ |
| `rotation` | Rotation                   | Current reactive rotation state (`0`, `1`, `2`, or `3`).           |
| `provides` | `RotateCapability \| null` | Methods to control rotation, or `null` if the plugin is not ready. |

#### `RotateCapability` Methods

| Method                  | Description                                       |
| ----------------------- | ------------------------------------------------- |
| `rotateForward()`       | Rotates the document 90° clockwise.               |
| `rotateBackward()`      | Rotates the document 90° counter-clockwise.       |
| `setRotation(rotation)` | Sets the document to a specific `Rotation` value. |
| `getRotation()`         | Returns the current rotation value.               |

### Component: `<Rotate />`

Wrapper component that applies the correct CSS rotation transform to its children.

| Prop       | Type      | Description                                                                                                                       |
| ---------- | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `pageSize` | Size      | **Required.** `{ width: number, height: number }` representing unrotated page dimensions, used to calculate the transform origin. |
| `children` | ReactNode | Page layers that should be rotated.                                                                                               |
