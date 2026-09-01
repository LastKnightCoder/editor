import type { Descendant } from "slate";
import { getDocument, getProjectById } from "@/commands";
import {
  EProjectItemType,
  type BatchExportChapter,
  type BatchExportRule,
  type BatchExportScope,
  type EpubChapter,
  type EpubExportPayload,
  type EpubMetadataInput,
  type PdfExportPayload,
} from "@/types";
import {
  buildDocumentTreeData,
  loadDocumentItemMap,
  type DocumentTreeNode,
} from "@/pages/DocumentView/DocumentList/documentTree";
import {
  buildProjectTreeData,
  loadProjectItemMap,
  type ProjectTreeNode,
} from "@/pages/ProjectView/ProjectList/projectTree";
import { htmlSerializerRegistry } from "@/utils/html-serializers";
import { processEpubAssets } from "@/utils/epub-export/assets";
import { isMeaningfulHtmlFragment } from "@/utils/epub-export/chaptering";
import { PDF_BASE_STYLES, processCodeBlocks } from "@/utils/pdf-html-builder";
import { getMarkdown } from "@/utils/markdown-helper";
import {
  TextReader,
  Uint8ArrayWriter,
  ZipWriter,
  configure as configureZip,
} from "@zip.js/zip.js";

/**
 * 整体导出选择树的节点（嵌套结构，直接映射 antd Tree）
 */
export interface BatchExportTreeNode {
  id: number;
  title: string;
  depth: number;
  exportable: boolean;
  disabledReason?: string;
  content: Descendant[];
  children: BatchExportTreeNode[];
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const sanitizeFileName = (value: string) => {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return "未命名文档";
  }
  const sanitized = trimmed
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized || "未命名文档";
};

/**
 * Slate 层面的"是否有正文"判断：任一文本非空，或存在非段落块（图片/表格等）
 */
const hasMeaningfulContent = (content: Descendant[]): boolean => {
  if (!Array.isArray(content) || content.length === 0) {
    return false;
  }
  const walk = (nodes: unknown[]): boolean =>
    nodes.some((node) => {
      if (!node || typeof node !== "object") {
        return false;
      }
      const record = node as {
        text?: unknown;
        type?: unknown;
        children?: unknown;
      };
      if (typeof record.text === "string") {
        return record.text.trim().length > 0;
      }
      if (typeof record.type === "string" && record.type !== "paragraph") {
        return true;
      }
      return Array.isArray(record.children) && walk(record.children);
    });
  return walk(content);
};

const convertProjectNode = (
  node: ProjectTreeNode,
  depth: number,
): BatchExportTreeNode => {
  const isDocumentItem =
    node.item.projectItemType === EProjectItemType.Document;
  const hasContent = hasMeaningfulContent(node.item.content);
  const exportable = isDocumentItem && hasContent;
  return {
    id: node.item.id,
    title: node.item.title || `未命名条目 #${node.item.id}`,
    depth,
    exportable,
    disabledReason: exportable
      ? undefined
      : isDocumentItem
        ? "无正文，不参与导出"
        : "引用类型条目，不参与导出",
    content: node.item.content || [],
    children: node.children.map((child) =>
      convertProjectNode(child, depth + 1),
    ),
  };
};

const convertDocumentNode = (
  node: DocumentTreeNode,
  depth: number,
): BatchExportTreeNode => {
  const hasContent = hasMeaningfulContent(node.item.content);
  return {
    id: node.item.id,
    title: node.item.title || `未命名条目 #${node.item.id}`,
    depth,
    exportable: hasContent,
    disabledReason: hasContent ? undefined : "无正文，不参与导出",
    content: node.item.content || [],
    children: node.children.map((child) =>
      convertDocumentNode(child, depth + 1),
    ),
  };
};

/**
 * 加载作用范围内的条目树（顺序 = 应用内展示的 DFS 顺序）
 */
export const loadScopeTree = async (
  scope: BatchExportScope,
): Promise<BatchExportTreeNode[]> => {
  if (scope.type === "project") {
    const project = await getProjectById(scope.id);
    const itemMap = await loadProjectItemMap(project.children || []);
    const treeData = buildProjectTreeData(project, itemMap);
    return treeData.nodes.map((node) => convertProjectNode(node, 0));
  }

  const document = await getDocument(scope.id);
  const itemMap = await loadDocumentItemMap(document.children || []);
  const treeData = buildDocumentTreeData(document, itemMap);
  return treeData.nodes.map((node) => convertDocumentNode(node, 0));
};

