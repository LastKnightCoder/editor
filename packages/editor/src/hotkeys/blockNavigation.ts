import { Editor, Element as SlateElement, Range, NodeEntry } from "slate";
import type { EditorCommand, EditorHotkey } from "../api/command";
import {
  focusPreviousBlock,
  focusNextBlock,
  getSiblingBlockEntry,
  BlockNavigationMeta,
  hasBlockNavigation,
  hasBlockNavigationBoundary,
} from "../utils";
import useBlockPanelStore from "../stores/useBlockPanelStore";

const getCurrentBlockEntry = (editor: Editor) => {
  const { selection } = editor;
  if (!selection || Range.isExpanded(selection)) {
    return null;
  }
  const blockEntry = Editor.above(editor, {
    match: n => SlateElement.isElement(n) && editor.isBlock(n),
  });
  if (!blockEntry) {
    return null;
  }
  return blockEntry as NodeEntry<SlateElement>;
};

const createArrowCommand = (direction: BlockNavigationMeta["direction"]): EditorCommand => ({
  id: direction === "backward" ? "tau.edit.block-up" : "tau.edit.block-down",
  title: direction === "backward" ? "聚焦上一块" : "聚焦下一块",
  run: (editor, ctx) => {
    const { blockPanelVisible, ownerEditor } = useBlockPanelStore.getState();
    if (blockPanelVisible && ownerEditor === editor) {
      return;
    }

    const blockEntry = getCurrentBlockEntry(editor);
    if (!blockEntry) {
      return;
    }

    if (hasBlockNavigationBoundary(editor, blockEntry[1])) {
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
    const hasNavigator = SlateElement.isElement(siblingNode) && hasBlockNavigation(siblingNode);
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
      ctx.event?.preventDefault();
    }
  },
});

export const blockNavigationCommands: EditorCommand[] = [
  createArrowCommand("backward"),
  createArrowCommand("forward"),
];

export const blockNavigationHotkeys: EditorHotkey[] = [
  { key: "ArrowUp", command: "tau.edit.block-up" },
  { key: "ArrowDown", command: "tau.edit.block-down" },
];
