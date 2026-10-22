import type { RefObject } from "react";
import type { EditorRef } from "@tau/editor";
import type { ReadingModeState } from "../readingMode/useReadingMode";
import type { MobileEditorToolbarController } from "../editorToolbar/useMobileEditorToolbarController";
import { resolveHandleBlockIndex } from "./blockHandleState";
import { getSlateEditor } from "./measureBlocks";
import { useBlockSelection } from "./useBlockSelection";

type UseEditorBlockSelectionOptions = {
  editorRef: RefObject<EditorRef | null>;
  readingMode: Pick<ReadingModeState, "editing" | "exitEditing" | "canEdit">;
  toolbarController: MobileEditorToolbarController;
};

/**
 * 编辑页接入块选择的公共状态：块选择、当前 Slate 编辑器与块数、把手所在块。
 * 渲染期读取编辑器，选区与文档变化经 controller 的选区版本触发重渲染。
 */
export function useEditorBlockSelection(options: UseEditorBlockSelectionOptions) {
  const { editorRef, readingMode, toolbarController } = options;
  const slateEditor = getSlateEditor(editorRef);
  const blockCount = slateEditor?.children.length ?? 0;
  const blockSelection = useBlockSelection({
    blockCount,
    editing: readingMode.editing,
    exitEditing: readingMode.exitEditing,
    disabled: !readingMode.canEdit,
  });
  const handleBlockIndex = blockSelection.active
    ? null
    : resolveHandleBlockIndex(slateEditor, readingMode.editing, toolbarController);
  return { blockSelection, slateEditor, blockCount, handleBlockIndex };
}
