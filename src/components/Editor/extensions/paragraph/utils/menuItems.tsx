import {
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  List,
  ListOrdered,
  Highlighter,
  ChevronDown,
  MessageSquare,
  Quote,
  Copy,
  Trash2,
  RefreshCw,
  Info,
  AlertTriangle,
  Lightbulb,
  AlertCircle,
  FileText,
  Circle,
} from "lucide-react";
import type { MessageInstance } from "antd/es/message/interface";

import {
  ContextMenuItem,
  BuildMenuParams,
} from "../../../components/EditorContextMenu/types";
import {
  transformNodeType,
  copyNodeToClipboard,
  deleteNode,
} from "../../../utils/nodeOperations";
import { ParagraphElement } from "../../../types";

/**
 * 构建段落菜单项
 */
export function buildParagraphMenuItems(
  params: BuildMenuParams<ParagraphElement>,
  message?: MessageInstance,
): ContextMenuItem[] {
  const { element, editor, path } = params;

  return [
    // 转换成（二级菜单）
    {
      key: "transform",
      label: "转换成",
      icon: <RefreshCw size={16} />,
      children: [
        // 标题（三级菜单）
        {
          key: "header",
          label: "标题",
          icon: <Heading1 size={16} />,
          children: [
            {
              key: "header-1",
              label: "标题 1",
              icon: <Heading1 size={16} />,
              onSelect: () => transformNodeType(editor, path, "header", { level: 1 }),
            },
            {
              key: "header-2",
              label: "标题 2",
              icon: <Heading2 size={16} />,
              onSelect: () => transformNodeType(editor, path, "header", { level: 2 }),
            },
            {
              key: "header-3",
              label: "标题 3",
              icon: <Heading3 size={16} />,
              onSelect: () => transformNodeType(editor, path, "header", { level: 3 }),
            },
            {
              key: "header-4",
              label: "标题 4",
              icon: <Heading4 size={16} />,
              onSelect: () => transformNodeType(editor, path, "header", { level: 4 }),
            },
            {
              key: "header-5",
              label: "标题 5",
              icon: <Heading5 size={16} />,
              onSelect: () => transformNodeType(editor, path, "header", { level: 5 }),
            },
            {
              key: "header-6",
              label: "标题 6",
              icon: <Heading6 size={16} />,
              onSelect: () => transformNodeType(editor, path, "header", { level: 6 }),
            },
          ],
        },
        // 列表类型
        {
          key: "bulleted-list",
          label: "无序列表",
          icon: <List size={16} />,
          onSelect: () => transformNodeType(editor, path, "bulleted-list"),
        },
        {
          key: "numbered-list",
          label: "有序列表",
          icon: <ListOrdered size={16} />,
          onSelect: () => transformNodeType(editor, path, "numbered-list"),
        },
        // 块类型
        {
          key: "highlight-block",
          label: "高亮块",
          icon: <Highlighter size={16} />,
          children: [
            {
              key: "highlight-red",
              label: "红色",
              icon: <Circle size={16} style={{ fill: "#ef4444", color: "#ef4444" }} />,
              onSelect: () => transformNodeType(editor, path, "highlight-block", { color: "red" }),
            },
            {
              key: "highlight-orange",
              label: "橙色",
              icon: <Circle size={16} style={{ fill: "#f97316", color: "#f97316" }} />,
              onSelect: () => transformNodeType(editor, path, "highlight-block", { color: "orange" }),
            },
            {
              key: "highlight-yellow",
              label: "黄色",
              icon: <Circle size={16} style={{ fill: "#eab308", color: "#eab308" }} />,
              onSelect: () => transformNodeType(editor, path, "highlight-block", { color: "yellow" }),
            },
            {
              key: "highlight-green",
              label: "绿色",
              icon: <Circle size={16} style={{ fill: "#22c55e", color: "#22c55e" }} />,
              onSelect: () => transformNodeType(editor, path, "highlight-block", { color: "green" }),
            },
            {
              key: "highlight-blue",
              label: "蓝色",
              icon: <Circle size={16} style={{ fill: "#3b82f6", color: "#3b82f6" }} />,
              onSelect: () => transformNodeType(editor, path, "highlight-block", { color: "blue" }),
            },
            {
              key: "highlight-purple",
              label: "紫色",
              icon: <Circle size={16} style={{ fill: "#a855f7", color: "#a855f7" }} />,
              onSelect: () => transformNodeType(editor, path, "highlight-block", { color: "purple" }),
            },
          ],
        },
        {
          key: "detail",
          label: "详情块",
          icon: <ChevronDown size={16} />,
          onSelect: () => transformNodeType(editor, path, "detail"),
        },
        {
          key: "callout",
          label: "Callout 块",
          icon: <MessageSquare size={16} />,
          children: [
            {
              key: "callout-info",
              label: "信息",
              icon: <Info size={16} />,
              onSelect: () =>
                transformNodeType(editor, path, "callout", {
                  calloutType: "info",
                  title: "信息",
                }),
            },
            {
              key: "callout-tip",
              label: "提示",
              icon: <Lightbulb size={16} />,
              onSelect: () =>
                transformNodeType(editor, path, "callout", {
                  calloutType: "tip",
                  title: "提示",
                }),
            },
            {
              key: "callout-warning",
              label: "警告",
              icon: <AlertTriangle size={16} />,
              onSelect: () =>
                transformNodeType(editor, path, "callout", {
                  calloutType: "warning",
                  title: "警告",
                }),
            },
            {
              key: "callout-danger",
              label: "危险",
              icon: <AlertCircle size={16} />,
              onSelect: () =>
                transformNodeType(editor, path, "callout", {
                  calloutType: "danger",
                  title: "危险",
                }),
            },
            {
              key: "callout-note",
              label: "备注",
              icon: <FileText size={16} />,
              onSelect: () =>
                transformNodeType(editor, path, "callout", {
                  calloutType: "note",
                  title: "备注",
                }),
            },
          ],
        },
        {
          key: "blockquote",
          label: "引用块",
          icon: <Quote size={16} />,
          onSelect: () => transformNodeType(editor, path, "blockquote"),
        },
      ],
    },
    // 复制
    {
      key: "copy",
      label: "复制",
      icon: <Copy size={16} />,
      onSelect: async () => {
        await copyNodeToClipboard(editor, element, message);
      },
    },
    // 删除
    {
      key: "delete",
      label: "删除",
      icon: <Trash2 size={16} />,
      danger: true,
      onSelect: () => deleteNode(editor, path),
    },
  ];
}
