import { Copy, Trash2, Code2, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { CODE_BLOCK_LANGUAGE_OPTIONS, normalizeCodeBlockLanguageDisplayName } from "@tau/shared";
import { Transforms } from "slate";
import { ReactEditor } from "slate-react";
import type { EditorFeedback } from "../../../services/notifier";

import { ContextMenuItem, BuildMenuParams } from "../../../components/EditorContextMenu/types";
import type { CodeBlockElement } from "../../../types";
import { codeBlockMap, codeBlockActionsMap } from "../index";
import { deleteCodeBlock } from "./deleteCodeBlock";
import {
  createInitialMagicMove,
  getActiveStepCode,
  getActiveStepHighlightLines,
  insertNextMagicMoveStep,
  normalizeMagicMove,
  removeMagicMoveStep,
} from "./magicMoveOps";

/**
 * 构建代码块菜单项
 */
export function buildCodeBlockMenuItems(
  params: BuildMenuParams<CodeBlockElement>,
  message?: EditorFeedback
): ContextMenuItem[] {
  const { element, editor, path } = params;
  const actions = codeBlockActionsMap.get(element.uuid);
  const magicMove = normalizeMagicMove(element.magicMove);
  const hasMagicMove = Boolean(magicMove && magicMove.steps.length > 1);

  const menuItems: ContextMenuItem[] = [];

  // 复制代码
  if (message) {
    menuItems.push({
      key: "copy-code",
      label: "复制代码",
      icon: <Copy size={16} />,
      onSelect: async () => {
        try {
          const codeEditor = codeBlockMap.get(element.uuid);
          if (navigator.clipboard && codeEditor) {
            const code = codeEditor.getValue();
            await navigator.clipboard.writeText(code);
            message.success("代码复制成功");
          } else {
            message.error("复制代码失败");
          }
        } catch (error) {
          console.error("复制代码失败:", error);
          message.error("复制代码失败");
        }
      },
    });
  }

  if (!magicMove) {
    menuItems.push({
      key: "enable-diff-animation",
      label: "开启 Diff 动画",
      icon: <Code2 size={16} />,
      onSelect: () => {
        const elementPath = ReactEditor.findPath(editor, element);
        const sourceCode = element.code || "";
        const nextMagicMove = createInitialMagicMove(sourceCode, element.highlightLines);
        Transforms.setNodes(
          editor,
          {
            code: sourceCode,
            magicMove: nextMagicMove,
          },
          { at: elementPath }
        );
        message?.success("已开启 Diff 动画");
      },
    });
  }

  if (magicMove) {
    menuItems.push({
      key: "insert-next-step",
      label: "新增下一步",
      icon: <Plus size={16} />,
      onSelect: () => {
        const elementPath = ReactEditor.findPath(editor, element);
        const nextMagicMove = insertNextMagicMoveStep(
          magicMove,
          element.code || "",
          getActiveStepHighlightLines(magicMove)
        );
        const currentCode = getActiveStepCode(nextMagicMove, element.code || "");
        Transforms.setNodes(
          editor,
          {
            code: currentCode,
            magicMove: nextMagicMove,
          },
          { at: elementPath }
        );
        message?.success("已新增下一步");
      },
    });
    menuItems.push({
      key: "delete-current-step",
      label: "删除当前步骤",
      icon: <Trash2 size={16} />,
      disabled: magicMove.steps.length < 2,
      onSelect: () => {
        const elementPath = ReactEditor.findPath(editor, element);
        const result = removeMagicMoveStep(
          magicMove,
          element.code || "",
          getActiveStepHighlightLines(magicMove)
        );
        if (!result.removed) {
          return;
        }
        if (result.magicMove) {
          Transforms.setNodes(
            editor,
            {
              code: result.code,
              magicMove: result.magicMove,
            },
            { at: elementPath }
          );
          message?.success("已删除当前步骤");
          return;
        }
        Transforms.setNodes(
          editor,
          {
            code: result.code,
            highlightLines: result.highlightLines,
          },
          { at: elementPath }
        );
        Transforms.unsetNodes(editor, "magicMove", { at: elementPath });
        if (!result.highlightLines) {
          Transforms.unsetNodes(editor, "highlightLines", { at: elementPath });
        }
        message?.success("步骤已删除，Diff 动画已关闭");
      },
    });
    menuItems.push({
      key: "disable-diff-animation",
      label: "关闭 Diff 动画",
      icon: <X size={16} />,
      onSelect: () => {
        const elementPath = ReactEditor.findPath(editor, element);
        const currentCode = getActiveStepCode(magicMove, element.code || "");
        const currentHighlightLines = getActiveStepHighlightLines(magicMove);
        Transforms.setNodes(
          editor,
          {
            code: currentCode,
            highlightLines: currentHighlightLines,
          },
          { at: elementPath }
        );
        Transforms.unsetNodes(editor, "magicMove", { at: elementPath });
        if (!currentHighlightLines) {
          Transforms.unsetNodes(editor, "highlightLines", { at: elementPath });
        }
        message?.success("已关闭 Diff 动画");
      },
    });
  }

  if (hasMagicMove && actions) {
    menuItems.push({
      key: "previous-step",
      label: "上一步",
      icon: <ChevronLeft size={16} />,
      disabled: !actions.hasPreviousStep,
      onSelect: () => {
        actions.goToPreviousStep();
      },
    });
    menuItems.push({
      key: "next-step",
      label: "下一步",
      icon: <ChevronRight size={16} />,
      disabled: !actions.hasNextStep,
      onSelect: () => {
        actions.goToNextStep();
      },
    });
  }

  menuItems.push(
    // 修改语言（二级菜单）
    {
      key: "change-language",
      label: "修改语言",
      icon: <Code2 size={16} />,
      children: CODE_BLOCK_LANGUAGE_OPTIONS.map(lang => ({
        key: `lang-${lang.value}`,
        label: lang.label,
        disabled: normalizeCodeBlockLanguageDisplayName(element.language) === lang.value,
        onSelect: () => {
          const elementPath = ReactEditor.findPath(editor, element);
          Transforms.setNodes(editor, { language: lang.value }, { at: elementPath });
        },
      })),
    },
    // 删除
    {
      key: "delete",
      label: "删除",
      icon: <Trash2 size={16} />,
      danger: true,
      onSelect: () => deleteCodeBlock(editor, path),
    }
  );

  return menuItems;
}
