import React from "react";
import { Editor, Element as SlateElement, Range, NodeEntry } from "slate";
import { IHotKeyConfig } from "../types";
import {
  focusPreviousBlock,
  focusNextBlock,
  getSiblingBlockEntry,
  BlockNavigationMeta,
  hasBlockNavigation,
  hasAncestorBlockType,
} from "../utils";
import useBlockPanelStore from "../stores/useBlockPanelStore";

const getCurrentBlockEntry = (editor: Editor) => {
  const { selection } = editor;
  if (!selection || Range.isExpanded(selection)) {
    return null;
  }
  const blockEntry = Editor.above(editor, {
    match: (n) => SlateElement.isElement(n) && editor.isBlock(n),
  });
  if (!blockEntry) {
    return null;
  }
  return blockEntry as NodeEntry<SlateElement>;
};

const createArrowHandler = (direction: BlockNavigationMeta["direction"]) => {
  return (editor: Editor, event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) {
      return;
    }
    const { blockPanelVisible, ownerEditor } = useBlockPanelStore.getState();
    if (blockPanelVisible && ownerEditor === editor) {
      return;
    }

    const blockEntry = getCurrentBlockEntry(editor);
    if (!blockEntry) {
      return;
    }

    if (
      hasAncestorBlockType(editor, blockEntry[1], ["tabs", "multi-column-item"])
    ) {
      return;
    }

    const { selection } = editor;
    if (!selection || Range.isExpanded(selection)) {
      return;
    }

    const isAtEdge =
      direction === "backward"
        ? Editor.isStart(editor, selection.anchor, blockEntry[1])
        : Editor.isEnd(editor, selection.anchor, blockEntry[1]);

    if (!isAtEdge) {
      return;
    }

    const siblingEntry = getSiblingBlockEntry(editor, blockEntry[1], direction);
    if (!siblingEntry) {
      return;
    }
    const [siblingNode] = siblingEntry;
    const isVoidSibling = editor.isVoid(siblingNode);
    const hasNavigator =
      SlateElement.isElement(siblingNode) && hasBlockNavigation(siblingNode);
    if (!isVoidSibling && !hasNavigator) {
      return;
    }

    const meta: BlockNavigationMeta = {
      reason: "arrow",
      direction,
    };
    const focused =
      direction === "backward"
        ? focusPreviousBlock(editor, blockEntry[1], meta)
        : focusNextBlock(editor, blockEntry[1], meta);
    if (focused) {
      event.preventDefault();
    }
  };
};

export const blockNavigationHotkeys: IHotKeyConfig[] = [
  {
    hotKey: "up",
    action: createArrowHandler("backward"),
  },
  {
    hotKey: "down",
    action: createArrowHandler("forward"),
  },
];
