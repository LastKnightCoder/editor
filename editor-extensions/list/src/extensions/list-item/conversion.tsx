import { List, ListOrdered } from "lucide-react";
import { Editor, Element, Node, Transforms, type Descendant, type Path } from "slate";
import {
  createBlockConversionMenu,
  getCommandElementPath,
  type BlockElement,
  type EditorCommand,
} from "@tau/editor/api";
import type { BulletedListElement, NumberedListElement } from "../../types";
const sourceTypes: readonly string[] = [
  "paragraph",
  "blockquote",
  "callout",
  "detail",
  "highlight-block",
];
function convertChildrenToList(
  editor: Editor,
  path: Path,
  listType: "bulleted-list" | "numbered-list"
): void {
  Editor.withoutNormalizing(editor, () => {
    const node = Node.get(editor, path);

    if (!Element.isElement(node) || !sourceTypes.includes(node.type) || node.type === "paragraph") {
      return;
    }

    const children: Descendant[] = node.children;
    if (
      !children.every(
        (child): child is BlockElement => Element.isElement(child) && !editor.isInline(child)
      )
    )
      return;

    // 如果只有一个子节点，直接转换为列表
    if (children.length === 1) {
      // 1. 先解包容器
      Transforms.unwrapNodes(editor, { at: path });

      // 2. 包装在 list-item 中
      Transforms.wrapNodes(editor, { type: "list-item", children: [] }, { at: path });

      // 3. 包装在列表容器中
      Transforms.wrapNodes(editor, { type: listType, children: [] }, { at: path });
    } else {
      // 多个子节点：先提取子节点，然后为每个创建 list-item
      const childrenNodes = [...children];

      // 1. 删除原容器
      Transforms.removeNodes(editor, { at: path });

      // 2. 为每个子节点创建 list-item 并插入
      const listItems = childrenNodes.map(child => ({
        type: "list-item" as const,
        children: [child],
      }));

      // 3. 插入包含所有 list-item 的列表容器
      const list: BulletedListElement | NumberedListElement = {
        type: listType,
        children: listItems,
      };
      Transforms.insertNodes(editor, list, { at: path });
    }
  });
}

export function createListConversion(type: "bulleted-list" | "numbered-list") {
  const command: EditorCommand = {
    id: "tau.transform.to." + type,
    run: (editor, ctx) => {
      if (!ctx.element || !sourceTypes.includes(ctx.element.type)) return;
      const path = getCommandElementPath(editor, ctx);
      if (!path) return;
      if (ctx.element.type !== "paragraph") {
        convertChildrenToList(editor, path, type);
        return;
      }
      Editor.withoutNormalizing(editor, () => {
        Transforms.wrapNodes(editor, { type: "list-item", children: [] }, { at: path });
        Transforms.wrapNodes(editor, { type, children: [] }, { at: path });
      });
    },
  };
  return {
    commands: [command],
    menuFor: createBlockConversionMenu(sourceTypes, [
      {
        id: "tau.transform." + type,
        title: type === "bulleted-list" ? "无序列表" : "有序列表",
        icon: type === "bulleted-list" ? <List size={16} /> : <ListOrdered size={16} />,
        command: command.id,
        order: type === "bulleted-list" ? 30 : 40,
      },
    ]),
  };
}
