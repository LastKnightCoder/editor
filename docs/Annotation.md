# Annotation Plugin

The Annotation Plugin provides a comprehensive framework for adding, editing, and managing annotations within a PDF document. It supports a wide range of common annotation types, including text markups (highlight, underline), free-hand drawings (ink), shapes (squares, circles), and more.

The plugin is built on an extensible “Tool” system, allowing you to define and customize different annotation behaviors and appearances.

## Installation

This plugin has several dependencies that must be installed to handle user interactions and manage state. The history plugin is optional but recommended for undo/redo functionality.

```bash
pnpm add @embedpdf/plugin-annotation @embedpdf/plugin-interaction-manager @embedpdf/plugin-selection @embedpdf/plugin-history
```

## Registration

Import `AnnotationPluginPackage` and its dependencies. Register the dependencies before adding the annotation plugin itself.

```tsx
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
// ... other imports
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager/react";
import { SelectionPluginPackage } from "@embedpdf/plugin-selection/react";
import { HistoryPluginPackage } from "@embedpdf/plugin-history/react";
import { AnnotationPluginPackage } from "@embedpdf/plugin-annotation/react";

const plugins = [
  // ... other essential plugins
  createPluginRegistration(LoaderPluginPackage, {
    /* ... */
  }),
  createPluginRegistration(RenderPluginPackage),

  // Register dependencies first
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(SelectionPluginPackage),
  createPluginRegistration(HistoryPluginPackage),

  // Register and configure the annotation plugin
  createPluginRegistration(AnnotationPluginPackage, {
    // Optional: Set the author name for created annotations
    annotationAuthor: "Jane Doe",
  }),
];
```

## Usage

The plugin works by combining a UI component to render the annotations with a hook to manage the annotation tools and state.

### Annotation Layer Component

`<AnnotationLayer />` renders all annotations and handles interactions such as creating, selecting, moving, and resizing. Place it inside `<Scroller />`’s `renderPage` prop and wrap it with `<PagePointerProvider>` to correctly process pointer events.

```tsx
import { PagePointerProvider } from "@embedpdf/plugin-interaction-manager/react";
import { AnnotationLayer } from "@embedpdf/plugin-annotation/react";

// ...
<Scroller
  renderPage={({ width, height, pageIndex, scale, rotation }) => (
    <PagePointerProvider {...{ width, height, pageIndex, scale, rotation }}>
      <RenderLayer pageIndex={pageIndex} scale={scale} />
      <SelectionLayer pageIndex={pageIndex} scale={scale} />
      {/* Annotation Layer on top */}
      <AnnotationLayer
        pageIndex={pageIndex}
        scale={scale}
        pageWidth={width}
        pageHeight={height}
        rotation={rotation}
      />
    </PagePointerProvider>
  )}
/>;
```

### Building an Annotation Toolbar

The `useAnnotationCapability` hook provides all the methods needed to control the plugin. You can build a toolbar that allows users to select an active tool (like a pen or highlighter) and perform actions such as deleting a selected annotation.

```tsx
import { useState, useEffect } from "react";
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";

const AnnotationToolbar = () => {
  const { provides: annotationApi } = useAnnotationCapability();
  const [selected, setSelected] = useState(false);

  useEffect(() => {
    if (!annotationApi) return;
    // Listen for selection changes to enable/disable the delete button
    return annotationApi.onStateChange((state) =>
      setSelected(!!state.selectedUid),
    );
  }, [annotationApi]);

  const deleteSelected = () => {
    const selection = annotationApi?.getSelectedAnnotation();
    if (selection) {
      annotationApi?.deleteAnnotation(
        selection.object.pageIndex,
        selection.object.id,
      );
    }
  };

  return (
    <div>
      <button onClick={() => annotationApi?.setActiveTool("highlight")}>
        Highlighter
      </button>
      <button onClick={() => annotationApi?.setActiveTool("ink")}>Pen</button>
      <button onClick={deleteSelected} disabled={!selected}>
        Delete
      </button>
    </div>
  );
};
```

### Creating Custom Tools

Extend the plugin’s functionality by adding your own tools (for example, a custom image stamp). Call `addTool` on the plugin capability, usually from the `<EmbedPDF />` component’s `onInitialized` callback.

```tsx
<EmbedPDF
  // ...
  onInitialized={(registry) => {
    const annotationApi = registry.getPlugin("annotation")?.provides();
    annotationApi?.addTool({
      id: "stampApproved",
      name: "Approved Stamp",
      interaction: { exclusive: false, cursor: "copy" },
      matchScore: () => 0, // Doesn't match existing annotations
      defaults: {
        type: PdfAnnotationSubtype.STAMP,
        imageSrc: "/images/approved-stamp.png", // URL to your stamp image
      },
    });
  }}
>
  {/* ... */}
</EmbedPDF>
```

## Listening to Annotation Events

For more advanced integrations, such as saving annotation data to a backend or synchronizing state with an external data store, subscribe to annotation lifecycle events using `onAnnotationEvent`. This method allows you to react to annotation creation, updates, and deletion. Each event provides the annotation object and a `committed` flag, which indicates whether the change has been saved to the underlying PDF document.

