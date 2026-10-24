import { isContentEmpty } from "@tau/db-schema/content-metrics";
/**
 * Markdown 导出包（迁出）：按范围（项目 / 文章 / 卡片 / 全部）组装导出树并打包。
 * 包内布局即选择树：项目按文档树，文章与卡片按首个标签分文件夹（a/b 逐级），无标签的在该范围根下。
 * 节点 id 为本次导出内的临时编号，实体身份记在 ref，跨范围互链（卡片 → 文章）照常改写。
 */

import { findOneArticle, getArticlePage } from "@/commands/article";
import { getScopedCards } from "@/commands/card";
import { saveFileWithDialog, showInFolder } from "@/commands";
import { getProjectList } from "@/commands/project";
import { EProjectItemType } from "@/types";
import {
  buildMarkdownZipBytes,
  loadScopeTree,
  type BatchExportTreeNode,
  type BatchProgressListener,
  type MarkdownBundleOptions,
} from "@/utils/batch-export";
import { cardTitle } from "@/utils/card-title";
import { sanitizeFileName } from "@/utils/file-name";
import { remoteResourceToLocal } from "@/utils/resouce";

export type ExportScope = "project" | "article" | "card" | "all";

export const SCOPE_LABEL: Record<ExportScope, string> = {
  project: "项目",
  article: "文章",
  card: "卡片",
  all: "全部",
};

const ARTICLE_PAGE_SIZE = 500;

const createIdAllocator = () => {
  let next = 1;
  return () => next++;
};

type IdAllocator = ReturnType<typeof createIdAllocator>;

const groupNode = (
  nextId: IdAllocator,
  title: string,
  children: BatchExportTreeNode[]
): BatchExportTreeNode => ({
  id: nextId(),
  title,
  depth: 0,
  itemType: EProjectItemType.Document,
  exportable: false,
  content: [],
  children,
});

/** 按首个标签（a/b 逐级）分文件夹，无标签的条目留在根下；同级文件夹在前 */
export const groupByFirstTag = (
  nextId: IdAllocator,
  items: Array<{ node: BatchExportTreeNode; tags: string[] }>
): BatchExportTreeNode[] => {
  const root: BatchExportTreeNode[] = [];
  const folders = new Map<string, BatchExportTreeNode>();
  const folderAt = (segments: string[]): BatchExportTreeNode[] => {
    if (segments.length === 0) return root;
    const key = segments.join("/");
    let folder = folders.get(key);
    if (!folder) {
      folder = groupNode(nextId, segments[segments.length - 1], []);
      folders.set(key, folder);
      folderAt(segments.slice(0, -1)).push(folder);
    }
    return folder.children;
  };
  for (const { node, tags } of items) {
    const segments = (tags[0] ?? "")
      .split("/")
      .map(segment => segment.trim())
      .filter(Boolean);
    folderAt(segments).push(node);
  }
  const sort = (nodes: BatchExportTreeNode[]): BatchExportTreeNode[] =>
    nodes
      .map(node => (node.exportable ? node : { ...node, children: sort(node.children) }))
      .sort((a, b) => Number(a.exportable) - Number(b.exportable));
  return sort(root);
};

/** 项目文档树的节点改用临时编号，身份记进 ref */
const remapProjectTree = (
  nextId: IdAllocator,
  nodes: BatchExportTreeNode[]
): BatchExportTreeNode[] =>
  nodes.map(node => ({
    ...node,
    id: nextId(),
    ref: { kind: "project-item", id: node.id },
    children: remapProjectTree(nextId, node.children),
  }));

const loadProjects = async (nextId: IdAllocator) => {
  const projects = (await getProjectList()).filter(project => !project.archived);
  const nodes: Array<BatchExportTreeNode & { projectId: number }> = [];
  for (const project of projects) {
    const tree = await loadScopeTree({ type: "project", id: project.id, title: project.title });
    nodes.push({
      ...groupNode(nextId, project.title || "未命名项目", remapProjectTree(nextId, tree)),
      projectId: project.id,
    });
  }
  return nodes;
};

