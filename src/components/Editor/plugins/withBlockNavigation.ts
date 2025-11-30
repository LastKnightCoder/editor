import {
  Editor,
  Element as SlateElement,
  Range,
  Transforms,
  NodeEntry,
  Path,
} from "slate";
import {
  focusPreviousBlock,
  BlockNavigationMeta,
  getSiblingBlockEntry,
  hasBlockNavigation,
  hasAncestorBlockType,
} from "@/components/Editor/utils/blockNavigation";
import { isBlockElementEmpty } from "@/components/Editor/utils";
import { BlockElement } from "@/components/Editor/types";

const getCurrentParagraphEntry = (
  editor: Editor,
): NodeEntry<SlateElement> | null => {
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
  if (blockEntry[0].type !== "paragraph") {
    return null;
  }

  return blockEntry as NodeEntry<SlateElement>;
};

const shouldNavigatePrev = (
  editor: Editor,
  blockEntry: NodeEntry<SlateElement>,
) => {
  const { selection } = editor;
  if (!selection || Range.isExpanded(selection)) {
    return false;
  }
  return Editor.isStart(editor, selection.anchor, blockEntry[1]);
};

const tryNavigatePrevious = (
  editor: Editor,
  reason: BlockNavigationMeta["reason"],
  removeIfEmpty: boolean,
) => {
  const blockEntry = getCurrentParagraphEntry(editor);
  if (!blockEntry) {
    return false;
  }

  if (!shouldNavigatePrev(editor, blockEntry)) {
    return false;
  }

  if (
    hasAncestorBlockType(editor, blockEntry[1], [
      "tabs",
      "multi-column-item",
    ])
  ) {
    return false;
  }

  const prevEntry = getSiblingBlockEntry(editor, blockEntry[1], "backward");
  if (!prevEntry) {
    return false;
  }

  const [prevNode, prevPath] = prevEntry;
  const sameParent = Path.equals(
    Path.parent(blockEntry[1]),
    Path.parent(prevPath),
  );
  if (reason === "enter" && !sameParent) {
    return false;
  }

  const isPrevVoid = editor.isVoid(prevNode);
  const hasNavigator = SlateElement.isElement(prevNode)
    ? hasBlockNavigation(prevNode)
    : false;

  if (reason === "enter" && !isPrevVoid) {
    return false;
  }

  if (!isPrevVoid && !hasNavigator) {
    return false;
  }

  const meta: BlockNavigationMeta = {
    reason,
    direction: "backward",
  };
  const focused = focusPreviousBlock(editor, blockEntry[1], meta);
  if (!focused) {
    return false;
  }

  if (
    removeIfEmpty &&
    isBlockElementEmpty(blockEntry[0] as BlockElement)
  ) {
    Transforms.removeNodes(editor, {
      at: blockEntry[1],
    });
  }

  return true;
};

export const withBlockNavigation = (editor: Editor) => {
  const { deleteBackward, insertBreak } = editor;

  editor.deleteBackward = (unit) => {
    const handled = tryNavigatePrevious(editor, "delete", true);
    if (handled) {
      return;
    }

    deleteBackward(unit);
  };

  editor.insertBreak = () => {
    const handled = tryNavigatePrevious(editor, "enter", false);
    if (handled) {
      return;
    }
    insertBreak();
  };

  return editor;
};
