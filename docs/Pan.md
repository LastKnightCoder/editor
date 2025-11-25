# Pan Plugin

The Pan Plugin provides a “hand tool” so users can navigate the PDF by clicking and dragging within the viewport. This offers an intuitive alternative to scrollbars, especially on touch devices.

## Installation

This plugin depends on the Viewport and Interaction Manager plugins. Install all three packages.

```bash
pnpm add @embedpdf/plugin-pan @embedpdf/plugin-viewport @embedpdf/plugin-interaction-manager
```

## Registration

Import `PanPluginPackage` and its dependencies, and add them to the `plugins` array. Register the pan plugin after its dependencies.

```tsx
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
// ... other imports
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager/react";
import { PanPluginPackage } from "@embedpdf/plugin-pan/react";

const plugins = [
  // ... other essential plugins
  createPluginRegistration(LoaderPluginPackage, {
    /* ... */
  }),
  createPluginRegistration(RenderPluginPackage),

  // Register dependencies first
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage),

  // Register and configure the pan plugin
  createPluginRegistration(PanPluginPackage, {
    defaultMode: "mobile", // Automatically enable pan as default on touch devices
  }),
];
```

## Usage

The plugin registers a “pan” interaction mode. Build UI to toggle this mode on and off using the `usePan` hook.

### Building a Pan Tool Button

`usePan` exposes the `isPanning` state and a `provides` object with methods to control pan mode. `isPanning` is ideal for highlighting the active tool button.

```tsx
import { usePan } from "@embedpdf/plugin-pan/react";

export const PanToolbar = () => {
  const { provides: pan, isPanning } = usePan();

  if (!pan) return null;

  return (
    <button onClick={pan.togglePan} className={isPanning ? "active" : ""}>
      Hand Tool
    </button>
  );
};
```

### Using `GlobalPointerProvider`

For smooth panning, the viewer must track mouse movements even when the cursor leaves the viewport. `GlobalPointerProvider` (from the Interaction Manager plugin) captures events globally. Wrap your `<Viewport>` with it to enable this behavior.

```tsx
import { GlobalPointerProvider } from "@embedpdf/plugin-interaction-manager/react";
// ...
<div className="viewer-container">
  <GlobalPointerProvider>
    <Viewport>
      <Scroller>{/* ... */}</Scroller>
    </Viewport>
  </GlobalPointerProvider>
</div>;
```

## API Reference

### Configuration (`PanPluginConfig`)

| Option        | Type                              | Description                                                                     |
| ------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| `defaultMode` | `'never' \| 'mobile' \| 'always'` | Determines if pan should be the default interaction mode. Defaults to `mobile`. |

- `never`: Another mode (like text selection) remains the default.
- `mobile`: Pan is the default only on touch-enabled devices.
- `always`: Pan is the default on all devices.

### Hook: `usePan()`

Connects your component to the pan plugin’s state and functions.

| Property    | Type                    | Description                                                        |
| ----------- | ----------------------- | ------------------------------------------------------------------ |
| `isPanning` | boolean                 | `true` when the pan mode is active.                                |
| `provides`  | `PanCapability \| null` | Methods to control pan mode, or `null` if the plugin is not ready. |

#### `PanCapability` Methods

| Method             | Description                                                      |
| ------------------ | ---------------------------------------------------------------- |
| `enablePan()`      | Activates pan mode.                                              |
| `disablePan()`     | Deactivates pan mode and returns to the default interaction.     |
| `togglePan()`      | Toggles pan mode on or off.                                      |
| `makePanDefault()` | Sets pan mode as the default interaction for the viewer session. |
