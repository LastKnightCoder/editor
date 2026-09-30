import { Editor, Element as SlateElement, Range, Transforms, NodeEntry } from "slate";
import {
  BlockNavigationMeta,
  focusPreviousBlock,
  getSiblingBlockEntry,
  hasBlockNavigation,
  hasAncestorBlockType,
} from "../utils/blockNavigation";
import { isBlockElementEmpty } from "../utils";
import { BlockElement } from "../types";

const getCurrentParagraphEntry = (editor: Editor): NodeEntry<SlateElement> | null => {
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
  if (blockEntry[0].type !== "paragraph") {
    return null;
  }

  return blockEntry as NodeEntry<SlateElement>;
};

const shouldNavigatePrev = (editor: Editor, blockEntry: NodeEntry<SlateElement>) => {
  const { selection } = editor;
  if (!selection || Range.isExpanded(selection)) {
    return false;
  }
  return Editor.isStart(editor, selection.anchor, blockEntry[1]);
};

const tryNavigatePrevious = (editor: Editor, removeIfEmpty: boolean) => {
  const blockEntry = getCurrentParagraphEntry(editor);
  if (!blockEntry) {
    return false;
  }

  if (!shouldNavigatePrev(editor, blockEntry)) {
    return false;
  }

  if (hasAncestorBlockType(editor, blockEntry[1], ["tabs"])) {
    return false;
  }

  const prevEntry = getSiblingBlockEntry(editor, blockEntry[1], "backward");
  if (!prevEntry) {
    return false;
  }

  const [prevNode] = prevEntry;
  const isPrevVoid = editor.isVoid(prevNode);
  const hasNavigator = SlateElement.isElement(prevNode) ? hasBlockNavigation(prevNode) : false;

  if (!isPrevVoid && !hasNavigator) {
    return false;
  }

  const meta: BlockNavigationMeta = {
    reason: "delete",
    direction: "backward",
  };
  const focused = focusPreviousBlock(editor, blockEntry[1], meta);
  if (!focused) {
    return false;
  }

  if (removeIfEmpty && isBlockElementEmpty(blockEntry[0] as BlockElement)) {
    Transforms.removeNodes(editor, {
      at: blockEntry[1],
    });
  }

  return true;
};

export const withBlockNavigation = (editor: Editor) => {
  const { deleteBackward } = editor;

  editor.deleteBackward = unit => {
    const handled = tryNavigatePrevious(editor, true);
    if (handled) {
      return;
    }

    deleteBackward(unit);
  };

  return editor;
};
