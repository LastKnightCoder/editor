import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Circle,
  Copy,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Highlighter,
  Info,
  Lightbulb,
  List,
  ListOrdered,
  MessageSquare,
  Quote,
  RefreshCw,
  Scissors,
  Trash2,
} from "lucide-react";
import { Editor, Node, Path, Transforms } from "slate";
import { ReactEditor } from "slate-react";

import { defineExtension } from "../api/extension";
import type { EditorCommand, EditorCommandContext } from "../api/command";
import type { EditorMenuEntry } from "../api/menu";
import { notifierOf } from "../services";
import {
  convertChildrenToList,
  copyNodeToClipboard,
  deleteNode,
  deleteVoidBlock,
  transformNodeType,
  unwrapContainerBlock,
  type NodeType,
} from "../utils/nodeOperations";

/**
 * 内核默认菜单扩展（01 §5.4）：所有带手柄菜单的块免费获得的公共条目。
 * `transform` 组是类型转换（源类型限定在原本就有转换菜单的五种块），
 * `block` 组是块级动作（移动/剪贴/删除）。特有条目由各扩展自己贡献，不在
 * 这里声明；扩展逐个迁 v2 前，类型知识暂时留在本文件（元素类型下沉 P9 再收）。
 */

/** 有「转换成」菜单的源类型（与迁移前各块手写菜单的目标集合一致） */
const TRANSFORM_SOURCES = [
  "paragraph",
  "blockquote",
  "callout",
  "detail",
  "highlight-block",
] as const;
/** 容器块：转段落要解包、转列表要按子节点展开，与叶子块的包装路径不同 */
const CONTAINER_TYPES = new Set<string>(["blockquote", "callout", "detail", "highlight-block"]);

const isType = (ctx: { element: { type?: unknown } }, ...types: readonly string[]) =>
  types.includes(ctx.element.type as string);

/** 命令定位目标元素：菜单入口带了 path 就直接用，程序化调用时回退到 findPath */
const findElementPath = (editor: Editor, ctx: EditorCommandContext) => {
  if (ctx.path) return ctx.path;
  if (!ctx.element) return null;
  try {
    return ReactEditor.findPath(editor as ReactEditor, ctx.element);
  } catch {
    return null;
  }
};

/** 目标元素是否还有前/后兄弟可交换（上移/下移的 enablement）；path 未知时不拦截 */
const hasSibling = (editor: Editor, path: Path | undefined, direction: -1 | 1): boolean => {
  if (!path) return true;
  try {
    if (direction < 0) return Path.hasPrevious(path);
    const parent = Node.parent(editor, path);
    return path[path.length - 1] + 1 < parent.children.length;
  } catch {
    return false;
  }
};

const moveCommand = (id: string, title: string, direction: -1 | 1): EditorCommand => ({
  id,
  title,
  run: (editor, ctx) => {
    const path = findElementPath(editor, ctx);
    if (!path || !ctx.element) return;
    if (!hasSibling(editor, path, direction)) return;
    const to = direction < 0 ? Path.previous(path) : Path.next(path);
    Transforms.moveNodes(editor, { at: path, to });
  },
});

const transformCommand: EditorCommand = {
  id: "tau.transform.node",
  title: "转换块类型",
  run: (editor, ctx) => {
    const path = findElementPath(editor, ctx);
    if (!path) return;
    const { target, options } = (ctx.payload ?? {}) as {
      target: NodeType;
      options?: Parameters<typeof transformNodeType>[3];
    };
    const isContainer = ctx.element ? CONTAINER_TYPES.has(ctx.element.type) : false;
    if (target === "paragraph") {
      // 容器解包提升子节点；叶子直接改 type
      if (isContainer) unwrapContainerBlock(editor, path);
      else transformNodeType(editor, path, "paragraph");
      return;
    }
    if (target === "bulleted-list" || target === "numbered-list") {
      if (isContainer) convertChildrenToList(editor, path, target);
      else transformNodeType(editor, path, target);
      return;
    }
    transformNodeType(editor, path, target, options);
  },
};

const commands: EditorCommand[] = [
  moveCommand("tau.block.move-up", "上移", -1),
  moveCommand("tau.block.move-down", "下移", 1),
  {
    id: "tau.block.cut",
    title: "剪切",
    run: (editor, ctx) => {
      const path = findElementPath(editor, ctx);
      if (!path || !ctx.element) return;
      void copyNodeToClipboard(editor, ctx.element, notifierOf(editor)).then(() =>
        deleteNode(editor, path)
      );
    },
  },
  {
    id: "tau.block.copy",
    title: "复制",
    run: (editor, ctx) => {
      if (!ctx.element) return;
      void copyNodeToClipboard(editor, ctx.element, notifierOf(editor));
    },
  },
  {
    id: "tau.block.delete",
    title: "删除",
    run: (editor, ctx) => {
      const path = findElementPath(editor, ctx);
      if (!path) return;
      // void 块不可聚焦，删除后补空段落承接光标；可聚焦块直接删（最后一块清空保底）
      if (ctx.element && editor.isVoid(ctx.element)) deleteVoidBlock(editor, path);
      else deleteNode(editor, path);
    },
  },
  transformCommand,
];

