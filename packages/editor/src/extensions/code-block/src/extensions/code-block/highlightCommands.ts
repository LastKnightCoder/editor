import { Element as SlateElement, Node, Transforms, type Path } from "slate";
import { ReactEditor } from "slate-react";
import type { EditorCommand } from "@tau/editor/api";
import { activeCodeStep, isCodeBlockV2, updateCodeStep } from "../../codeSteps";
import type { CodeBlockElement } from "../../types";
import { getActiveStepHighlightLines, normalizeMagicMove } from "./utils/magicMoveOps";
import { mergeHighlightRange, removeHighlightRange } from "@tau/editor-source-view/overlay";

export const highlightCommandIds = {
  add: "tau.code-block.highlight-lines.add",
  remove: "tau.code-block.highlight-lines.remove",
} as const;

const changeHighlight =
  (remove: boolean): EditorCommand["run"] =>
  (editor, ctx) => {
    const target = ctx.element;
    const range = ctx.payload;
    if (
      target?.type !== "code-block" ||
      !range ||
      typeof range !== "object" ||
      Array.isArray(range)
    )
      return;
    if (!("start" in range) || !("end" in range)) return;
    const { start, end } = range;
    if (
      typeof start !== "number" ||
      typeof end !== "number" ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 1 ||
      end < 1
    )
      return;
    let path: Path;
    if (ctx.path !== undefined) {
      path = ctx.path;
    } else {
      try {
        path = ReactEditor.findPath(editor, target);
      } catch {
        // 已卸载或被替换的目标不再具有 React 路径。
        return;
      }
    }
    if (
      !Array.isArray(path) ||
      path.length === 0 ||
      !path.every(index => Number.isSafeInteger(index) && index >= 0) ||
      !Node.has(editor, path)
    )
      return;
    const element = Node.get(editor, path);
    if (
      !SlateElement.isElement(element) ||
      element.type !== "code-block" ||
      (element !== target && (!target.uuid || element.uuid !== target.uuid))
    )
      return;
    const block = element as CodeBlockElement;
    if (isCodeBlockV2(block)) {
      const { step } = activeCodeStep(editor, block);
      if (!step) return;
      const lineCount = step.code.split("\n").length;
      if (start > lineCount || end > lineCount) return;
      const next = (remove ? removeHighlightRange : mergeHighlightRange)(
        step.highlightLines,
        start,
        end
      );
      updateCodeStep(editor, block, { highlightLines: next || undefined });
      return;
    }
    const magicMove = normalizeMagicMove(block.magicMove);
    const code = magicMove?.steps[magicMove.activeStep]?.code ?? block.code ?? "";
    const lineCount = code.split("\n").length;
    if (start > lineCount || end > lineCount) return;
    const current = magicMove ? getActiveStepHighlightLines(magicMove) : block.highlightLines;
    const next = (remove ? removeHighlightRange : mergeHighlightRange)(current, start, end);
    if (magicMove) {
      const activeStep = magicMove.activeStep;
      Transforms.setNodes(
        editor,
        {
          magicMove: {
            ...magicMove,
            steps: magicMove.steps.map((step, index) =>
              index === activeStep ? { ...step, highlightLines: next || undefined } : step
            ),
          },
        },
        { at: path }
      );
    } else if (next) {
      Transforms.setNodes(editor, { highlightLines: next }, { at: path });
    } else {
      Transforms.unsetNodes(editor, "highlightLines", { at: path });
    }
  };

export const codeBlockHighlightCommands: EditorCommand[] = [
  {
    id: highlightCommandIds.add,
    title: "高亮选中行",
    when: editor => !ReactEditor.isReadOnly(editor),
    run: changeHighlight(false),
  },
  {
    id: highlightCommandIds.remove,
    title: "取消高亮选中行",
    when: editor => !ReactEditor.isReadOnly(editor),
    run: changeHighlight(true),
  },
];
