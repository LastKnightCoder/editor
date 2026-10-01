import type { Descendant } from "slate";
import { getProjectById } from "@/commands";
import {
  EProjectItemType,
  type BatchExportChapter,
  type BatchExportRule,
  type BatchExportScope,
  type EpubChapter,
  type EpubExportPayload,
  type EpubMetadataInput,
  type EpubNavItem,
  type PdfExportPayload,
} from "@/types";
import {
  buildProjectTreeData,
  loadProjectItemMap,
  type ProjectTreeNode,
} from "@/utils/projectTree";
import { htmlSerializerRegistry } from "@/utils/html-serializers";
import { processEpubAssets } from "@/utils/epub-export/assets";
import { isMeaningfulHtmlFragment } from "@/utils/epub-export/chaptering";
import { PDF_BASE_STYLES, PDF_TOC_STYLES, processCodeBlocks } from "@/utils/pdf-html-builder";
import { getMarkdown } from "@/utils/markdown";
import { TextReader, Uint8ArrayWriter, ZipWriter, configure as configureZip } from "@zip.js/zip.js";

/**
 * 整体导出选择树的节点（嵌套结构，与项目树同序）
 */
export interface BatchExportTreeNode {
  id: number;
  title: string;
  depth: number;
  itemType: EProjectItemType;
  /** 只有文档条目可导出；PDF / 白板等类型仅作为分组保留层级 */
  exportable: boolean;
  /** 文档没有正文：导出时只保留标题 */
  empty?: boolean;
  content: Descendant[];
  children: BatchExportTreeNode[];
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
    nodes.some(node => {
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

const convertProjectNode = (node: ProjectTreeNode, depth: number): BatchExportTreeNode => {
  const exportable = node.item.projectItemType === EProjectItemType.Document;
  return {
    id: node.item.id,
    title: node.item.title || `未命名条目 #${node.item.id}`,
    depth,
    itemType: node.item.projectItemType,
    exportable,
    empty: exportable && !hasMeaningfulContent(node.item.content),
    content: node.item.content || [],
    children: node.children.map(child => convertProjectNode(child, depth + 1)),
  };
};

/**
 * 加载作用范围内的条目树（顺序 = 应用内展示的 DFS 顺序）
 */
export const loadScopeTree = async (scope: BatchExportScope): Promise<BatchExportTreeNode[]> => {
  const project = await getProjectById(scope.id);
  const itemMap = await loadProjectItemMap(project.children || []);
  const treeData = buildProjectTreeData(project, itemMap);
  return treeData.nodes.map(node => convertProjectNode(node, 0));
};

/** 收集树中所有可导出条目的 id（DFS 顺序） */
export const collectExportableIds = (tree: BatchExportTreeNode[]): number[] => {
  const ids: number[] = [];
  const walk = (nodes: BatchExportTreeNode[]) => {
    nodes.forEach(node => {
      if (node.exportable) {
        ids.push(node.id);
      }
      walk(node.children);
    });
  };
  walk(tree);
  return ids;
};

const isSelectedNode = (node: BatchExportTreeNode, selectedIds: Set<number>) =>
  node.exportable && selectedIds.has(node.id);

const hasSelectedDescendant = (node: BatchExportTreeNode, selectedIds: Set<number>): boolean =>
  node.children.some(
    child => isSelectedNode(child, selectedIds) || hasSelectedDescendant(child, selectedIds)
  );

/**
 * 按勾选的 id 集合过滤并展平为章节列表（DFS 顺序）。
 * 选中且有正文的文档产出内容章节；其余存在选中后代的节点（未选中、无正文或非文档条目）
 * 作为 isGroup 分组条目插入，保留目录与标题层级；选中但无正文、也无选中后代的文档
 * 产出只有标题的空章节。
 */
export const flattenSelectedChapters = (
  tree: BatchExportTreeNode[],
  selectedIds: Set<number>
): BatchExportChapter[] => {
  const chapters: BatchExportChapter[] = [];
  const walk = (nodes: BatchExportTreeNode[]) => {
    nodes.forEach(node => {
      const selected = isSelectedNode(node, selectedIds);
      const asGroup = !(selected && !node.empty) && hasSelectedDescendant(node, selectedIds);
      if (selected && !asGroup) {
        chapters.push({
          id: node.id,
          title: node.title,
          depth: node.depth,
          content: node.empty ? [] : node.content,
        });
      } else if (asGroup) {
        chapters.push({
          id: node.id,
          title: node.title,
          depth: node.depth,
          content: [],
          isGroup: true,
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
  anchorId?: string
) => {
  const level = Math.min(rule.headingLevel + depth, 6);
  const idAttr = anchorId ? ` id="${anchorId}"` : "";
  return `<h${level}${idAttr}>${escapeHtml(title)}</h${level}>`;
};

const getChapterAnchorId = (index: number) => `batch-chapter-${index}`;

/**
 * 批量构建的进度回调：processed/total 为本次构建内的处理单元数，
 * label 为正在处理的条目标题
 */
export type BatchProgressListener = (processed: number, total: number, label?: string) => void;

/**
 * 构建正文开头的目录页：条目链接到章节标题锚点，
 * Chromium 打印为 PDF 时会保留为内部跳转链接
 */
const buildPdfTocSection = (chapters: BatchExportChapter[]): string => {
  const items = chapters
    .map((chapter, index) => {
      const indent = (chapter.depth + 1) * 1.2;
      const strongClass = chapter.isGroup || chapter.depth === 0 ? " pdf-toc-item-top" : "";
      return `<a class="pdf-toc-item${strongClass}" href="#${getChapterAnchorId(index)}" style="padding-left:${indent}em"><span class="pdf-toc-text">${escapeHtml(chapter.title)}</span><span class="pdf-toc-leader"></span></a>`;
    })
    .join("\n");
  return `<section class="pdf-toc"><h1 class="pdf-toc-title">目录</h1><span class="pdf-toc-hint">点击条目可跳转至对应章节</span>${items}</section>`;
};

/**
 * 构建批量 PDF 导出 payload：所有章节拼接为一个 HTML，
 * 按规则注入标题 / 分页，可选插入目录页与书签大纲
 */
export const buildBatchPdfPayload = async (input: {
  chapters: BatchExportChapter[];
  title: string;
  author?: string;
  rule: BatchExportRule;
  pdf?: {
    outline: boolean;
    tocPage: boolean;
  };
  onProgress?: BatchProgressListener;
}): Promise<PdfExportPayload> => {
  const tailwindCssCollector: string[] = [];
  const sections: string[] = [];
  // 分组（无正文文件夹）标题延迟拼接：跟第一个内容章节同页，
  // 避免孤悬在分页前的上一页末尾
  let pendingGroupHeadings: string[] = [];

  for (const [index, chapter] of input.chapters.entries()) {
    if (chapter.isGroup) {
      if (input.rule.asHeading) {
        pendingGroupHeadings.push(
          getChapterHeadingHtml(chapter.title, chapter.depth, input.rule, getChapterAnchorId(index))
        );
      }
      input.onProgress?.(index + 1, input.chapters.length);
      continue;
    }
    const serialized = await htmlSerializerRegistry.serializeAsync(chapter.content || [], {
      theme: "light",
      tailwindCssCollector,
    });
    input.onProgress?.(index + 1, input.chapters.length, chapter.title);
    const heading = input.rule.asHeading
      ? getChapterHeadingHtml(chapter.title, chapter.depth, input.rule, getChapterAnchorId(index))
      : "";
    // 空白文档在不注入标题时没有任何内容，跳过以免产生空白页
    if (!heading && !serialized.trim()) {
      continue;
    }
    const body = pendingGroupHeadings.join("") + heading + serialized;
    pendingGroupHeadings = [];
    // 分页以"是否第一个内容章节"判断：首个章节可能排在分组条目（index > 0）
    // 之后，若按 index 判断会与目录页的分页叠加产生空白页
    sections.push(
      input.rule.pageBreak && sections.length > 0
        ? `<section style="page-break-before: always;">${body}</section>`
        : body
    );
  }

  // 目录页依赖章节标题锚点，仅在标题注入正文时可用
  const tocSection =
    input.pdf?.tocPage && input.rule.asHeading ? buildPdfTocSection(input.chapters) : "";
  const bodyHtml = processCodeBlocks(tocSection + sections.join("\n"), "adaptive");
  const tailwindStyles = Array.from(new Set(tailwindCssCollector)).join("\n");

  return {
    html: bodyHtml,
    styles: [PDF_BASE_STYLES, tocSection ? PDF_TOC_STYLES : "", tailwindStyles]
      .filter(Boolean)
      .join("\n\n"),
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
      generateOutline: input.pdf?.outline ?? false,
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
  onProgress?: BatchProgressListener;
}): Promise<{ payload: EpubExportPayload; warnings: string[] }> => {
  const chapters: EpubChapter[] = [];
  const navItems: EpubNavItem[] = [];
  let pendingGroups: BatchExportChapter[] = [];

  for (const [index, chapter] of input.chapters.entries()) {
    if (chapter.isGroup) {
      pendingGroups.push(chapter);
      input.onProgress?.(index + 1, input.chapters.length);
      continue;
    }

    const chapterIndex = chapters.length;
    const serialized = await htmlSerializerRegistry.serializeAsync(chapter.content || [], {
      codeTheme: "github-light",
    });
    input.onProgress?.(index + 1, input.chapters.length, chapter.title);
    const groupHeadings = pendingGroups
      .map((group, groupIndex) =>
        getChapterHeadingHtml(
          group.title,
          group.depth,
          input.rule,
          `epub-group-${chapterIndex}-${groupIndex}`
        )
      )
      .join("");
    const heading = input.rule.asHeading
      ? getChapterHeadingHtml(chapter.title, chapter.depth, input.rule)
      : "";
    const title = chapter.title || `第${chapterIndex + 1}章`;
    chapters.push({
      id: `chapter-${chapterIndex + 1}`,
      title,
      xhtml: (input.rule.asHeading ? groupHeadings : "") + heading + serialized,
    });

    // 分组条目挂到其后第一个内容章节；标题未注入正文时无锚点，跳到章节开头
    pendingGroups.forEach((group, groupIndex) => {
      navItems.push({
        title: group.title,
        chapterIndex,
        anchor: input.rule.asHeading ? `epub-group-${chapterIndex}-${groupIndex}` : undefined,
        level: group.depth,
      });
    });
    navItems.push({
      title,
      chapterIndex,
      level: chapter.depth,
    });
    pendingGroups = [];
  }

  const assetResult = await processEpubAssets({
    chapters,
    coverImageSrc: input.metadata.coverImageSrc,
  });

  // 空章节被过滤后重映射 nav 的章节下标
  const meaningfulIndexes = assetResult.chapters
    .map((chapter, index) => (isMeaningfulHtmlFragment(chapter.xhtml) ? index : -1))
    .filter(index => index >= 0);
  const meaningfulChapters = meaningfulIndexes.map(index => assetResult.chapters[index]);
  const chapterIndexRemap = new Map(
    meaningfulIndexes.map((oldIndex, newIndex) => [oldIndex, newIndex])
  );
  const meaningfulNavItems = navItems.flatMap(item => {
    const mappedIndex = chapterIndexRemap.get(item.chapterIndex);
    return mappedIndex === undefined ? [] : [{ ...item, chapterIndex: mappedIndex }];
  });

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
    nav: meaningfulChapters.length > 0 ? meaningfulNavItems : undefined,
    assets: assetResult.assets,
    defaultFileName: sanitizeFileName(input.metadata.title),
  };

  return { payload, warnings: assetResult.warnings };
};

const getChapterHeadingMarkdown = (title: string, depth: number, rule: BatchExportRule) => {
  const level = Math.min(rule.headingLevel + depth, 6);
  return `${"#".repeat(level)} ${title}\n\n`;
};

/**
 * 合并所有选中章节为一个大 Markdown：
 * 标题规则注入 `#` 标题；分页规则用 `---` 分隔章节
 */
export const buildMergedMarkdown = (
  chapters: BatchExportChapter[],
  rule: BatchExportRule
): string => {
  // 分组条目仅用于 PDF 目录层级，Markdown 合并跳过空分组
  const parts = chapters
    .filter(chapter => !chapter.isGroup)
    .map(chapter => {
      const heading = rule.asHeading
        ? getChapterHeadingMarkdown(chapter.title, chapter.depth, rule)
        : "";
      return (heading + getMarkdown(chapter.content || []).trim()).trim();
    })
    .filter(Boolean);
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
 * 每个选中的文档一个 .md 文件，子级放在同名文件夹下；
 * 未选中、无正文或非文档条目在存在选中后代时只作为文件夹保留层级，
 * 选中但无正文且无选中后代的文档导出为空文件。
 * ZIP 按目录分文件，导出规则（分页/标题）不适用，文件名即标题
 */
export const buildMarkdownZipBytes = async (
  tree: BatchExportTreeNode[],
  selectedIds: Set<number>,
  onProgress?: BatchProgressListener
): Promise<Uint8Array> => {
  configureZip({ useWebWorkers: false });
  const zipWriter = new ZipWriter(new Uint8ArrayWriter());
  const includedNodeIds = new Set<number>();
  const fileNodeIds = new Set<number>();

  const markIncludedNodes = (nodes: BatchExportTreeNode[]): boolean => {
    let hasIncludedNode = false;
    nodes.forEach(node => {
      const hasIncludedChild = markIncludedNodes(node.children);
      const selected = isSelectedNode(node, selectedIds);
      if (selected || hasIncludedChild) {
        includedNodeIds.add(node.id);
        hasIncludedNode = true;
      }
      if (selected && !(node.empty && hasIncludedChild)) {
        fileNodeIds.add(node.id);
      }
    });
    return hasIncludedNode;
  };
  markIncludedNodes(tree);

  const totalFiles = fileNodeIds.size;
  let processedFiles = 0;

  const walk = async (nodes: BatchExportTreeNode[], dirSegments: string[]): Promise<void> => {
    const uniqueDirName = createUniqueNamer();
    const uniqueFileName = createUniqueNamer();

    for (const node of nodes) {
      if (!includedNodeIds.has(node.id)) {
        continue;
      }
      const dirName = uniqueDirName(sanitizeFileName(node.title));
      if (fileNodeIds.has(node.id)) {
        const fileName = uniqueFileName(sanitizeFileName(node.title));
        const markdown = node.empty ? "" : getMarkdown(node.content || []).trim() + "\n";
        await zipWriter.add([...dirSegments, `${fileName}.md`].join("/"), new TextReader(markdown));
        processedFiles += 1;
        onProgress?.(processedFiles, totalFiles, node.title);
      }
      await walk(node.children, [...dirSegments, dirName]);
    }
  };

  await walk(tree, []);
  return await zipWriter.close();
};