/** 收集树中所有可导出条目的 id（DFS 顺序） */
export const collectExportableIds = (tree: BatchExportTreeNode[]): number[] => {
  const ids: number[] = [];
  const walk = (nodes: BatchExportTreeNode[]) => {
    nodes.forEach((node) => {
      if (node.exportable) {
        ids.push(node.id);
      }
      walk(node.children);
    });
  };
  walk(tree);
  return ids;
};

/**
 * 按勾选的 id 集合过滤并展平为章节列表（DFS 顺序）。
 * antd Tree 勾选是级联的：取消父节点会把整棵子树移出勾选集合，
 * 因此这里只需判断节点自身是否被勾选，无需检查祖先。
 */
export const flattenSelectedChapters = (
  tree: BatchExportTreeNode[],
  selectedIds: Set<number>,
): BatchExportChapter[] => {
  const chapters: BatchExportChapter[] = [];
  const walk = (nodes: BatchExportTreeNode[]) => {
    nodes.forEach((node) => {
      if (node.exportable && selectedIds.has(node.id)) {
        chapters.push({
          id: node.id,
          title: node.title,
          depth: node.depth,
          content: node.content,
        });
      }
      walk(node.children);
    });
  };
  walk(tree);
  return chapters;
};

const getChapterHeadingHtml = (
  title: string,
  depth: number,
  rule: BatchExportRule,
) => {
  const level = Math.min(rule.headingLevel + depth, 6);
  return `<h${level}>${escapeHtml(title)}</h${level}>`;
};

/**
 * 构建批量 PDF 导出 payload：所有章节拼接为一个 HTML，
 * 按规则注入标题 / 分页
 */
export const buildBatchPdfPayload = async (input: {
  chapters: BatchExportChapter[];
  title: string;
  author?: string;
  rule: BatchExportRule;
}): Promise<PdfExportPayload> => {
  const tailwindCssCollector: string[] = [];
  const sections: string[] = [];

  for (const [index, chapter] of input.chapters.entries()) {
    const serialized = await htmlSerializerRegistry.serializeAsync(
      chapter.content || [],
      {
        theme: "light",
        tailwindCssCollector,
      },
    );
    const heading = input.rule.asHeading
      ? getChapterHeadingHtml(chapter.title, chapter.depth, input.rule)
      : "";
    const body = heading + serialized;
    sections.push(
      input.rule.pageBreak && index > 0
        ? `<section style="page-break-before: always;">${body}</section>`
        : body,
    );
  }

  const bodyHtml = processCodeBlocks(sections.join("\n"), "adaptive");
  const tailwindStyles = Array.from(new Set(tailwindCssCollector)).join("\n");

  return {
    html: bodyHtml,
    styles: [PDF_BASE_STYLES, tailwindStyles].join("\n\n"),
    metadata: {
      title: input.title,
      author: input.author,
    },
    options: {
      pageSize: "A4",
      landscape: false,
      margins: {
        top: 20,
        bottom: 20,
        left: 20,
        right: 20,
      },
      printBackground: true,
      displayHeaderFooter: false,
      chapterBreak: input.rule.pageBreak,
      codeBlockBreak: {
        strategy: "adaptive",
      },
    },
    defaultFileName: sanitizeFileName(input.title),
  };
};

/**
 * 构建批量 EPUB 导出 payload：每个条目一章（天然分页），
 * 按规则在章节开头注入标题
 */
