import { getContentById } from "@/commands/content";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { isContentEmpty } from "@tau/db-schema/content-metrics";
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
import { sanitizeFileName } from "@/utils/file-name";
import { htmlSerializerRegistry } from "@/utils/html-serializers";
import { processEpubAssets } from "@/utils/epub-export/assets";
import { isMeaningfulHtmlFragment } from "@/utils/epub-export/chaptering";
import { PDF_BASE_STYLES, PDF_TOC_STYLES, processCodeBlocks } from "@/utils/pdf-html-builder";
import { getMarkdown } from "@/utils/markdown";
import { inlineLocalImages } from "@/utils/content-transfer/assets";
import { stringify as stringifyYaml } from "yaml";
import type { EntityRef } from "@/entity/ref";
import {
  ASSET_DIR,
  collectBundleAssets,
  localizeContent,
  toPortableMarkdown,
  zipBundle,
  type BundleFile,
  type LinkStyle,
} from "@/utils/content-transfer/bundle";

/**
 * 整体导出选择树的节点（嵌套结构，与项目树同序）
 */
export interface BatchExportTreeNode {
  contentId?: number;
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
  /** 应用内链接的身份；缺省为项目文档 id */
  ref?: EntityRef;
  /** 正文按需加载（文章列表只带摘要），导出时才取 */
  loadContent?: () => Promise<Descendant[]>;
  /** frontmatter 用的元信息 */
  meta?: { tags?: string[]; createTime?: number; updateTime?: number };
}