const loadArticles = async (nextId: IdAllocator) => {
  const items: Array<{ node: BatchExportTreeNode; tags: string[] }> = [];
  for (let offset = 0; ; offset += ARTICLE_PAGE_SIZE) {
    const page = await getArticlePage(offset, ARTICLE_PAGE_SIZE, undefined, undefined, "updated");
    for (const article of page.items) {
      items.push({
        tags: article.tags,
        node: {
          id: nextId(),
          title: article.title || `未命名文章 #${article.id}`,
          depth: 0,
          itemType: EProjectItemType.Document,
          exportable: true,
          empty: article.words === 0,
          content: [],
          loadContent: async () => (await findOneArticle(article.id)).content || [],
          ref: { kind: "article", id: article.id },
          meta: {
            tags: article.tags,
            createTime: article.createTime,
            updateTime: article.updateTime,
          },
          children: [],
        },
      });
    }
    if (page.items.length < ARTICLE_PAGE_SIZE || offset + ARTICLE_PAGE_SIZE >= page.total) break;
  }
  return groupByFirstTag(nextId, items);
};

const loadCards = async (nextId: IdAllocator, databaseName: string) => {
  const cards = await getScopedCards(databaseName);
  return groupByFirstTag(
    nextId,
    cards.map(card => ({
      tags: card.tags,
      node: {
        id: nextId(),
        title: cardTitle(card, 30) || `卡片 #${card.id}`,
        depth: 0,
        itemType: EProjectItemType.Document,
        exportable: true,
        empty: isContentEmpty(card.content),
        content: card.content || [],
        ref: { kind: "card", id: card.id },
        meta: { tags: card.tags, createTime: card.create_time, updateTime: card.update_time },
        children: [],
      },
    }))
  );
};

export interface ExportCatalog {
  tree: BatchExportTreeNode[];
  /** 项目分组节点 id → 项目 id（从项目页唤起时只勾选该项目） */
  projectNodes: Map<number, number>;
}

/** 组装某个范围的导出树；全部 = 项目 / 文章 / 卡片三个分组 */
export const loadExportCatalog = async (
  scope: ExportScope,
  databaseName: string
): Promise<ExportCatalog> => {
  const nextId = createIdAllocator();
  const projectNodes = new Map<number, number>();
  const projects = async () => {
    const nodes = await loadProjects(nextId);
    nodes.forEach(node => projectNodes.set(node.id, node.projectId));
    return nodes;
  };
  if (scope === "project") return { tree: await projects(), projectNodes };
  if (scope === "article") return { tree: await loadArticles(nextId), projectNodes };
  if (scope === "card") return { tree: await loadCards(nextId, databaseName), projectNodes };
  return {
    tree: [
      groupNode(nextId, "项目", await projects()),
      groupNode(nextId, "文章", await loadArticles(nextId)),
      groupNode(nextId, "卡片", await loadCards(nextId, databaseName)),
    ].filter(node => node.children.length > 0),
    projectNodes,
  };
};

export interface MarkdownExportSettings {
  linkStyle: NonNullable<MarkdownBundleOptions["linkStyle"]>;
  assets: NonNullable<MarkdownBundleOptions["assets"]>;
  includeRemote: boolean;
  frontmatter: boolean;
}

export const DEFAULT_EXPORT_SETTINGS: MarkdownExportSettings = {
  linkStyle: "relative",
  assets: "pack",
  includeRemote: false,
  frontmatter: true,
};

/** 打包并弹保存对话框；返回保存路径（取消为 null） */
export const exportMarkdownBundle = async (input: {
  tree: BatchExportTreeNode[];
  selectedIds: Set<number>;
  fileName: string;
  settings: MarkdownExportSettings;
  onProgress?: BatchProgressListener;
}) => {
  const { settings } = input;
  const result = await buildMarkdownZipBytes(input.tree, input.selectedIds, input.onProgress, {
    linkStyle: settings.linkStyle,
    assets: settings.assets,
    frontmatter: settings.frontmatter,
    fetchRemote:
      settings.assets === "pack" && settings.includeRemote
        ? url => remoteResourceToLocal(url)
        : undefined,
  });
  const saved = await saveFileWithDialog({
    defaultFileName: `${sanitizeFileName(input.fileName, "导出")}.zip`,
    filters: [{ name: "ZIP", extensions: ["zip"] }],
    data: result.bytes,
  });
  if (saved.filePath) {
    await showInFolder(saved.filePath).catch(error => console.warn("打开导出目录失败:", error));
  }
  return { ...result, filePath: saved.canceled ? null : saved.filePath };
};
