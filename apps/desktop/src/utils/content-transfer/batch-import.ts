/**
 * 文件夹 / 压缩包批量导入：先扫描成计划（只读，不写库），用户确认后分三遍执行——
 * ① 资源去重上传 ② 按目标建文档（项目树 / 文章 / 卡片） ③ 全部文档有了 id 后，
 * 把指向本批文档的相对 .md 链接回填为应用内链接（content-link）。
 */

import type { Descendant } from "slate";
import { parse as parseYaml } from "yaml";
import { importFromMarkdown } from "@/utils/markdown";
import {
  baseNameOf,
  collectAssetUrls,
  isDataUri,
  isPortableAssetSource,
  mapAssetUrls,
} from "./assets";
import { parseLocalReference, uploadAssetBytes } from "./import";
import { normalizeRelativePath, type TransferSource } from "./source";

export type ImportTarget = "project" | "article" | "card";

export type AssetLocation = { kind: "source"; path: string } | { kind: "disk"; path: string };

export interface PlanAsset {
  key: string;
  location: AssetLocation;
  fileName: string;
}

export interface PlanDoc {
  key: number;
  /** 来源内相对路径 */
  path: string;
  title: string;
  /** 所在文件夹（相对路径段） */
  folder: string[];
  content: Descendant[];
  frontmatterTags: string[];
  /** 正文里的资源地址 → 计划资源 key */
  assets: Map<string, string>;
  /** 来源里找不到的资源地址 */
  missingAssets: string[];
  /** 正文里的链接地址 → 本批文档 key */
  links: Map<string, number>;
  /** 形似本地 .md 但不在本批的链接 */
  unresolvedLinks: string[];
}

export interface PlanNode {
  key: number;
  title: string;
  /** 缺省为纯文件夹 */
  doc?: PlanDoc;
  children: PlanNode[];
}

export interface ImportPlan {
  source: TransferSource;
  docs: PlanDoc[];
  /** 文件夹树（folder note：同级同名的 X.md 与 X/ 合并为一个节点） */
  tree: PlanNode[];
  assets: Map<string, PlanAsset>;
  /** 来源中既不是 Markdown、也未被正文引用的文件数 */
  otherFileCount: number;
}

export interface ScanDeps {
  pathExists: (path: string) => Promise<boolean>;
  getHomeDir: () => Promise<string>;
  resolvePathFrom: (baseDir: string, target: string) => Promise<string>;
}

const MARKDOWN_RE = /\.(md|markdown)$/i;
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const FRONT_MATTER_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

const tryDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const dirOf = (path: string) => path.split("/").slice(0, -1);
const stemOf = (fileName: string) => fileName.replace(/\.[^.]+$/, "");
const joinRelative = (dir: string[], target: string) =>
  normalizeRelativePath([...dir, target].join("/"));

/** frontmatter 的 tags（数组或逗号 / 空白分隔的字符串）与 title */
export const readFrontmatter = (markdown: string): { tags: string[]; title?: string } => {
  const match = markdown.match(FRONT_MATTER_RE);
  if (!match) return { tags: [] };
  try {
    const meta = parseYaml(match[1]) as Record<string, unknown> | null;
    if (!meta || typeof meta !== "object") return { tags: [] };
    const raw = meta.tags ?? meta.tag;
    const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,，\s]+/) : [];
    const tags = list.map(tag => String(tag).trim().replace(/^#/, "")).filter(Boolean);
    const title =
      typeof meta.title === "string" && meta.title.trim() ? meta.title.trim() : undefined;
    return { tags: [...new Set(tags)], title };
  } catch {
    return { tags: [] };
  }
};

type SlateNode = Record<string, unknown> & { children?: unknown[] };

/** 遍历 link 元素，按 mapper 结果替换（返回 undefined 保持原样） */
const mapLinks = (
  content: Descendant[],
  mapper: (node: SlateNode) => SlateNode | undefined
): Descendant[] => {
  const visit = (node: unknown): unknown => {
    if (!node || typeof node !== "object") return node;
    const record = node as SlateNode;
    if (record.type === "link") {
      const next = mapper(record);
      if (next) return next;
    }
    if (!Array.isArray(record.children)) return record;
    return { ...record, children: record.children.map(visit) };
  };
  return content.map(node => visit(node) as Descendant);
};

const collectLinkUrls = (content: Descendant[]) => {
  const urls = new Set<string>();
  mapLinks(content, node => {
    if (typeof node.url === "string") urls.add(node.url);
    return undefined;
  });
  return [...urls];
};

