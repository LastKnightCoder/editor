import { Editor, Element as SlateElement, Node, NodeEntry, Path, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import type { ElementSpec } from "../api/extension";

const navigationBoundaries = new WeakMap<Editor, Set<string>>();

export const registerBlockNavigationBoundaries = (
  editor: Editor,
  elements: readonly ElementSpec[]
) => {
  let types = navigationBoundaries.get(editor);
  if (!types) {
    types = new Set();
    navigationBoundaries.set(editor, types);
  }
  for (const spec of elements) {
    if (spec.isolateBlockNavigation === true) types.add(spec.type);
    else types.delete(spec.type);
  }
};

export type BlockFocusPosition = "start" | "end";
export type BlockNavigationReason = "delete" | "arrow" | "enter";
export type BlockNavigationDirection = "backward" | "forward";

export interface BlockNavigationMeta {
  reason: BlockNavigationReason;
  direction: BlockNavigationDirection;
}

export interface BlockFocusContext {
  editor: Editor;
  element: SlateElement;
  meta: BlockNavigationMeta;
}

export type BlockFocusHandler = (context: BlockFocusContext) => boolean;

export interface BlockNavigationHandler {
  focusStart?: BlockFocusHandler;
  focusEnd?: BlockFocusHandler;
}

const blockNavigationRegistry = new WeakMap<SlateElement, BlockNavigationHandler>();

export const registerBlockNavigation = (element: SlateElement, handler: BlockNavigationHandler) => {
  blockNavigationRegistry.set(element, handler);
};

export const unregisterBlockNavigation = (element: SlateElement) => {
  blockNavigationRegistry.delete(element);
};

export const hasBlockNavigation = (element: SlateElement) => {
  return blockNavigationRegistry.has(element);
};

const focusEditableElement = (
  editor: Editor,
  element: SlateElement,
  position: BlockFocusPosition
) => {
  const path = ReactEditor.findPath(editor, element);
  ReactEditor.focus(editor);
  const point = position === "start" ? Editor.start(editor, path) : Editor.end(editor, path);
  Transforms.select(editor, point);
  return true;
};

const tryFocusWithHandler = (
  editor: Editor,
  element: SlateElement,
  position: BlockFocusPosition,
  meta: BlockNavigationMeta
) => {
  const handler = blockNavigationRegistry.get(element);
  if (!handler) {
    return undefined;
  }

  const context = {
    editor,
    element,
    meta,
  };

  if (position === "start" && handler.focusStart) {
    return handler.focusStart(context);
  }
  if (position === "end" && handler.focusEnd) {
    return handler.focusEnd(context);
  }
  return undefined;
};

export const focusElementByNavigator = (
  editor: Editor,
  element: SlateElement,
  position: BlockFocusPosition,
  meta: BlockNavigationMeta
) => {
  const handlerResult = tryFocusWithHandler(editor, element, position, meta);
  if (handlerResult) {
    return true;
  }
  if (handlerResult === false) {
    return false;
  }

  if (editor.isVoid(element)) {
    return false;
  }

  return focusEditableElement(editor, element, position);
};

export const getSiblingBlockEntry = (
  editor: Editor,
  fromPath: Path,
  direction: BlockNavigationDirection
) => {
  const match = (node: Node) => SlateElement.isElement(node) && editor.isBlock(node);
  const iterator = direction === "backward" ? Editor.previous : Editor.next;

  try {
    return iterator(editor, {
      at: fromPath,
      match,
    }) as NodeEntry<SlateElement> | undefined;
  } catch (e) {
    return undefined;
  }
};

const focusSibling = (
  editor: Editor,
  fromPath: Path,
  direction: BlockNavigationDirection,
  meta: BlockNavigationMeta
) => {
  let siblingEntry = getSiblingBlockEntry(editor, fromPath, direction);
  const position: BlockFocusPosition = direction === "backward" ? "end" : "start";

  while (siblingEntry) {
    const [node, path] = siblingEntry;
    const handled = focusElementByNavigator(editor, node, position, meta);
    if (handled) {
      return true;
    }
    siblingEntry = getSiblingBlockEntry(editor, path, direction);
  }
  return false;
};

export const focusPreviousBlock = (editor: Editor, fromPath: Path, meta: BlockNavigationMeta) => {
  return focusSibling(editor, fromPath, "backward", meta);
};

export const focusNextBlock = (editor: Editor, fromPath: Path, meta: BlockNavigationMeta) => {
  return focusSibling(editor, fromPath, "forward", meta);
};

export const hasBlockNavigationBoundary = (editor: Editor, path: Path) => {
  const types = navigationBoundaries.get(editor);
  if (!types?.size) return false;
  let currentPath = path;
  while (currentPath.length > 0) {
    currentPath = Path.parent(currentPath);
    const [node] = Editor.node(editor, currentPath);
    if (SlateElement.isElement(node) && types.has(node.type)) {
      return true;
    }
  }
  return false;
};
