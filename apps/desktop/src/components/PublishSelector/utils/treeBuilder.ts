import { Descendant } from "slate";
import {
  CardListItem,
  CardTagNode,
  CardTagNodeBuilder,
  DocTreeNode,
  ICard,
  Project,
  ProjectItem,
  EProjectItemType,
} from "../types";
import { getProjectItemsByIds } from "@/commands/project";

/**
 * 从 Slate 节点中提取纯文本
 */
export function buildPlainText(nodes: Descendant[] | undefined): string {
  if (!nodes) return "";
  const parts: string[] = [];
  const traverse = (value: unknown) => {
    if (!value) return;
    if (typeof value === "string") {
      parts.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(traverse);
      return;
    }
    if (typeof value === "object" && value !== null) {
      const obj = value as Record<string, unknown>;
      if (typeof obj.text === "string") parts.push(obj.text);
      if (typeof obj.code === "string") parts.push(obj.code);
      if (Array.isArray(obj.children)) obj.children.forEach(traverse);
    }
  };
  traverse(nodes);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * 构建卡片标签树
 */
export function buildCardTagTree(cards: ICard[]): CardTagNode[] {
  const root = new Map<string, CardTagNodeBuilder>();
  const untagged: CardListItem[] = [];

  cards.forEach(card => {
    const item: CardListItem = {
      id: card.id,
      title: card.tags[0] || `卡片 #${card.id}`,
      summary: buildPlainText(card.content) || "暂无内容",
      tags: card.tags || [],
      updateTime: card.update_time,
      raw: card,
    };

    if (!card.tags || card.tags.length === 0) {
      untagged.push(item);
      return;
    }

    card.tags.forEach(tagPath => {
      const segments = tagPath
        .split("/")
        .map(segment => segment.trim())
        .filter(Boolean);
      if (segments.length === 0) {
        untagged.push(item);
        return;
      }
      insertTagNode(root, segments, item);
    });
  });

  const tree = Array.from(root.values()).map(node => normalizeTagNode(node, []));

  if (untagged.length > 0) {
    tree.unshift({
      id: "__untagged__",
      label: "未分类",
      depth: 0,
      count: untagged.length,
      cards: untagged,
      children: [],
    });
  }

  return tree;
}

/**
 * 插入标签节点
 */
function insertTagNode(
  container: Map<string, CardTagNodeBuilder>,
  segments: string[],
  card: CardListItem
) {
  const [current, ...rest] = segments;
  let node = container.get(current);
  if (!node) {
    node = { label: current, count: 0, cards: [], children: new Map() };
    container.set(current, node);
  }
  node.count += 1;
  if (rest.length === 0) {
    node.cards.push(card);
  } else {
    insertTagNode(node.children, rest, card);
  }
}

/**
 * 标准化标签节点
 */
function normalizeTagNode(node: CardTagNodeBuilder, ancestors: string[]): CardTagNode {
  const id = [...ancestors, node.label].join(" /");
  return {
    id,
    label: node.label,
    depth: ancestors.length,
    count: node.count,
    cards: node.cards,
    children: Array.from(node.children.values()).map(child =>
      normalizeTagNode(child, [...ancestors, node.label])
    ),
  };
}

/**
 * 收集标签节点下的所有卡片
 */
export function collectCardsFromTagNode(node: CardTagNode): CardListItem[] {
  const cards = [...node.cards];
  node.children.forEach(child => cards.push(...collectCardsFromTagNode(child)));
  return cards;
}

/**
 * 构建项目文档树
 */
export async function buildProjectTree(project: Project): Promise<DocTreeNode[]> {
  const rootIds = Array.isArray(project.children) ? project.children : [];
  if (rootIds.length === 0) return [];
  const map = await loadProjectItemsMap(rootIds);
  return rootIds
    .map(id => createProjectTreeNode(map, id))
    .filter((node): node is DocTreeNode => Boolean(node));
}

/**
 * 加载项目条目映射
 */
async function loadProjectItemsMap(rootIds: number[]): Promise<Map<number, ProjectItem>> {
  const queue = [...new Set(rootIds)];
  const map = new Map<number, ProjectItem>();
  const visited = new Set<number>();
  while (queue.length > 0) {
    const batch = queue.splice(0, 20);
    const items = await getProjectItemsByIds(batch);
    items.forEach(item => {
      if (visited.has(item.id)) return;
      visited.add(item.id);
      map.set(item.id, item);
      if (item.children && item.children.length > 0) {
        queue.push(...item.children);
      }
    });
  }
  return map;
}

/**
 * 创建项目树节点
 */
function createProjectTreeNode(map: Map<number, ProjectItem>, itemId: number): DocTreeNode | null {
  const item = map.get(itemId);
  if (!item) return null;
  const children = (item.children || [])
    .map(childId => createProjectTreeNode(map, childId))
    .filter((node): node is DocTreeNode => Boolean(node));
  const hasContent =
    item.projectItemType === EProjectItemType.Document && hasMeaningfulContent(item.content || []);
  return {
    id: item.id,
    title: item.title || `条目 #${item.id}`,
    hasContent,
    content: item.content || [],
    children,
  };
}

/**
 * 判断内容是否有意义
 */
function hasMeaningfulContent(content: Descendant[]): boolean {
  if (!Array.isArray(content) || content.length === 0) {
    return false;
  }
  const text = buildPlainText(content);
  return text.trim().length > 0;
}

/**
 * 收集文档树节点 ID（只收集有内容的节点）
 */
export function collectDocNodeIds(nodes: DocTreeNode[]): number[] {
  const result: number[] = [];
  const traverse = (node: DocTreeNode) => {
    if (node.hasContent) {
      result.push(node.id);
    }
    node.children.forEach(traverse);
  };
  nodes.forEach(traverse);
  return result;
}

/**
 * 查找文档树节点
 */
export function findDocTreeNode(nodes: DocTreeNode[], id: number): DocTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findDocTreeNode(node.children, id);
    if (child) return child;
  }
  return undefined;
}
