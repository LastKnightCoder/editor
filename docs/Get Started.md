# Getting Started

Let’s build a basic, scrollable PDF viewer. This guide walks through the essential setup.

## 1. Installation

Install the core library, engine, and a few essential plugins.

```bash
pnpm add @embedpdf/core @embedpdf/engines @embedpdf/plugin-loader @embedpdf/plugin-viewport @embedpdf/plugin-scroll @embedpdf/plugin-render
```

## 2. Create Your Viewer Component

The core of your viewer is the `<EmbedPDF>` component, which manages the engine and plugins. Below is a minimal `PDFViewer` that loads a document from a URL and renders it in a vertically scrollable viewport.

```tsx
// PDFViewer.tsx
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";

// Import the essential plugins
import {
  Viewport,
  ViewportPluginPackage,
} from "@embedpdf/plugin-viewport/react";
import { Scroller, ScrollPluginPackage } from "@embedpdf/plugin-scroll/react";
import { LoaderPluginPackage } from "@embedpdf/plugin-loader/react";
import {
  RenderLayer,
  RenderPluginPackage,
} from "@embedpdf/plugin-render/react";

// 1. Register the plugins you need
const plugins = [
  createPluginRegistration(LoaderPluginPackage, {
    loadingOptions: {
      type: "url",
      pdfFile: {
        id: "example-pdf",
        url: "https://snippet.embedpdf.com/ebook.pdf",
      },
    },
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
];

export const PDFViewer = () => {
  // 2. Initialize the engine with the React hook
  const { engine, isLoading } = usePdfiumEngine();

  if (isLoading || !engine) {
    return <div>Loading PDF Engine...</div>;
  }

  // 3. Wrap your UI with the <EmbedPDF> provider
  return (
    <div style={{ height: "500px" }}>
      <EmbedPDF engine={engine} plugins={plugins}>
        <Viewport
          style={{
            backgroundColor: "#f1f3f5",
          }}
        >
          <Scroller
            renderPage={({ width, height, pageIndex, scale }) => (
              <div style={{ width, height }}>
                {/* The RenderLayer is responsible for drawing the page */}
                <RenderLayer pageIndex={pageIndex} scale={scale} />
              </div>
            )}
          />
        </Viewport>
      </EmbedPDF>
    </div>
  );
};
```

## 3. Render Your Component

Add the new `PDFViewer` component to your main application file.

```tsx
// App.tsx
import { PDFViewer } from "./PDFViewer";

function App() {
  return <PDFViewer />;
}

export default App;
```

## Interactive Example

When you run the code above, it produces a functional, scrollable PDF viewer like the one shown here. You now have a working PDF viewer!