export const buildBatchEpubPayload = async (input: {
  chapters: BatchExportChapter[];
  metadata: EpubMetadataInput;
  rule: BatchExportRule;
}): Promise<{ payload: EpubExportPayload; warnings: string[] }> => {
  const chapters: EpubChapter[] = [];

  for (const [index, chapter] of input.chapters.entries()) {
    const serialized = await htmlSerializerRegistry.serializeAsync(
      chapter.content || [],
      {
        codeTheme: "github-light",
      },
    );
    const heading = input.rule.asHeading
      ? getChapterHeadingHtml(chapter.title, chapter.depth, input.rule)
      : "";
    chapters.push({
      id: `chapter-${index + 1}`,
      title: chapter.title || `第${index + 1}章`,
      xhtml: heading + serialized,
    });
  }

  const assetResult = await processEpubAssets({
    chapters,
    coverImageSrc: input.metadata.coverImageSrc,
  });

  const meaningfulChapters = assetResult.chapters.filter((chapter) =>
    isMeaningfulHtmlFragment(chapter.xhtml),
  );

  const payload: EpubExportPayload = {
    metadata: {
      ...input.metadata,
      coverImageSrc: assetResult.coverImageSrc,
    },
    chapters:
      meaningfulChapters.length > 0
        ? meaningfulChapters
        : [
            {
              id: "chapter-1",
              title: input.metadata.title || "未命名文档",
              xhtml: "<p></p>",
            },
          ],
    assets: assetResult.assets,
    defaultFileName: sanitizeFileName(input.metadata.title),
  };

  return { payload, warnings: assetResult.warnings };
};

const getChapterHeadingMarkdown = (
  title: string,
  depth: number,
  rule: BatchExportRule,
) => {
  const level = Math.min(rule.headingLevel + depth, 6);
  return `${"#".repeat(level)} ${title}\n\n`;
};

/**
 * 合并所有选中章节为一个大 Markdown：
 * 标题规则注入 `#` 标题；分页规则用 `---` 分隔章节
 */
export const buildMergedMarkdown = (
  chapters: BatchExportChapter[],
  rule: BatchExportRule,
): string => {
  const parts = chapters.map((chapter) => {
    const heading = rule.asHeading
      ? getChapterHeadingMarkdown(chapter.title, chapter.depth, rule)
      : "";
    return heading + getMarkdown(chapter.content || []).trim();
  });
  const separator = rule.pageBreak ? "\n\n---\n\n" : "\n\n";
  return parts.join(separator) + "\n";
};

/** 同级去重：首次保留原名，重名依次追加 -2、-3 */
const createUniqueNamer = () => {
  const counts = new Map<string, number>();
  return (name: string) => {
    const count = counts.get(name) || 0;
    counts.set(name, count + 1);
    return count === 0 ? name : `${name}-${count + 1}`;
  };
};

/**
 * 构建保持目录层级的 Markdown ZIP：
 * 每个可导出条目一个 .md 文件，子级放在同名文件夹下；
 * 无正文条目在存在选中后代时只作为文件夹保留层级。
 * ZIP 按目录分文件，导出规则（分页/标题）不适用，文件名即标题
 */
export const buildMarkdownZipBytes = async (
  tree: BatchExportTreeNode[],
  selectedIds: Set<number>,
): Promise<Uint8Array> => {
  configureZip({ useWebWorkers: false });
  const zipWriter = new ZipWriter(new Uint8ArrayWriter());
  const includedNodeIds = new Set<number>();

  const markIncludedNodes = (nodes: BatchExportTreeNode[]): boolean => {
    let hasIncludedNode = false;
    nodes.forEach((node) => {
      const hasIncludedChild = markIncludedNodes(node.children);
      const included = node.exportable
        ? selectedIds.has(node.id)
        : hasIncludedChild;
      if (included) {
        includedNodeIds.add(node.id);
        hasIncludedNode = true;
      }
    });
    return hasIncludedNode;
  };
  markIncludedNodes(tree);

  const walk = async (
    nodes: BatchExportTreeNode[],
    dirSegments: string[],
  ): Promise<void> => {
    const uniqueDirName = createUniqueNamer();
    const uniqueFileName = createUniqueNamer();

    for (const node of nodes) {
      if (!includedNodeIds.has(node.id)) {
        continue;
      }
      const dirName = uniqueDirName(sanitizeFileName(node.title));
      if (node.exportable) {
        const fileName = uniqueFileName(sanitizeFileName(node.title));
        const markdown = getMarkdown(node.content || []).trim() + "\n";
        await zipWriter.add(
          [...dirSegments, `${fileName}.md`].join("/"),
          new TextReader(markdown),
        );
      }
      await walk(node.children, [...dirSegments, dirName]);
    }
  };

  await walk(tree, []);
  return await zipWriter.close();
};