/** Markdown 包的导出选项（缺省即项目整体导出的行为：打包本机资源、相对 .md 互链、无 frontmatter） */
export interface MarkdownBundleOptions {
  linkStyle?: LinkStyle;
  /** pack：本机资源进 assets/；keep：正文保留原地址 */
  assets?: "pack" | "keep";
  /** 传入即同时打包远程资源（下载到本机缓存，返回本机路径） */
  fetchRemote?: (url: string) => Promise<string>;
  /** 写入 frontmatter（标题、标签、创建 / 更新时间） */
  frontmatter?: boolean;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const UNTITLED_FILE_NAME = "未命名文档";

const convertProjectNode = (node: ProjectTreeNode, depth: number): BatchExportTreeNode => {
  const exportable = node.item.projectItemType === EProjectItemType.Document;
  return {
    id: node.item.id,
    title: node.item.title || `未命名条目 #${node.item.id}`,
    depth,
    itemType: node.item.projectItemType,
    exportable,
    empty: exportable && isContentEmpty(node.item.content),
    content: node.item.content || [],
    contentId: node.item.contentId,
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
          contentId: node.contentId,
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
    // PDF 页面从 data: 地址加载，本机图片须先内联
    const { content: printable, warnings } = await inlineLocalImages(chapter.content || []);
    if (warnings.length > 0) console.warn("PDF 图片内联警告:", warnings);
    const serialized = await htmlSerializerRegistry.serializeAsync(printable, {
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
    defaultFileName: sanitizeFileName(input.title, UNTITLED_FILE_NAME),
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
    defaultFileName: sanitizeFileName(input.metadata.title, UNTITLED_FILE_NAME),
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
      return (heading + (chapter.markdown ?? getMarkdown(chapter.content || [])).trim()).trim();
    })
    .filter(Boolean);
  const separator = rule.pageBreak ? "\n\n---\n\n" : "\n\n";
  return parts.join(separator) + "\n";
};

/** 同级去重：首次保留原名，重名依次追加 -2、-3 */
const createUniqueNamer = (reserved: string[] = []) => {
  const counts = new Map<string, number>(reserved.map(name => [name, 1]));
  return (name: string) => {
    const count = counts.get(name) || 0;
    counts.set(name, count + 1);
    return count === 0 ? name : `${name}-${count + 1}`;
  };
};

/**
 * 合并导出前的资源处理：各章节引用的本机资源收进 assets/，正文改为相对路径；
 * 章节之间的应用内链接降为标题文本（合并后没有独立文件可链）。
 */
export const localizeChaptersForMerge = async (
  chapters: BatchExportChapter[]
): Promise<{ chapters: BatchExportChapter[]; assetFiles: BundleFile[]; warnings: string[] }> => {
  const snapshots: BatchExportChapter[] = [];
  for (const chapter of chapters) {
    const document = chapter.contentId ? await getContentById(chapter.contentId) : null;
    if (chapter.contentId && !document) throw new Error("待导出正文已删除");
    snapshots.push(
      document ? { ...chapter, content: document.content, contracts: document.contracts } : chapter
    );
  }
  const contracts = Object.assign(
    {},
    ...snapshots.map(chapter => chapter.contracts ?? {})
  ) as ContentContractDictionary;
  const assets = await collectBundleAssets(
    snapshots.map(chapter => chapter.content || []),
    { contracts }
  );
  const localized: BatchExportChapter[] = [];
  for (const chapter of snapshots) {
    const content = localizeContent(chapter.content || [], {
      assets: assets.paths,
      dir: [],
      contracts: chapter.contracts,
    });
    const markdown = chapter.contracts
      ? (
          await (await import("@/services/editorKit")).prepareContentMarkdown(chapter.contracts)
        ).getMarkdown(content)
      : getMarkdown(content);
    localized.push({ ...chapter, content, markdown });
  }
  return {
    chapters: localized,
    assetFiles: assets.files,
    warnings: assets.warnings,
  };
};

const refKey = (ref: EntityRef) => `${ref.kind}:${ref.id}`;
const nodeRef = (node: BatchExportTreeNode): EntityRef =>
  node.ref ?? { kind: "project-item", id: node.id };

const frontmatterOf = (node: BatchExportTreeNode) => {
  const meta: Record<string, unknown> = { title: node.title };
  if (node.meta?.tags?.length) meta.tags = node.meta.tags;
  if (node.meta?.createTime) meta.created = new Date(node.meta.createTime).toISOString();
  if (node.meta?.updateTime) meta.updated = new Date(node.meta.updateTime).toISOString();
  return `---\n${stringifyYaml(meta).trim()}\n---\n\n`;
};

/**
 * 构建保持目录层级的 Markdown ZIP：
 * 每个选中的文档一个 .md 文件，子级放在同名文件夹下；
 * 未选中、无正文或不可导出的节点在存在选中后代时只作为文件夹保留层级，
 * 选中但无正文且无选中后代的文档导出为空文件。
 * 本机资源收进包根 assets/；指向包内文档的应用内链接按 linkStyle 改写，包外的降为标题文本。
 * ZIP 按目录分文件，导出规则（分页/标题）不适用，文件名即标题。
 * 项目整体导出与 Markdown 导出（项目 / 文章 / 卡片 / 全部）共用，后者的分组节点不可导出。
 */
export const buildMarkdownZipBytes = async (
  tree: BatchExportTreeNode[],
  selectedIds: Set<number>,
  onProgress?: BatchProgressListener,
  options: MarkdownBundleOptions = {}
): Promise<{ bytes: Uint8Array; warnings: string[]; fileCount: number; assetCount: number }> => {
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

  // 先定好每篇的包内路径，链接改写需要全部目标就位
  const files: Array<{ node: BatchExportTreeNode; dir: string[]; path: string[] }> = [];
  const assignPaths = (nodes: BatchExportTreeNode[], dirSegments: string[]) => {
    // 包根预留 assets，同名文档的 .md 与子目录一起改名，保持文件与目录同名
    const reserved = dirSegments.length === 0 ? [ASSET_DIR] : [];
    const uniqueDirName = createUniqueNamer(reserved);
    const uniqueFileName = createUniqueNamer(reserved);
    for (const node of nodes) {
      if (!includedNodeIds.has(node.id)) {
        continue;
      }
      const dirName = uniqueDirName(sanitizeFileName(node.title, UNTITLED_FILE_NAME));
      if (fileNodeIds.has(node.id)) {
        const fileName = uniqueFileName(sanitizeFileName(node.title, UNTITLED_FILE_NAME));
        files.push({ node, dir: dirSegments, path: [...dirSegments, `${fileName}.md`] });
      }
      assignPaths(node.children, [...dirSegments, dirName]);
    }
  };
  assignPaths(tree, []);

  // 同一身份出现在多处（共享文档）时链接指向第一处
  const pathByRef = new Map<string, string[]>();
  const stemCounts = new Map<string, number>();
  for (const file of files) {
    const key = refKey(nodeRef(file.node));
    if (!pathByRef.has(key)) pathByRef.set(key, file.path);
    const stem = file.path[file.path.length - 1].replace(/\.md$/, "");
    stemCounts.set(stem, (stemCounts.get(stem) ?? 0) + 1);
  }

  const contents = new Map<number, Descendant[]>();
  const contracts = new Map<number, ContentContractDictionary>();
  for (const file of files) {
    if (file.node.empty) continue;
    const document = file.node.contentId ? await getContentById(file.node.contentId) : null;
    if (file.node.contentId && !document) throw new Error("待导出正文已删除");
    contents.set(
      file.node.id,
      document?.content ??
        (file.node.loadContent ? await file.node.loadContent() : file.node.content || [])
    );
    if (document?.contracts) contracts.set(file.node.id, document.contracts);
  }
  const resourceContracts = Object.assign({}, ...contracts.values()) as ContentContractDictionary;

  const assets =
    options.assets === "keep"
      ? { paths: new Map<string, string>(), files: [] as BundleFile[], warnings: [] as string[] }
      : await collectBundleAssets([...contents.values()], {
          fetchRemote: options.fetchRemote,
          contracts: resourceContracts,
        });
  const bundleFiles: BundleFile[] = [];
  for (const [index, { node, dir, path }] of files.entries()) {
    const content = contents.get(node.id);
    const body = content
      ? toPortableMarkdown(content, {
          contracts: contracts.get(node.id),
          markdown: contracts.has(node.id)
            ? await (
                await import("@/services/editorKit")
              ).prepareContentMarkdown(contracts.get(node.id)!)
            : undefined,
          assets: assets.paths,
          dir,
          resolveLink: ref => pathByRef.get(refKey(ref)) ?? null,
          linkStyle: options.linkStyle,
          isUniqueStem: stem => (stemCounts.get(stem) ?? 0) <= 1,
        })
      : "";
    bundleFiles.push({
      path: path.join("/"),
      data: (options.frontmatter ? frontmatterOf(node) : "") + body,
    });
    onProgress?.(index + 1, files.length, node.title);
  }

  return {
    bytes: await zipBundle([...bundleFiles, ...assets.files]),
    warnings: assets.warnings,
    fileCount: files.length,
    assetCount: assets.files.length,
  };
};
