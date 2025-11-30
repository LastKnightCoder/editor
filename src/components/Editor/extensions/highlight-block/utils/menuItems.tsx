import {
  FileText,
  ChevronDown,
  MessageSquare,
  List,
  ListOrdered,
  Quote,
  Copy,
  Trash2,
  RefreshCw,
  Info,
  AlertTriangle,
  Lightbulb,
  AlertCircle,
  Circle,
  Palette,
} from "lucide-react";
import { Transforms } from "slate";
import { ReactEditor } from "slate-react";

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
import { HighlightBlockElement, Color } from "../../../types";
import type { MessageInstance } from "antd/es/message/interface";

/**
 * 构建高亮块菜单项
 */
export function buildHighlightBlockMenuItems(
  params: BuildMenuParams<HighlightBlockElement>,
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
    // 修改颜色（二级菜单）
    {
      key: "change-color",
      label: "修改颜色",
      icon: <Palette size={16} />,
      children: [
        {
          key: "color-red",
          label: "红色",
          icon: <Circle size={16} style={{ fill: "#ef4444", color: "#ef4444" }} />,
          disabled: element.color === "red",
          onSelect: () => {
            const elementPath = ReactEditor.findPath(editor, element);
            Transforms.setNodes(
              editor,
              { color: "red" as Color },
              { at: elementPath },
            );
          },
        },
        {
          key: "color-orange",
          label: "橙色",
          icon: <Circle size={16} style={{ fill: "#f97316", color: "#f97316" }} />,
          disabled: element.color === "orange",
          onSelect: () => {
            const elementPath = ReactEditor.findPath(editor, element);
            Transforms.setNodes(
              editor,
              { color: "orange" as Color },
              { at: elementPath },
            );
          },
        },
        {
          key: "color-yellow",
          label: "黄色",
          icon: <Circle size={16} style={{ fill: "#eab308", color: "#eab308" }} />,
          disabled: element.color === "yellow",
          onSelect: () => {
            const elementPath = ReactEditor.findPath(editor, element);
            Transforms.setNodes(
              editor,
              { color: "yellow" as Color },
              { at: elementPath },
            );
          },
        },
        {
          key: "color-green",
          label: "绿色",
          icon: <Circle size={16} style={{ fill: "#22c55e", color: "#22c55e" }} />,
          disabled: element.color === "green",
          onSelect: () => {
            const elementPath = ReactEditor.findPath(editor, element);
            Transforms.setNodes(
              editor,
              { color: "green" as Color },
              { at: elementPath },
            );
          },
        },
        {
          key: "color-blue",
          label: "蓝色",
          icon: <Circle size={16} style={{ fill: "#3b82f6", color: "#3b82f6" }} />,
          disabled: element.color === "blue",
          onSelect: () => {
            const elementPath = ReactEditor.findPath(editor, element);
            Transforms.setNodes(
              editor,
              { color: "blue" as Color },
              { at: elementPath },
            );
          },
        },
        {
          key: "color-purple",
          label: "紫色",
          icon: <Circle size={16} style={{ fill: "#a855f7", color: "#a855f7" }} />,
          disabled: element.color === "purple",
          onSelect: () => {
            const elementPath = ReactEditor.findPath(editor, element);
            Transforms.setNodes(
              editor,
              { color: "purple" as Color },
              { at: elementPath },
            );
          },
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
