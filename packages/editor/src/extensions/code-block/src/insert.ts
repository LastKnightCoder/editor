import type { Editor } from "slate";
import { v4 as getUuid } from "uuid";
import {
  setOrInsertNode,
  getSelectionSnapshot,
  isSelectionSnapshotUnchanged,
} from "@tau/editor/api";
import { codeBlockMap } from "./extensions/code-block/utils/controllerMaps";

const focusInsertedCodeBlock = (editor: Editor, uuid: string, retry = 5) => {
  if (retry <= 0) return;
  const selectionSnapshot = getSelectionSnapshot(editor.selection);
  const shouldKeepFocusing = () =>
    !selectionSnapshot || isSelectionSnapshotUnchanged(editor, selectionSnapshot);
  const focusEditor = (leftTryCount: number) => {
    if (leftTryCount <= 0 || !shouldKeepFocusing()) return;
    setTimeout(() => {
      if (!shouldKeepFocusing()) return;
      const controller = codeBlockMap.get(uuid);
      if (controller) {
        controller.focus();
        controller.setCursor({ line: 0, ch: 0 });
        return;
      }
      focusEditor(leftTryCount - 1);
    }, 80);
  };
  focusEditor(retry);
};

export const insertCodeBlock = (editor: Editor, language = "javascript", code = "") => {
  const uuid = getUuid();
  const path = setOrInsertNode(editor, {
    type: "code-block",
    code,
    language,
    uuid,
    children: [{ type: "formatted", text: "" }],
  });
  focusInsertedCodeBlock(editor, uuid);
  return path;
};
