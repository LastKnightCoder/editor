import { ArrowDown, ArrowUp, Copy, Scissors, Trash2 } from "lucide-react";
import { Editor, Node, Path, Transforms } from "slate";

import { defineExtension } from "../api/extension";
import type { EditorCommand } from "../api/command";
import type { EditorMenuEntry } from "../api/menu";
import { notifierOf } from "../services";
import { copyNodeToClipboard, deleteNode, deleteVoidBlock } from "../utils/nodeOperations";
import { getCommandElementPath } from "../utils/commandTarget";

/** 通用块操作；领域转换由对应扩展的命令与 menuFor 贡献。 */

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
    const path = getCommandElementPath(editor, ctx);
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
    const target = (ctx.payload as { target?: unknown } | undefined)?.target;
    if (typeof target !== "string" || !target || !ctx.element) return;
    const path = getCommandElementPath(editor, ctx);
    if (!path) return;
    const command =
      target === "paragraph"
        ? "tau.transform." + ctx.element.type + ".to-paragraph"
        : "tau.transform.to." + target;
    editor.commands?.execute(command, ctx.payload, ctx.element, path);
  },
};

const commands: EditorCommand[] = [
  moveCommand("tau.block.move-up", "上移", -1),
  moveCommand("tau.block.move-down", "下移", 1),
  {
    id: "tau.block.cut",
    title: "剪切",
    run: async (editor, ctx) => {
      const path = getCommandElementPath(editor, ctx);
      if (!path || !ctx.element) return;
      const target = Editor.pathRef(editor, path);
      try {
        const copied = await copyNodeToClipboard(editor, ctx.element, notifierOf(editor), {
          allowPlainTextFallback: false,
        });
        const currentPath = target.current;
        // 等待期间被修改或替换的内容没有进入剪贴板，不能删除。
        if (
          copied &&
          currentPath &&
          getCommandElementPath(editor, { element: ctx.element, path: currentPath })
        ) {
          if (editor.isVoid(ctx.element)) deleteVoidBlock(editor, currentPath);
          else deleteNode(editor, currentPath);
        }
      } finally {
        target.unref();
      }
    },
  },
  {
    id: "tau.block.copy",
    title: "复制",
    run: async (editor, ctx) => {
      if (!ctx.element) return;
      await copyNodeToClipboard(editor, ctx.element, notifierOf(editor));
    },
  },
  {
    id: "tau.block.delete",
    title: "删除",
    run: (editor, ctx) => {
      const path = getCommandElementPath(editor, ctx);
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

/** 产品显式安装通用块菜单；旧转换命令只转发到已安装领域。 */
export const defaultMenuExtension = defineExtension({
  id: "tau.menu-defaults",
  commands,
  menu: blockMenu,
});
