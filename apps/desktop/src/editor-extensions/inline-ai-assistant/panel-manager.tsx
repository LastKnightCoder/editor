import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App as AntdApp } from "antd";
import type { Editor } from "slate";
import { EditorServicesProvider } from "@tau/editor/src";
import type { SerializedSelection } from "@/services/content-editing";
import { createEditorServices } from "@/services/editorServices";
import DndProvider from "@/components/DndProvider";
import InlineAIComposerPanel from "./components/InlineAIComposerPanel";

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let cachedEditorServices: ReturnType<typeof createEditorServices> | null = null;

const getEditorServices = () => {
  if (!cachedEditorServices) {
    cachedEditorServices = createEditorServices();
  }
  return cachedEditorServices;
};

const cleanup = () => {
  if (root) {
    root.unmount();
    root = null;
  }
  if (container?.parentNode) {
    container.parentNode.removeChild(container);
  }
  container = null;
};

const ensureRoot = () => {
  if (!container) {
    container = document.createElement("div");
    container.id = "inline-ai-composer-root";
    document.body.appendChild(container);
  }
  if (!root) {
    root = createRoot(container);
  }
  return root;
};

export const closeInlineAIComposer = () => {
  cleanup();
};

export const isInlineAIComposerOpen = () => {
  return !!root;
};

export const openInlineAIComposer = (
  editor: Editor,
  source: "hovering" | "hotkey",
  options?: {
    initialSelection?: SerializedSelection | null;
  },
) => {
  const panelRoot = ensureRoot();
  const services = getEditorServices();
  panelRoot.render(
    createElement(
      AntdApp,
      null,
      createElement(
        DndProvider,
        null,
        createElement(EditorServicesProvider, {
          services,
          children: createElement(InlineAIComposerPanel, {
            editor,
            source,
            initialSelection: options?.initialSelection || null,
            onClose: closeInlineAIComposer,
          }),
        }),
      ),
    ),
  );
};

export const toggleInlineAIComposer = (
  editor: Editor,
  source: "hovering" | "hotkey",
  options?: {
    initialSelection?: SerializedSelection | null;
  },
) => {
  if (isInlineAIComposerOpen()) {
    closeInlineAIComposer();
    return;
  }
  openInlineAIComposer(editor, source, options);
};