/** 链接地址 → 来源内 .md 相对路径；不是本地文档链接返回 null */
const resolveDocLink = (url: string, folder: string[]) => {
  const value = url.trim().replace(/^<|>$/g, "");
  if (!value || value.startsWith("#") || SCHEME_RE.test(value)) return null;
  const path = tryDecode(value.split(/[?#]/)[0]);
  if (!path || path.startsWith("/")) return null;
  return { relative: joinRelative(folder, path), withExtension: MARKDOWN_RE.test(path) };
};

/** 扫描来源生成导入计划：只读来源与检查资源是否存在，不写库、不上传 */
export const scanImportSource = async (
  source: TransferSource,
  deps: ScanDeps,
  onProgress?: (done: number, total: number) => void
): Promise<ImportPlan> => {
  const markdownPaths = source.files
    .filter(path => MARKDOWN_RE.test(path))
    .sort((a, b) => collator.compare(a, b));
  const docs: PlanDoc[] = [];
  const assets = new Map<string, PlanAsset>();
  const existsCache = new Map<string, boolean>();
  const diskExists = async (path: string) => {
    if (!existsCache.has(path)) existsCache.set(path, await deps.pathExists(path));
    return existsCache.get(path) as boolean;
  };
  let homeDir: string | undefined;

  const locateAsset = async (raw: string, folder: string[]): Promise<AssetLocation | null> => {
    const ref = parseLocalReference(raw);
    if (ref.kind === "absolute") {
      return (await diskExists(ref.path)) ? { kind: "disk", path: ref.path } : null;
    }
    if (ref.kind === "home") {
      homeDir ??= await deps.getHomeDir();
      const path = await deps.resolvePathFrom(homeDir, ref.path || ".");
      return (await diskExists(path)) ? { kind: "disk", path } : null;
    }
    const relative = joinRelative(folder, ref.path);
    if (relative && source.has(relative)) return { kind: "source", path: relative };
    // 文件夹来源：越出根目录或在隐藏目录里的资源按本机路径读
    if (source.kind === "folder") {
      const path = await deps.resolvePathFrom([source.rootPath, ...folder].join("/"), ref.path);
      if (await diskExists(path)) return { kind: "disk", path };
    }
    return null;
  };

  for (const [index, path] of markdownPaths.entries()) {
    const markdown = await source.readText(path);
    const folder = dirOf(path);
    const frontmatter = readFrontmatter(markdown);
    const content = importFromMarkdown(markdown, ["yaml"]);
    const doc: PlanDoc = {
      key: index,
      path,
      title: frontmatter.title || stemOf(path.split("/").pop() || path) || "未命名",
      folder,
      content,
      frontmatterTags: frontmatter.tags,
      assets: new Map(),
      missingAssets: [],
      links: new Map(),
      unresolvedLinks: [],
    };
    for (const { url } of collectAssetUrls(content)) {
      if (!isPortableAssetSource(url) || isDataUri(url)) continue;
      const location = await locateAsset(url, folder);
      if (!location) {
        doc.missingAssets.push(url);
        continue;
      }
      const key = `${location.kind}:${location.path}`;
      if (!assets.has(key)) {
        assets.set(key, { key, location, fileName: baseNameOf(location.path) || "file" });
      }
      doc.assets.set(url, key);
    }
    docs.push(doc);
    onProgress?.(index + 1, markdownPaths.length);
  }

  const docByPath = new Map(docs.map(doc => [doc.path, doc]));
  for (const doc of docs) {
    for (const url of collectLinkUrls(doc.content)) {
      const link = resolveDocLink(url, doc.folder);
      if (!link) continue;
      const target =
        (link.relative && docByPath.get(link.relative)) ||
        (!link.withExtension && link.relative ? docByPath.get(`${link.relative}.md`) : undefined);
      if (target) doc.links.set(url, target.key);
      else if (link.withExtension) doc.unresolvedLinks.push(url);
    }
  }

  const referenced = new Set(
    [...assets.values()].filter(a => a.location.kind === "source").map(a => a.location.path)
  );
  return {
    source,
    docs,
    tree: buildPlanTree(docs),
    assets,
    otherFileCount: source.files.filter(path => !MARKDOWN_RE.test(path) && !referenced.has(path))
      .length,
  };
};

/** 文件夹树：X.md 与同级 X/ 合并为一个带子级的文档节点 */
export const buildPlanTree = (docs: PlanDoc[]): PlanNode[] => {
  let nextKey = docs.length;
  const root: PlanNode = { key: -1, title: "", children: [] };
  const folders = new Map<string, PlanNode>([["", root]]);
  const folderNode = (segments: string[]): PlanNode => {
    const id = segments.join("/");
    const existing = folders.get(id);
    if (existing) return existing;
    const parent = folderNode(segments.slice(0, -1));
    const node: PlanNode = { key: nextKey++, title: segments[segments.length - 1], children: [] };
    parent.children.push(node);
    folders.set(id, node);
    return node;
  };
  const folderPaths = new Set(
    docs.flatMap(doc => doc.folder.map((_, index) => doc.folder.slice(0, index + 1).join("/")))
  );
  for (const doc of docs) {
    const ownFolder = [...doc.folder, stemOf(doc.path.split("/").pop() || "")];
    if (folderPaths.has(ownFolder.join("/"))) {
      // 文档本身充当同名文件夹节点
      const node = folderNode(ownFolder);
      node.doc = doc;
      node.title = doc.title;
    } else {
      folderNode(doc.folder).children.push({ key: doc.key, title: doc.title, doc, children: [] });
    }
  }
  const sort = (nodes: PlanNode[]): PlanNode[] =>
    nodes
      .map(node => ({ ...node, children: sort(node.children) }))
      .sort((a, b) => {
        // 同级先文件夹后文档，各自按名称自然排序
        const folderFirst = Number(b.children.length > 0) - Number(a.children.length > 0);
        return folderFirst || collator.compare(a.title, b.title);
      });
  return sort(root.children);
};

/* ---------- 执行 ---------- */

export interface ImportOptions {
  target: ImportTarget;
  /** target = project 时的新项目名 */
  projectTitle: string;
  /** 选中的文档 key */
  selected: Set<number>;
  /** frontmatter 的 tags 写进标签（文章 / 卡片） */
  useFrontmatterTags: boolean;
}

export interface CreatedEntity {
  id: number;
  contentId: number;
}

export interface ImportDeps {
  readDiskBytes: (path: string) => Promise<Uint8Array>;
  upload: (file: File) => Promise<string | null>;
  createProject: (title: string) => Promise<number>;
  /** parentItemId 缺省为项目根 */
  addProjectItem: (input: {
    projectId: number;
    parentItemId?: number;
    title: string;
    content: Descendant[];
  }) => Promise<CreatedEntity>;
  createArticle: (input: {
    title: string;
    content: Descendant[];
    tags: string[];
  }) => Promise<CreatedEntity>;
  createCard: (input: { content: Descendant[]; tags: string[] }) => Promise<CreatedEntity>;
  updateContent: (contentId: number, content: Descendant[]) => Promise<unknown>;
}

export type ImportPhase = "assets" | "docs" | "links";

export interface ImportHooks {
  onProgress?: (phase: ImportPhase, done: number, total: number, label?: string) => void;
  signal?: AbortSignal;
  /** 每次写库前调用；抛错即中止（如切换了数据库） */
  beforeWrite?: () => void;
}

export interface ImportResult {
  target: ImportTarget;
  projectId?: number;
  /** 文章或卡片 id（项目导入为空，撤销删除项目即可） */
  entityIds: number[];
  docCount: number;
  assetCount: number;
  linkCount: number;
  warnings: string[];
  /** 用户停止或出错中断；已写入的部分仍记在结果里，可整批撤销 */
  stopped?: "canceled" | "failed";
  error?: string;
}

const CONTENT_TYPE: Record<ImportTarget, string> = {
  project: "project-item",
  article: "article",
  card: "card",
};

/** 文章取顶层文件夹名为标签，卡片取完整文件夹路径为层级标签（a/b） */
const folderTags = (doc: PlanDoc, target: ImportTarget) => {
  if (doc.folder.length === 0) return [];
  return target === "card" ? [doc.folder.join("/")] : [doc.folder[0]];
};

/** 选中文档及其祖先构成的子树（祖先只作为分组保留层级） */
const pruneTree = (nodes: PlanNode[], selected: Set<number>): PlanNode[] =>
  nodes.flatMap(node => {
    const children = pruneTree(node.children, selected);
    const self = !!node.doc && selected.has(node.doc.key);
    return self || children.length > 0
      ? [{ ...node, doc: self ? node.doc : undefined, children }]
      : [];
  });

export const runImport = async (
  plan: ImportPlan,
  options: ImportOptions,
  deps: ImportDeps,
  hooks: ImportHooks = {}
): Promise<ImportResult> => {
  const result: ImportResult = {
    target: options.target,
    entityIds: [],
    docCount: 0,
    assetCount: 0,
    linkCount: 0,
    warnings: [],
  };
  const docs = plan.docs.filter(doc => options.selected.has(doc.key));
  const checkpoint = () => {
    if (hooks.signal?.aborted) throw new DOMException("已停止", "AbortError");
  };
  const write = <T>(fn: () => Promise<T>) => {
    checkpoint();
    hooks.beforeWrite?.();
    return fn();
  };

  try {
    // ① 资源：本批选中文档引用到的才上传，同一来源只传一次
    const assetKeys = [...new Set(docs.flatMap(doc => [...doc.assets.values()]))];
    const uploaded = new Map<string, string>();
    for (const [index, key] of assetKeys.entries()) {
      checkpoint();
      const asset = plan.assets.get(key);
      if (!asset) continue;
      try {
        const bytes =
          asset.location.kind === "source"
            ? await plan.source.readBytes(asset.location.path)
            : await deps.readDiskBytes(asset.location.path);
        uploaded.set(key, await uploadAssetBytes(bytes, asset.fileName, deps.upload));
      } catch (error) {
        result.warnings.push(`资源未导入（${asset.location.path}）：${errorMessage(error)}`);
      }
      hooks.onProgress?.("assets", index + 1, assetKeys.length, asset.fileName);
    }
    result.assetCount = uploaded.size;
    for (const doc of docs) {
      for (const url of doc.missingAssets) result.warnings.push(`${doc.path}：找不到资源 ${url}`);
      for (const url of doc.unresolvedLinks) result.warnings.push(`${doc.path}：链接未解析 ${url}`);
    }

    const localized = new Map(
      docs.map(doc => [
        doc.key,
        mapAssetUrls(
          doc.content,
          url => {
            const key = doc.assets.get(url);
            return key ? uploaded.get(key) : undefined;
          },
          { uploaded: true }
        ),
      ])
    );

    // ② 建文档
    const created = new Map<number, CreatedEntity & { title: string }>();
    const tagsOf = (doc: PlanDoc) => [
      ...new Set([
        ...folderTags(doc, options.target),
        ...(options.useFrontmatterTags ? doc.frontmatterTags : []),
      ]),
    ];
    let done = 0;
    const report = (title: string) => hooks.onProgress?.("docs", ++done, docs.length, title);

    if (options.target === "project") {
      const projectId = await write(() => deps.createProject(options.projectTitle));
      result.projectId = projectId;
      const walk = async (nodes: PlanNode[], parentItemId?: number) => {
        for (const node of nodes) {
          const content = node.doc ? (localized.get(node.doc.key) ?? []) : [];
          const item = await write(() =>
            deps.addProjectItem({ projectId, parentItemId, title: node.title, content })
          );
          if (node.doc) {
            created.set(node.doc.key, { ...item, title: node.title });
            result.docCount += 1;
            report(node.title);
          }
          await walk(node.children, item.id);
        }
      };
      await walk(pruneTree(plan.tree, options.selected));
    } else {
      for (const doc of docs) {
        const content = localized.get(doc.key) ?? [];
        const tags = tagsOf(doc);
        const entity = await write(() =>
          options.target === "article"
            ? deps.createArticle({ title: doc.title, content, tags })
            : deps.createCard({ content, tags })
        );
        result.entityIds.push(entity.id);
        created.set(doc.key, { ...entity, title: doc.title });
        result.docCount += 1;
        report(doc.title);
      }
    }

    // ③ 回填链接：指向本批已建文档的 link 换成 content-link，保留原链接文字
    const linking = docs.filter(doc => doc.links.size > 0 && created.has(doc.key));
    for (const [index, doc] of linking.entries()) {
      const self = created.get(doc.key);
      const content = localized.get(doc.key);
      if (!self || !content) continue;
      let replaced = 0;
      const next = mapLinks(content, node => {
        const targetKey = typeof node.url === "string" ? doc.links.get(node.url) : undefined;
        const target = targetKey === undefined ? undefined : created.get(targetKey);
        if (!target) return undefined;
        replaced += 1;
        return {
          type: "content-link",
          refId: target.id,
          contentId: target.contentId,
          contentType: CONTENT_TYPE[options.target],
          contentTitle: target.title,
          children: node.children?.length
            ? node.children
            : [{ type: "formatted", text: target.title }],
        };
      });
      if (replaced > 0) {
        await write(() => deps.updateContent(self.contentId, next));
        result.linkCount += replaced;
      }
      hooks.onProgress?.("links", index + 1, linking.length, doc.title);
    }
  } catch (error) {
    const canceled = error instanceof DOMException && error.name === "AbortError";
    result.stopped = canceled ? "canceled" : "failed";
    if (!canceled) result.error = errorMessage(error);
  }
  return result;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** 计划概况：选中文档的资源、链接与问题数（预览右栏与按钮文案） */
export const summarizePlan = (plan: ImportPlan, selected: Set<number>) => {
  const docs = plan.docs.filter(doc => selected.has(doc.key));
  const assetKeys = new Set(docs.flatMap(doc => [...doc.assets.values()]));
  return {
    docCount: docs.length,
    assetCount: assetKeys.size,
    missingAssetCount: docs.reduce((sum, doc) => sum + doc.missingAssets.length, 0),
    linkCount: docs.reduce((sum, doc) => sum + doc.links.size, 0),
    unresolvedLinkCount: docs.reduce((sum, doc) => sum + doc.unresolvedLinks.length, 0),
    issueDocCount: docs.filter(doc => doc.missingAssets.length + doc.unresolvedLinks.length > 0)
      .length,
  };
};
