import {
  FileText,
  ChevronDown,
  MessageSquare,
  Highlighter,
  List,
  ListOrdered,
  Copy,
  Trash2,
  RefreshCw,
  Info,
  AlertTriangle,
  Lightbulb,
  AlertCircle,
  Circle,
} from "lucide-react";

import {
  ContextMenuItem,
  BuildMenuParams,
} from "../../../components/EditorContextMenu/types";
import {
  transformNodeType,
  copyNodeToClipboard,
  deleteNode,
  unwrapContainerBlock,
  convertChildrenToList,
} from "../../../utils/nodeOperations";
import { BlockquoteElement } from "../../../types";
import type { MessageInstance } from "antd/es/message/interface";

/**
 * 构建引用块菜单项
 */
export function buildBlockquoteMenuItems(
  params: BuildMenuParams<BlockquoteElement>,
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
        {
          key: "paragraph",
          label: "段落",
          icon: <FileText size={16} />,
          onSelect: () => unwrapContainerBlock(editor, path),
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
          key: "highlight-block",
          label: "高亮块",
          icon: <Highlighter size={16} />,
          children: [
            {
              key: "highlight-red",
              label: "红色",
              icon: (
                <Circle
                  size={16}
                  style={{ fill: "#ef4444", color: "#ef4444" }}
                />
              ),
              onSelect: () =>
                transformNodeType(editor, path, "highlight-block", {
                  color: "red",
                }),
            },
            {
              key: "highlight-orange",
              label: "橙色",
              icon: (
                <Circle
                  size={16}
                  style={{ fill: "#f97316", color: "#f97316" }}
                />
              ),
              onSelect: () =>
                transformNodeType(editor, path, "highlight-block", {
                  color: "orange",
                }),
            },
            {
              key: "highlight-yellow",
              label: "黄色",
              icon: (
                <Circle
                  size={16}
                  style={{ fill: "#eab308", color: "#eab308" }}
                />
              ),
              onSelect: () =>
                transformNodeType(editor, path, "highlight-block", {
                  color: "yellow",
                }),
            },
            {
              key: "highlight-green",
              label: "绿色",
              icon: (
                <Circle
                  size={16}
                  style={{ fill: "#22c55e", color: "#22c55e" }}
                />
              ),
              onSelect: () =>
                transformNodeType(editor, path, "highlight-block", {
                  color: "green",
                }),
            },
            {
              key: "highlight-blue",
              label: "蓝色",
              icon: (
                <Circle
                  size={16}
                  style={{ fill: "#3b82f6", color: "#3b82f6" }}
                />
              ),
              onSelect: () =>
                transformNodeType(editor, path, "highlight-block", {
                  color: "blue",
                }),
            },
            {
              key: "highlight-purple",
              label: "紫色",
              icon: (
                <Circle
                  size={16}
                  style={{ fill: "#a855f7", color: "#a855f7" }}
                />
              ),
              onSelect: () =>
                transformNodeType(editor, path, "highlight-block", {
                  color: "purple",
                }),
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
          key: "bulleted-list",
          label: "无序列表",
          icon: <List size={16} />,
          onSelect: () => convertChildrenToList(editor, path, "bulleted-list"),
        },
        {
          key: "numbered-list",
          label: "有序列表",
          icon: <ListOrdered size={16} />,
          onSelect: () => convertChildrenToList(editor, path, "numbered-list"),
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
