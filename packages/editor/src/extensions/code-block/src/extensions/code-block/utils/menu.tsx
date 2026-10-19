import {
  Code2,
  Copy,
  FileText,
  ListOrdered,
  Plus,
  Presentation,
  Trash2,
  WrapText,
  X,
} from "lucide-react";
import { Editor, Element, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { CODE_BLOCK_LANGUAGE_OPTIONS, normalizeCodeBlockLanguageDisplayName } from "@tau/shared";

import {
  getCommandElementPath,
  notifierOf,
  type EditorCommand,
  type EditorMenuContext,
  type EditorMenuEntry,
} from "@tau/editor/api";
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
    title: "开启分步演示",
    run: (editor, ctx) => {
      const element = asCodeBlock(ctx.element);
      if (!element) return;
      const sourceCode = element.code || "";
      setCodeBlockNodes(editor, element, {
        code: sourceCode,
        magicMove: createInitialMagicMove(sourceCode, element.highlightLines),
      });
      notifierOf(editor).success("已开启分步演示，正在编辑第 2 步");
    },
  },
  {
    id: "tau.code-block.magic-move.disable",
    title: "关闭分步演示",
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
      notifierOf(editor).success("已关闭分步演示");
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
      notifier.success("只剩一步，已关闭分步演示");
    },
  },
  {
    id: "tau.code-block.toggle-line-numbers",
    title: "显示/隐藏行号",
    run: (editor, ctx) => {
      const element = asCodeBlock(ctx.element);
      const path = getCommandElementPath(editor, ctx);
      if (!element || !path) return;
      // 行号缺省显示，只存「关闭」
      if (element.lineNumbers === false) Transforms.unsetNodes(editor, "lineNumbers", { at: path });
      else Transforms.setNodes(editor, { lineNumbers: false }, { at: path });
    },
  },
  {
    id: "tau.code-block.toggle-wrap",
    title: "开启/关闭自动换行",
    run: (editor, ctx) => {
      const element = asCodeBlock(ctx.element);
      const path = getCommandElementPath(editor, ctx);
      if (!element || !path) return;
      if (element.wrap) Transforms.unsetNodes(editor, "wrap", { at: path });
      else Transforms.setNodes(editor, { wrap: true }, { at: path });
    },
  },
  {
    id: "tau.code-block.edit-filename",
    title: "设置文件名",
    run: (_editor, ctx) => {
      const element = asCodeBlock(ctx.element);
      if (!element) return;
      codeBlockActionsMap.get(element.uuid)?.editFilename();
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

const hasSteps = (ctx: EditorMenuContext) => Boolean(magicMoveOf(ctx.element as CodeBlockElement));

export const codeBlockMenuItems: EditorMenuEntry[] = [
  {
    id: "tau.code-block.copy-code",
    title: "复制代码",
    icon: <Copy size={16} />,
    command: "tau.code-block.copy-code",
    order: 10,
  },
  {
    id: "tau.code-block.set-language",
    title: "修改语言",
    order: 20,
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
  {
    id: "tau.code-block.edit-filename",
    title: ctx => ((ctx.element as CodeBlockElement).filename ? "修改文件名" : "设置文件名"),
    icon: <FileText size={16} />,
    command: "tau.code-block.edit-filename",
    order: 30,
    when: ctx => codeBlockActionsMap.has((ctx.element as CodeBlockElement).uuid),
  },
  {
    id: "tau.code-block.toggle-line-numbers",
    title: ctx =>
      (ctx.element as CodeBlockElement).lineNumbers === false ? "显示行号" : "隐藏行号",
    icon: <ListOrdered size={16} />,
    command: "tau.code-block.toggle-line-numbers",
    order: 40,
  },
  {
    id: "tau.code-block.toggle-wrap",
    title: ctx => {
      if (hasSteps(ctx)) return "自动换行（分步演示中不可用）";
      return (ctx.element as CodeBlockElement).wrap ? "关闭自动换行" : "自动换行";
    },
    icon: <WrapText size={16} />,
    command: "tau.code-block.toggle-wrap",
    order: 50,
    disabled: hasSteps,
  },
  {
    id: "tau.code-block.magic-move.enable",
    title: "分步演示",
    icon: <Presentation size={16} />,
    command: "tau.code-block.magic-move.enable",
    order: 60,
    when: ctx => !hasSteps(ctx),
  },
  {
    id: "tau.code-block.magic-move.insert-next-step",
    title: "在后面插入一步",
    icon: <Plus size={16} />,
    command: "tau.code-block.magic-move.insert-next-step",
    order: 61,
    when: hasSteps,
  },
  {
    id: "tau.code-block.magic-move.remove-current-step",
    title: "删除当前步骤",
    icon: <Trash2 size={16} />,
    command: "tau.code-block.magic-move.remove-current-step",
    order: 62,
    danger: true,
    when: hasSteps,
  },
  {
    id: "tau.code-block.magic-move.disable",
    title: "关闭分步演示",
    icon: <X size={16} />,
    command: "tau.code-block.magic-move.disable",
    order: 63,
    when: hasSteps,
  },
];
