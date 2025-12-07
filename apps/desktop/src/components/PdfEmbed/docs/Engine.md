# PDFium Engine for React

The `usePdfiumEngine` hook is the bridge between the core PDF processing engine and your React application. Its primary purpose is to provide a managed engine instance for the main `<EmbedPDF>` component, which then orchestrates all the plugins and UI components.

## Installation

The hook ships in the `@embedpdf/engines` package, which should be installed alongside `@embedpdf/core`.

```bash
pnpm add @embedpdf/core @embedpdf/engines
```

## Primary Use Case: Powering `<EmbedPDF>`

Most of the time, you get the engine from the hook and pass it to the `<EmbedPDF>` provider. The provider and its plugins handle the rest, so you never need to call `engine.openDocument()` or `engine.renderPage()` directly.

```tsx
// MyViewer.tsx
import { usePdfiumEngine } from "@embedpdf/engines/react";
import { EmbedPDF } from "@embedpdf/core/react";
// ... import your desired plugins and components

function MyViewer() {
  const { engine, isLoading, error } = usePdfiumEngine();

  if (isLoading) {
    return <div>Loading PDF Engine...</div>;
  }
  if (error) {
    return <div>Error loading engine: {error.message}</div>;
  }

  // The engine is ready and initialized. Pass it to the provider.
  return (
    <EmbedPDF engine={engine} plugins={/* ... your plugins ... */}>
      {/* ... your viewer components like <Viewport />, <Toolbar />, etc. ... */}
    </EmbedPDF>
  );
}
```

## Alternative: Engine Provider

For advanced scenarios or when sharing the engine across multiple components, use `PdfEngineProvider` directly.

```tsx
// AppWithProvider.tsx
import { usePdfiumEngine, PdfEngineProvider } from "@embedpdf/engines/react";
import { EmbedPDF } from "@embedpdf/core/react";

function App() {
  const { engine, isLoading, error } = usePdfiumEngine();

  return (
    <PdfEngineProvider engine={engine} isLoading={isLoading} error={error}>
      <MyViewerComponent />
      <SomeOtherComponent />
    </PdfEngineProvider>
  );
}

function MyViewerComponent() {
  const { engine, isLoading, error } = useEngineContext();

  if (isLoading) {
    return <div>Loading PDF Engine...</div>;
  }
  if (error) {
    return <div>Error loading engine: {error.message}</div>;
  }

  return (
    <EmbedPDF engine={engine} plugins={/* ... your plugins ... */}>
      {/* ... your viewer components ... */}
    </EmbedPDF>
  );
}
```

## Advanced Use Case: Direct Engine Interaction

For tasks outside the plugin system—exporting a page image on demand, running a one-off text extraction, etc.—use the engine object directly.

```tsx
import { usePdfiumEngine } from "@embedpdf/engines/react";
import { ignore } from "@embedpdf/models";

export default function DirectEngineExample() {
  const { isLoading, error, engine } = usePdfiumEngine();

  if (error) {
    return (
      <div className="mt-3 rounded-md bg-red-50 p-4 text-sm font-medium text-red-800">
        Failed to initialize PDF engine: {error.message}
      </div>
    );
  }

  if (isLoading || !engine) {
    return (
      <div className="mt-3 rounded-md bg-yellow-50 p-4 text-sm font-medium text-yellow-800">
        Loading PDF engine...
      </div>
    );
  }

  // Engine is ready to use directly
  const handleDirectOperation = () => {
    // Example: You can now use engine methods directly
    console.log("Engine is ready for direct operations");
  };

  return (
    <div className="mt-3 rounded-md bg-green-50 p-4 text-sm font-medium text-green-800">
      <p>Engine loaded successfully!</p>
      <button onClick={handleDirectOperation}>Perform Direct Operation</button>
    </div>
  );
}
```

## Hook API Reference

`usePdfiumEngine` accepts an optional configuration object and returns the engine state.

### Configuration Options

| Option    | Type    | Default     | Description                                |
| --------- | ------- | ----------- | ------------------------------------------ |
| `wasmUrl` | string  | CDN URL     | Custom WebAssembly file URL.               |
| `worker`  | boolean | `true`      | Whether to run the engine in a Web Worker. |
| `logger`  | Logger  | `undefined` | Custom logger instance.                    |

### Return Values

- `engine`: The `PdfEngine` instance (already initialized) or `null` while loading.
- `isLoading`: `true` while the engine WebAssembly is being downloaded and instantiated.
- `error`: An `Error` if loading or initialization fails, otherwise `null`.

### Provider Components

| Component           | Description                                                  |
| ------------------- | ------------------------------------------------------------ |
| `PdfEngineProvider` | Context provider for sharing engine state across components. |
| `useEngineContext`  | Hook to access the engine from the provider context.         |
| `useEngine`         | Simplified hook that returns the engine or throws on error.  |

For complete documentation of all engine methods, see the `@embedpdf/engines` package documentation.