const blockMenu: EditorMenuEntry[] = [
  {
    id: "tau.block.move-up",
    title: "上移",
    icon: <ArrowUp size={16} />,
    command: "tau.block.move-up",
    group: "block",
    order: 10,
    disabled: ctx => !hasSibling(ctx.editor, ctx.path, -1),
  },
  {
    id: "tau.block.move-down",
    title: "下移",
    icon: <ArrowDown size={16} />,
    command: "tau.block.move-down",
    group: "block",
    order: 20,
    disabled: ctx => !hasSibling(ctx.editor, ctx.path, 1),
  },
  {
    id: "tau.block.cut",
    title: "剪切",
    icon: <Scissors size={16} />,
    command: "tau.block.cut",
    group: "block",
    order: 30,
  },
  {
    id: "tau.block.copy",
    title: "复制",
    icon: <Copy size={16} />,
    command: "tau.block.copy",
    group: "block",
    order: 40,
  },
  {
    id: "tau.block.delete",
    title: "删除",
    icon: <Trash2 size={16} />,
    command: "tau.block.delete",
    group: "block",
    order: 90,
    danger: true,
  },
];

const HIGHLIGHT_COLORS = [
  { value: "red", label: "红色", hex: "#ef4444" },
  { value: "orange", label: "橙色", hex: "#f97316" },
  { value: "yellow", label: "黄色", hex: "#eab308" },
  { value: "green", label: "绿色", hex: "#22c55e" },
  { value: "blue", label: "蓝色", hex: "#3b82f6" },
  { value: "purple", label: "紫色", hex: "#a855f7" },
] as const;

const CALLOUT_TYPES = [
  { value: "info", label: "信息", title: "信息" },
  { value: "tip", label: "提示", title: "提示" },
  { value: "warning", label: "警告", title: "警告" },
  { value: "danger", label: "危险", title: "危险" },
  { value: "note", label: "备注", title: "备注" },
] as const;

const transformMenu: EditorMenuEntry[] = [
  {
    id: "tau.transform",
    title: "转换成",
    icon: <RefreshCw size={16} />,
    group: "transform",
    when: ctx => isType(ctx, ...TRANSFORM_SOURCES),
    children: [
      {
        id: "tau.transform.paragraph",
        title: "段落",
        icon: <FileText size={16} />,
        command: "tau.transform.node",
        payload: { target: "paragraph" },
        when: ctx => isType(ctx, ...CONTAINER_TYPES),
      },
      {
        id: "tau.transform.header",
        title: "标题",
        icon: <Heading1 size={16} />,
        children: ([1, 2, 3, 4, 5, 6] as const).map(level => ({
          id: `tau.transform.header-${level}`,
          title: `标题 ${level}`,
          icon:
            level === 1 ? (
              <Heading1 size={16} />
            ) : level === 2 ? (
              <Heading2 size={16} />
            ) : level === 3 ? (
              <Heading3 size={16} />
            ) : level === 4 ? (
              <Heading4 size={16} />
            ) : level === 5 ? (
              <Heading5 size={16} />
            ) : (
              <Heading6 size={16} />
            ),
          command: "tau.transform.node",
          payload: { target: "header", options: { level } },
          when: (ctx: { element: { type?: unknown } }) => isType(ctx, "paragraph"),
        })),
        when: ctx => isType(ctx, "paragraph"),
      },
      {
        id: "tau.transform.bulleted-list",
        title: "无序列表",
        icon: <List size={16} />,
        command: "tau.transform.node",
        payload: { target: "bulleted-list" },
      },
      {
        id: "tau.transform.numbered-list",
        title: "有序列表",
        icon: <ListOrdered size={16} />,
        command: "tau.transform.node",
        payload: { target: "numbered-list" },
      },
      {
        id: "tau.transform.highlight-block",
        title: "高亮块",
        icon: <Highlighter size={16} />,
        children: HIGHLIGHT_COLORS.map(color => ({
          id: `tau.transform.highlight-${color.value}`,
          title: color.label,
          icon: <Circle size={16} style={{ fill: color.hex, color: color.hex }} />,
          command: "tau.transform.node",
          payload: { target: "highlight-block", options: { color: color.value } },
        })),
        when: ctx => !isType(ctx, "highlight-block"),
      },
      {
        id: "tau.transform.detail",
        title: "详情块",
        icon: <ChevronDown size={16} />,
        command: "tau.transform.node",
        payload: { target: "detail" },
        when: ctx => !isType(ctx, "detail"),
      },
      {
        id: "tau.transform.callout",
        title: "Callout 块",
        icon: <MessageSquare size={16} />,
        children: CALLOUT_TYPES.map(type => ({
          id: `tau.transform.callout-${type.value}`,
          title: type.label,
          icon:
            type.value === "info" ? (
              <Info size={16} />
            ) : type.value === "tip" ? (
              <Lightbulb size={16} />
            ) : type.value === "warning" ? (
              <AlertTriangle size={16} />
            ) : type.value === "danger" ? (
              <AlertCircle size={16} />
            ) : (
              <FileText size={16} />
            ),
          command: "tau.transform.node",
          payload: {
            target: "callout",
            options: { calloutType: type.value, title: type.title },
          },
        })),
        when: ctx => !isType(ctx, "callout"),
      },
      {
        id: "tau.transform.blockquote",
        title: "引用块",
        icon: <Quote size={16} />,
        command: "tau.transform.node",
        payload: { target: "blockquote" },
        when: ctx => isType(ctx, "paragraph", "callout", "highlight-block"),
      },
    ],
  },
];

/** 内核默认菜单扩展：进内置扩展列表，所有带手柄菜单的块免费获得这些条目 */
export const defaultMenuExtension = defineExtension({
  id: "tau.menu-defaults",
  commands,
  menu: [...transformMenu, ...blockMenu],
});
