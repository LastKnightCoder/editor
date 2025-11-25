# Capture Plugin

The Capture Plugin provides a “snapshot” tool, allowing users to select a rectangular area (a marquee) on any page and export that specific section as a high-resolution image.

## Installation

This plugin depends on the Render and Interaction Manager plugins. Install all three packages.

```bash
pnpm add @embedpdf/plugin-capture @embedpdf/plugin-render @embedpdf/plugin-interaction-manager
```

## Registration

Import `CapturePluginPackage` and its dependencies, then add them to the `plugins` array. Register the dependencies before the capture plugin.

```tsx
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
// ... other imports
import { RenderPluginPackage } from "@embedpdf/plugin-render/react";
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager/react";
import { CapturePluginPackage } from "@embedpdf/plugin-capture/react";

const plugins = [
  // ... other essential plugins
  createPluginRegistration(LoaderPluginPackage, {
    /* ... */
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),

  // Register dependencies first
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage),

  // Register and configure the capture plugin
  createPluginRegistration(CapturePluginPackage, {
    scale: 2.0, // Render captured image at 2x resolution
    imageType: "image/png",
    withAnnotations: true,
  }),
];
```

## Usage

Combine a UI component to draw the selection area, a hook to control capture mode, and an event listener to handle the final image.

### Add the `<MarqueeCapture />` Component

Place `<MarqueeCapture />` inside the `renderPage` prop of `<Scroller />`. It must be a child of `<PagePointerProvider>` to correctly handle mouse or touch interactions.

```tsx
import { PagePointerProvider } from "@embedpdf/plugin-interaction-manager/react";
import { MarqueeCapture } from "@embedpdf/plugin-capture/react";

// ...
<Scroller
  renderPage={({ width, height, pageIndex, scale, rotation }) => (
    <PagePointerProvider {...{ pageIndex, width, height, scale, rotation }}>
      <RenderLayer pageIndex={pageIndex} />
      <MarqueeCapture pageIndex={pageIndex} scale={scale} />
    </PagePointerProvider>
  )}
/>;
```

### Build a Toolbar Button

Use the `useCaptureCapability` hook to access plugin methods. The `toggleMarqueeCapture()` method activates and deactivates the selection mode.

```tsx
import { useCaptureCapability } from "@embedpdf/plugin-capture/react";

const CaptureToolbar = () => {
  const { provides: capture } = useCaptureCapability();
  const isActive = capture?.isMarqueeCaptureActive();

  return (
    <button onClick={() => capture?.toggleMarqueeCapture()}>
      {isActive ? "Cancel" : "Capture Area"}
    </button>
  );
};
```

### Handle the Captured Image

After the user selects an area, the plugin fires an event with the resulting image data. Listen for this event using `onCaptureArea` to receive the `Blob`, then display or download it.

```tsx
import { useEffect, useState } from "react";
import {
  useCaptureCapability,
  CaptureAreaEvent,
} from "@embedpdf/plugin-capture/react";

const CaptureResult = () => {
  const { provides: capture } = useCaptureCapability();
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!capture) return;

    const unsubscribe = capture.onCaptureArea((result: CaptureAreaEvent) => {
      const newUrl = URL.createObjectURL(result.blob);
      setImageUrl(newUrl);
    });

    return () => {
      unsubscribe();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [capture]);

  if (!imageUrl) return <p>Select an area to capture.</p>;

  return <img src={imageUrl} alt="Captured PDF area" />;
};
```

## API Reference

### Configuration (`CapturePluginConfig`)

| Option            | Type    | Description                                                                          |
| ----------------- | ------- | ------------------------------------------------------------------------------------ |
| `scale`           | number  | Resolution multiplier for the captured image. `2` means 2x resolution. Default: `1`. |
| `imageType`       | string  | Image format (`image/png`, `image/jpeg`). Default: `image/png`.                      |
| `withAnnotations` | boolean | Include annotations in the captured image. Default: `false`.                         |

### Component: `<MarqueeCapture />`

Renders the visual selection rectangle.

| Prop        | Type   | Description                                                |
| ----------- | ------ | ---------------------------------------------------------- |
| `pageIndex` | number | **Required.** Page index where this component is rendered. |
| `scale`     | number | **Required.** Current scale of the page.                   |
| `className` | string | Optional CSS class for custom marquee styling.             |
| `stroke`    | string | Color of the marquee’s border.                             |
| `fill`      | string | Background color of the marquee.                           |

### Hook: `useCaptureCapability()`

Connects your component to the capture plugin’s state and functions.

| Property   | Type                        | Description                                                  |
| ---------- | --------------------------- | ------------------------------------------------------------ |
| `provides` | `CaptureCapability \| null` | Methods to interact with the plugin, or `null` if not ready. |

#### `CaptureCapability` Methods

| Method                         | Description                                                              |
| ------------------------------ | ------------------------------------------------------------------------ |
| `toggleMarqueeCapture()`       | Toggles the marquee selection mode on or off.                            |
| `isMarqueeCaptureActive()`     | Returns `true` if the marquee selection mode is active.                  |
| `onCaptureArea(callback)`      | Subscribes to the capture event. Callback receives a `CaptureAreaEvent`. |
| `captureArea(pageIndex, rect)` | Programmatically captures a specified rectangular area on a page.        |

### Event: `CaptureAreaEvent`

Object passed to the `onCaptureArea` callback after a successful capture.

| Property    | Type   | Description                                                 |
| ----------- | ------ | ----------------------------------------------------------- |
| `pageIndex` | number | Index of the page where the capture occurred.               |
| `rect`      | Rect   | Position and size of the captured area in PDF points.       |
| `blob`      | Blob   | Captured image data as a `Blob`.                            |
| `imageType` | string | MIME type of the captured image (for example, `image/png`). |
| `scale`     | number | Resolution scale factor used for the capture.               |
