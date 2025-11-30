import {
  Copy,
  Maximize2,
  ChevronDown,
  ChevronUp,
  Trash2,
  Code2,
} from "lucide-react";
import { Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { App } from "antd";

import {
  ContextMenuItem,
  BuildMenuParams,
} from "../../../components/EditorContextMenu/types";
import { deleteNode } from "../../../utils/nodeOperations";
import { CodeBlockElement } from "../../../types";
import { codeBlockMap, codeBlockActionsMap } from "@/components/Editor/extensions/code-block";

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

  // 全屏编辑
  menuItems.push({
    key: "fullscreen",
    label: "全屏编辑",
    icon: <Maximize2 size={16} />,
    onSelect: () => {
      const actions = codeBlockActionsMap.get(element.uuid);
      if (actions) {
        actions.toggleFullscreen();
      }
    },
  });

  // 只在可折叠时显示展开/收起选项
  if (actions?.canFold) {
    menuItems.push({
      key: "toggle-fold",
      label: element.isFold ? "展开" : "收起",
      icon: element.isFold ? <ChevronDown size={16} /> : <ChevronUp size={16} />,
      onSelect: () => {
        const elementPath = ReactEditor.findPath(editor, element);
        Transforms.setNodes(
          editor,
          { isFold: !element.isFold },
          { at: elementPath },
        );
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
