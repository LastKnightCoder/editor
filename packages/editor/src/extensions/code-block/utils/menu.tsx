import { ChevronLeft, ChevronRight, Code2, Copy, Plus, X } from "lucide-react";
import { Editor, Element, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { CODE_BLOCK_LANGUAGE_OPTIONS, normalizeCodeBlockLanguageDisplayName } from "@tau/shared";

import type { EditorCommand } from "../../../api/command";
import type { EditorMenuEntry } from "../../../api/menu";
import { notifierOf } from "../../../services";
import type { CodeBlockElement } from "../../../types";
import { codeBlockActionsMap, codeBlockMap } from "./controllerMaps";
import {
  createInitialMagicMove,
  getActiveStepCode,
  getActiveStepHighlightLines,
  insertNextMagicMoveStep,
  normalizeMagicMove,
  removeMagicMoveStep,
} from "./magicMoveOps";

/** 代码块特有的菜单条目（删除等公共条目由内核默认菜单贡献，01 §5.4） */
const asCodeBlock = (element: Element | undefined): CodeBlockElement | null =>
  element?.type === "code-block" ? (element as CodeBlockElement) : null;

const setCodeBlockNodes = (
  editor: Editor,
  element: CodeBlockElement,
  props: Partial<CodeBlockElement>
) => {
  Transforms.setNodes(editor, props, { at: ReactEditor.findPath(editor, element) });
};

const magicMoveOf = (element: CodeBlockElement) => normalizeMagicMove(element.magicMove);

export const codeBlockCommands: EditorCommand[] = [
  {
    id: "tau.code-block.copy-code",
    title: "复制代码",
    run: (editor, ctx) => {
      const element = asCodeBlock(ctx.element);
      if (!element) return;
      const notifier = notifierOf(editor);
      const codeEditor = codeBlockMap.get(element.uuid);
      if (navigator.clipboard && codeEditor) {
        void navigator.clipboard
          .writeText(codeEditor.getValue())
          .then(() => notifier.success("代码复制成功"))
          .catch(() => notifier.error("代码复制失败"));
      } else {
        notifier.error("代码复制失败");
      }
    },
  },
  {
    id: "tau.code-block.magic-move.enable",
    title: "开启 Diff 动画",
    run: (editor, ctx) => {
      const element = asCodeBlock(ctx.element);
      if (!element) return;
      const sourceCode = element.code || "";
      setCodeBlockNodes(editor, element, {
        code: sourceCode,
        magicMove: createInitialMagicMove(sourceCode, element.highlightLines),
      });
      notifierOf(editor).success("已开启 Diff 动画");
    },
  },
  {
    id: "tau.code-block.magic-move.disable",
    title: "关闭 Diff 动画",
    run: (editor, ctx) => {
      const element = asCodeBlock(ctx.element);
      const magicMove = element && magicMoveOf(element);
      if (!element || !magicMove) return;
      const highlightLines = getActiveStepHighlightLines(magicMove);
      setCodeBlockNodes(editor, element, {
        code: getActiveStepCode(magicMove, element.code || ""),
        highlightLines,
      });
      const path = ReactEditor.findPath(editor, element);
      Transforms.unsetNodes(editor, "magicMove", { at: path });
      if (!highlightLines) {
        Transforms.unsetNodes(editor, "highlightLines", { at: path });
      }
      notifierOf(editor).success("已关闭 Diff 动画");
    },
  },
  {
    id: "tau.code-block.magic-move.insert-next-step",
    title: "新增下一步",
    run: (editor, ctx) => {
      const element = asCodeBlock(ctx.element);
      const magicMove = element && magicMoveOf(element);
      if (!element || !magicMove) return;
      const nextMagicMove = insertNextMagicMoveStep(
        magicMove,
        element.code || "",
        getActiveStepHighlightLines(magicMove)
      );
      setCodeBlockNodes(editor, element, {
        code: getActiveStepCode(nextMagicMove, element.code || ""),
        magicMove: nextMagicMove,
      });
      notifierOf(editor).success("已新增下一步");
    },
  },
  {
    id: "tau.code-block.magic-move.remove-current-step",
    title: "删除当前步骤",
    run: (editor, ctx) => {
      const element = asCodeBlock(ctx.element);
      const magicMove = element && magicMoveOf(element);
      if (!element || !magicMove) return;
      const result = removeMagicMoveStep(
        magicMove,
        element.code || "",
        getActiveStepHighlightLines(magicMove)
      );
      if (!result.removed) return;
      const notifier = notifierOf(editor);
      if (result.magicMove) {
        setCodeBlockNodes(editor, element, {
          code: result.code,
          magicMove: result.magicMove,
        });
        notifier.success("已删除当前步骤");
        return;
      }
      setCodeBlockNodes(editor, element, {
        code: result.code,
        highlightLines: result.highlightLines,
      });
      const path = ReactEditor.findPath(editor, element);
      Transforms.unsetNodes(editor, "magicMove", { at: path });
      if (!result.highlightLines) {
        Transforms.unsetNodes(editor, "highlightLines", { at: path });
      }
      notifier.success("步骤已删除，Diff 动画已关闭");
    },
  },
  {
    id: "tau.code-block.magic-move.previous-step",
    title: "上一步",
    run: (_editor, ctx) => {
      const element = asCodeBlock(ctx.element);
      if (!element) return;
      codeBlockActionsMap.get(element.uuid)?.goToPreviousStep();
    },
  },
  {
    id: "tau.code-block.magic-move.next-step",
    title: "下一步",
    run: (_editor, ctx) => {
      const element = asCodeBlock(ctx.element);
      if (!element) return;
      codeBlockActionsMap.get(element.uuid)?.goToNextStep();
    },
  },
  {
    id: "tau.code-block.set-language",
    title: "修改语言",
    run: (editor, ctx) => {
      const element = asCodeBlock(ctx.element);
      const language = (ctx.payload as { language?: string })?.language;
      if (!element || !language) return;
      setCodeBlockNodes(editor, element, { language });
    },
  },
];

/** 步骤条命令只在多步 Diff 动画且有挂载的步骤条时可用 */
const hasStepBar = (element: CodeBlockElement) => {
  const magicMove = magicMoveOf(element);
  return Boolean(magicMove && magicMove.steps.length > 1 && codeBlockActionsMap.has(element.uuid));
};

export const codeBlockMenuItems: EditorMenuEntry[] = [
  {
    id: "tau.code-block.copy-code",
    title: "复制代码",
    icon: <Copy size={16} />,
    command: "tau.code-block.copy-code",
  },
  {
    id: "tau.code-block.magic-move.enable",
    title: "开启 Diff 动画",
    icon: <Code2 size={16} />,
    command: "tau.code-block.magic-move.enable",
    when: ctx => !magicMoveOf(ctx.element as CodeBlockElement),
  },
  {
    id: "tau.code-block.magic-move.insert-next-step",
    title: "新增下一步",
    icon: <Plus size={16} />,
    command: "tau.code-block.magic-move.insert-next-step",
    when: ctx => Boolean(magicMoveOf(ctx.element as CodeBlockElement)),
  },
  {
    id: "tau.code-block.magic-move.remove-current-step",
    title: "删除当前步骤",
    icon: <X size={16} />,
    command: "tau.code-block.magic-move.remove-current-step",
    when: ctx => Boolean(magicMoveOf(ctx.element as CodeBlockElement)),
    disabled: ctx => {
      const magicMove = magicMoveOf(ctx.element as CodeBlockElement);
      return !magicMove || magicMove.steps.length < 2;
    },
  },
  {
    id: "tau.code-block.magic-move.disable",
    title: "关闭 Diff 动画",
    icon: <X size={16} />,
    command: "tau.code-block.magic-move.disable",
    when: ctx => Boolean(magicMoveOf(ctx.element as CodeBlockElement)),
  },
  {
    id: "tau.code-block.magic-move.previous-step",
    title: "上一步",
    icon: <ChevronLeft size={16} />,
    command: "tau.code-block.magic-move.previous-step",
    when: ctx => hasStepBar(ctx.element as CodeBlockElement),
    disabled: ctx =>
      !codeBlockActionsMap.get((ctx.element as CodeBlockElement).uuid)?.hasPreviousStep,
  },
  {
    id: "tau.code-block.magic-move.next-step",
    title: "下一步",
    icon: <ChevronRight size={16} />,
    command: "tau.code-block.magic-move.next-step",
    when: ctx => hasStepBar(ctx.element as CodeBlockElement),
    disabled: ctx => !codeBlockActionsMap.get((ctx.element as CodeBlockElement).uuid)?.hasNextStep,
  },
  {
    id: "tau.code-block.set-language",
    title: "修改语言",
    icon: <Code2 size={16} />,
    children: CODE_BLOCK_LANGUAGE_OPTIONS.map(lang => ({
      id: `tau.code-block.set-language-${lang.value}`,
      title: lang.label,
      command: "tau.code-block.set-language",
      payload: { language: lang.value },
      disabled: ctx =>
        normalizeCodeBlockLanguageDisplayName((ctx.element as CodeBlockElement).language) ===
        lang.value,
    })),
  },
];
