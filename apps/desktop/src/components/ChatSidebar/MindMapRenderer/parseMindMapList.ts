import { importFromMarkdown } from "@/utils/markdown";
import { MindMapNodeData } from "@/components/MindMap/types";
import { v4 as uuid } from "uuid";
import { Descendant } from "slate";
import { ParagraphElement } from "@tau/editor";

interface ListItemNode {
  type: "list-item";
  children: Array<ParagraphElement | { type: "bulleted-list"; children: ListItemNode[] }>;
}

interface BulletedListNode {
  type: "bulleted-list";
  children: ListItemNode[];
}

/**
 * 从 list-item 节点中提取文本内容
 * 返回的格式需要是 [{ type: "paragraph", children: [...] }]
 */
function extractTextFromListItem(listItem: ListItemNode): Descendant[] {
  // 找到第一个 paragraph 子节点
  const paragraph = listItem.children.find(child => child.type === "paragraph");
  if (paragraph && paragraph.type === "paragraph") {
    // 返回完整的 paragraph 结构
    return [paragraph] as ParagraphElement[];
  }
  // 如果没有 paragraph，返回默认空 paragraph
  return [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }];
}

/**
 * 从 list-item 节点中查找嵌套的 bulleted-list
 */
function findNestedList(listItem: ListItemNode): BulletedListNode | null {
  for (const child of listItem.children) {
    if (child.type === "bulleted-list") {
      return child as BulletedListNode;
    }
  }
  return null;
}

/**
 * 递归将 list-item 转换为 MindMapNodeData
 */
function listItemToMindMapNode(listItem: ListItemNode): MindMapNodeData {
  const text = extractTextFromListItem(listItem);
  const nestedList = findNestedList(listItem);

  const node: MindMapNodeData = {
    id: uuid(),
    text,
  };

  if (nestedList && nestedList.children.length > 0) {
    node.children = nestedList.children.map(listItemToMindMapNode);
  }

  return node;
}

/**
 * 解析 Markdown 无序列表为 MindMapNodeData
 *
 * @param markdownList - Markdown 无序列表字符串
 * @returns MindMapNodeData 或 null（如果解析失败）
 * @throws Error 如果列表结构不符合要求
 *
 * @example
 * ```
 * const data = parseMindMapList(`
 * - Root
 *   - Child1
 *   - Child2
 *     - GrandChild
 * `);
 * ```
 */
export function parseMindMapList(markdownList: string): MindMapNodeData | null {
  if (!markdownList.trim()) {
    return null;
  }

  try {
    // 使用 importFromMarkdown 解析 Markdown
    const descendants = importFromMarkdown(markdownList);

    // 查找第一个 bulleted-list 节点
    const bulletedList = descendants.find(node => node.type === "bulleted-list") as
      BulletedListNode | undefined;

    if (!bulletedList) {
      throw new Error("未找到无序列表，请确保使用 Markdown 无序列表语法（- 或 *）");
    }

    if (bulletedList.children.length === 0) {
      throw new Error("列表为空");
    }

    if (bulletedList.children.length > 1) {
      throw new Error(`思维导图只能有一个根节点，当前有 ${bulletedList.children.length} 个根节点`);
    }

    // 将根 list-item 转换为 MindMapNodeData
    const rootListItem = bulletedList.children[0];
    return listItemToMindMapNode(rootListItem);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("解析思维导图列表失败");
  }
}
