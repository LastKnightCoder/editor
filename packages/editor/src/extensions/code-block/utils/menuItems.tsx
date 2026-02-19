import {
  Copy,
  Trash2,
  Code2,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
} from "lucide-react";
import { Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { App } from "antd";

import {
  ContextMenuItem,
  BuildMenuParams,
} from "../../../components/EditorContextMenu/types";
import { deleteNode } from "../../../utils/nodeOperations";
import type { CodeBlockElement } from "../../../types";
import { codeBlockMap, codeBlockActionsMap } from "../index";
import {
  createInitialMagicMove,
  getActiveStepCode,
  insertNextMagicMoveStep,
  normalizeMagicMove,
  removeMagicMoveStep,
} from "./magicMoveOps";

// 常用编程语言列表
const COMMON_LANGUAGES = [
  { name: "JavaScript", value: "javascript" },
  { name: "TypeScript", value: "typescript" },
  { name: "Python", value: "python" },
  { name: "Java", value: "java" },
  { name: "C++", value: "C++" },
  { name: "C#", value: "csharp" },
  { name: "Go", value: "go" },
  { name: "Rust", value: "rust" },
  { name: "PHP", value: "php" },
  { name: "Ruby", value: "ruby" },
  { name: "Swift", value: "swift" },
  { name: "Kotlin", value: "kotlin" },
  { name: "HTML", value: "html" },
  { name: "CSS", value: "css" },
  { name: "SQL", value: "sql" },
  { name: "Bash", value: "bash" },
  { name: "JSON", value: "json" },
  { name: "Markdown", value: "markdown" },
  { name: "YAML", value: "yaml" },
  { name: "Dockerfile", value: "dockerfile" },
  { name: "Plain Text", value: "text" },
];

/**
 * 构建代码块菜单项
 */
export function buildCodeBlockMenuItems(
  params: BuildMenuParams<CodeBlockElement>,
  message?: ReturnType<typeof App.useApp>["message"],
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
        const nextMagicMove = createInitialMagicMove(sourceCode);
        Transforms.setNodes(
          editor,
          {
            code: sourceCode,
            magicMove: nextMagicMove,
          },
          { at: elementPath },
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
        );
        const currentCode = getActiveStepCode(
          nextMagicMove,
          element.code || "",
        );
        Transforms.setNodes(
          editor,
          {
            code: currentCode,
            magicMove: nextMagicMove,
          },
          { at: elementPath },
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
        const result = removeMagicMoveStep(magicMove, element.code || "");
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
            { at: elementPath },
          );
          message?.success("已删除当前步骤");
          return;
        }
        Transforms.setNodes(editor, { code: result.code }, { at: elementPath });
        Transforms.unsetNodes(editor, "magicMove", { at: elementPath });
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
        Transforms.setNodes(editor, { code: currentCode }, { at: elementPath });
        Transforms.unsetNodes(editor, "magicMove", { at: elementPath });
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
      children: COMMON_LANGUAGES.map((lang) => ({
        key: `lang-${lang.value}`,
        label: lang.name,
        disabled: element.language?.toLowerCase() === lang.value.toLowerCase(),
        onSelect: () => {
          const elementPath = ReactEditor.findPath(editor, element);
          Transforms.setNodes(
            editor,
            { language: lang.value },
            { at: elementPath },
          );
        },
      })),
    },
    // 删除
    {
      key: "delete",
      label: "删除",
      icon: <Trash2 size={16} />,
      danger: true,
      onSelect: () => deleteNode(editor, path),
    },
  );

  return menuItems;
}