```tsx
import { useEffect } from "react";
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";

const AnnotationLogger = () => {
  const { provides: annotationApi } = useAnnotationCapability();

  useEffect(() => {
    if (!annotationApi) return;

    const unsubscribe = annotationApi.onAnnotationEvent((event) => {
      console.log(`Annotation event: ${event.type}`, { event });

      // Example: Save to backend after a change is committed to the engine
      if (event.type === "create" && event.committed) {
        // yourApi.saveAnnotation(event.annotation);
      }
    });

    // Clean up the subscription when the component unmounts
    return unsubscribe;
  }, [annotationApi]);

  return null; // This is a non-visual component
};
```

## Default Annotation Tools

The plugin comes with a set of preconfigured tools. Activate any of these tools by passing its `id` to `setActiveTool`. Override their defaults by providing an `AnnotationTool` object with the same `id` in the plugin configuration.

| Tool Name       | id               | Description                                       |
| --------------- | ---------------- | ------------------------------------------------- |
| Highlight       | `highlight`      | Creates text highlight annotations.               |
| Underline       | `underline`      | Creates text underline annotations.               |
| Strikeout       | `strikeout`      | Creates text strikeout annotations.               |
| Squiggly        | `squiggly`       | Creates squiggly text underline annotations.      |
| Pen             | `ink`            | Free-hand drawing tool.                           |
| Ink Highlighter | `inkHighlighter` | Free-hand highlighter with a multiply blend mode. |
| Circle          | `circle`         | Draws ellipse annotations.                        |
| Square          | `square`         | Draws rectangle annotations.                      |
| Line            | `line`           | Draws straight line annotations.                  |
| Arrow           | `lineArrow`      | Draws a straight line with an arrowhead.          |
| Polyline        | `polyline`       | Draws multi-segment lines.                        |
| Polygon         | `polygon`        | Draws closed, multi-sided shapes.                 |
| Free Text       | `freeText`       | Adds a text box annotation.                       |

Image stamp Adds an image stamp. Opens a file picker by default.
Live Example
The example below includes a toolbar for selecting different annotation tools (highlight, ink pen, square) and a delete button that becomes active when an annotation is selected.

API Reference
Configuration (AnnotationPluginConfig)
Option Type Description
annotationAuthor string Sets the author name for all created annotations. Default: 'Guest'
autoCommit boolean If true, annotation changes are automatically saved to the engine. Default: true
tools AnnotationTool[] An array of custom annotation tools to add or override default tools.
colorPresets string[] A list of hex color strings to be used in a color picker UI.
deactivateToolAfterCreate boolean If true, the active tool is deselected after an annotation is created. Default: false
selectAfterCreate boolean If true, a newly created annotation is automatically selected. Default: true
Component: <AnnotationLayer />
The primary component for rendering and interacting with annotations.

Prop Type Description
pageIndex number (Required) The page index this layer corresponds to.
scale number (Required) The current zoom scale of the page.
rotation number (Required) The current rotation of the page.
pageWidth number (Required) The unscaled width of the PDF page.
pageHeight number (Required) The unscaled height of the PDF page.
selectionMenu (props) => JSX.Element A render prop for a custom menu that appears when an annotation is selected.
resizeUI / vertexUI object Objects to customize the appearance of resize and vertex handles.
selectionOutlineColor string The color of the outline around a selected annotation. Default: '#007ACC'
Customizing Handles (resizeUI and vertexUI)
You can customize the visual appearance of the interactive handles for resizing and editing vertices. Both resizeUI and vertexUI accept an object with the following shape:

interface HandleUI {
/** Handle size in CSS pixels \*/
size?: number; // Default: 12
/** Default background color for the handle _/
color?: string; // Default: '#007ACC'
/\*\* Custom component to render for each handle _/
component?: (props: HandleProps) => JSX.Element;
}
The HandleProps passed to a custom component include positioning styles and event handlers, which must be applied to your custom element.

Hook: useAnnotationCapability()
Connects your components to the annotation plugin’s state and methods.

Returns
Property Type Description
provides AnnotationCapability | null An object with methods to control the plugin, or null if not ready.
AnnotationCapability Methods
A selection of key methods available on the provides object:

Method Description
setActiveTool(toolId) Activates an annotation tool (e.g., 'ink', 'highlight'). Pass null to deactivate.
getActiveTool() Returns the currently active AnnotationTool object, or null.
addTool(tool) Registers a new custom AnnotationTool.
createAnnotation(..) Programmatically creates a new annotation on a page.
updateAnnotation(..) Updates the properties of an existing annotation.
deleteAnnotation(..) Deletes an annotation from a page.
selectAnnotation(..) Programmatically selects an annotation.
getSelectedAnnotation() Returns the currently selected TrackedAnnotation object, or null.
importAnnotations(..) Imports an array of annotations into the viewer.
commit() Manually saves all pending annotation changes to the PDF document.
onStateChange(cb) Subscribes to any change in the annotation state.
onAnnotationEvent(cb) Subscribes to events like annotation creation, updates, or deletion.
The AnnotationEvent Object
The object passed to the onAnnotationEvent callback contains details about the lifecycle event. Its shape varies based on the type property.

Event Type Properties Description
'create' annotation, pageIndex, ctx, committed Fired when an annotation is created. ctx may contain extra data like ImageData for stamps. committed is true if the change has been saved to the engine.
'update' annotation, pageIndex, patch, committed Fired when an annotation is moved, resized, or its properties change. annotation is the original object, and patch contains only the changed properties.
'delete' annotation, pageIndex, committed Fired when an annotation is deleted.
'loaded' total Fired once when the initial set of annotations is loaded from the document. total is the number of annotations loaded.
