import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Editor } from "slate";
import type { SerializedSelection } from "@/services/content-editing";
import InlineAIComposerPanel from "./components/InlineAIComposerPanel";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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
  panelRoot.render(
    createElement(InlineAIComposerPanel, {
      editor,
      source,
      initialSelection: options?.initialSelection || null,
      onClose: closeInlineAIComposer,
    }),
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
