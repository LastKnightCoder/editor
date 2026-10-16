/**
 * Markdown 导出包：本机资源收进包根 assets/，正文里的地址改为相对路径；
 * 应用内链接（content-link）指向包内文档时改为相对 .md 链接，否则降为标题文本。
 * 远程地址原样保留。单篇、合并与按目录打包三种导出共用。
 */

import type { Descendant } from "slate";
import {
  TextReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipWriter,
  configure as configureZip,
} from "@zip.js/zip.js";
import { normalizeEntityRefKind, type EntityRef } from "@/entity/ref";
import { getMarkdown } from "@/utils/markdown";
import {
  collectAssetUrls,
  defaultAssetIo,
  extensionOf,
  isPortableAssetSource,
  isRemoteUrl,
  mapAssetUrls,
  readAssetBytes,
  type AssetIo,
} from "./assets";

export const ASSET_DIR = "assets";

export interface BundleFile {
  /** 包内路径，/ 分隔 */
  path: string;
  data: string | Uint8Array;
}

export interface BundleAssets {
  /** 原地址 → 包内路径（如 assets/a.png） */
  paths: Map<string, string>;
  files: BundleFile[];
  warnings: string[];
}

/** 包内文件名：去掉路径分隔与 Markdown 链接里难转义的字符，空白折成 - */
const toAssetFileName = (fileName: string) =>
  fileName
    .replace(/[\\/:*?"<>|#%()[\]{}]/g, "_")
    .replace(/\s+/g, "-")
    .replace(/^\.+/, "") || "file";

const createUniqueAssetNamer = () => {
  const used = new Set<string>();
  return (fileName: string) => {
    const ext = extensionOf(fileName);
    const stem = ext ? fileName.slice(0, -(ext.length + 1)) : fileName;
    let candidate = fileName;
    for (let n = 2; used.has(candidate.toLowerCase()); n += 1) {
      candidate = ext ? `${stem}-${n}.${ext}` : `${stem}-${n}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  };
};

/**
 * 读取一组正文引用的本机资源，按来源去重后放进 assets/。
 * 读取失败的资源不入包，正文保留原地址，原因记入 warnings。
 */
export const collectBundleAssets = async (
  contents: Descendant[][],
  options: {
    io?: AssetIo;
    onProgress?: (processed: number, total: number) => void;
    /** 传入即同时打包远程资源：下载到本机缓存并返回本机路径 */
    fetchRemote?: (url: string) => Promise<string>;
  } = {}
): Promise<BundleAssets> => {
  const io = options.io ?? defaultAssetIo;
  const sources = [
    ...new Set(
      contents.flatMap(content =>
        collectAssetUrls(content)
          .map(ref => ref.url)
          .filter(url => isPortableAssetSource(url) || (!!options.fetchRemote && isRemoteUrl(url)))
      )
    ),
  ];
  const nameAsset = createUniqueAssetNamer();
  const paths = new Map<string, string>();
  const files: BundleFile[] = [];
  const warnings: string[] = [];
  for (const [index, source] of sources.entries()) {
    try {
      const local =
        options.fetchRemote && isRemoteUrl(source) ? await options.fetchRemote(source) : source;
      const { bytes, fileName } = await readAssetBytes(local, io);
      const path = `${ASSET_DIR}/${nameAsset(toAssetFileName(fileName))}`;
      paths.set(source, path);
      files.push({ path, data: bytes });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      warnings.push(`资源读取失败，保留原地址（${source}）：${reason}`);
    }
    options.onProgress?.(index + 1, sources.length);
  }
  return { paths, files, warnings };
};

/** Markdown 链接目标里的空格、括号等按 URL 编码，中文保持原样 */
export const encodeMarkdownPath = (path: string) =>
  path
    .split("/")
    .map(segment =>
      segment.replace(
        /[\s()<>#?%[\]]/g,
        char => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`
      )
    )
    .join("/");

/** 从 fromDir 目录到 toPath 文件的相对路径（均为 / 分隔的包内路径段） */
export const relativeBundlePath = (fromDir: string[], toPath: string[]) => {
  let common = 0;
  while (
    common < fromDir.length &&
    common < toPath.length - 1 &&
    fromDir[common] === toPath[common]
  ) {
    common += 1;
  }
  return [...Array(fromDir.length - common).fill(".."), ...toPath.slice(common)].join("/");
};

/** 应用内链接的导出写法：相对 .md 链接（通用）/ [[文件名]]（Obsidian）/ 纯文字 */
export type LinkStyle = "relative" | "wiki" | "text";

export interface LocalizeOptions {
  assets: Map<string, string>;
  /** 当前文件所在目录（包内路径段），资源与链接据此算相对路径 */
  dir: string[];
  /** content-link 目标在包内时返回其包内路径段（含 .md 文件名），否则 null */
  resolveLink?: (ref: EntityRef) => string[] | null;
  /** 缺省 relative；包外目标一律降为标题文字 */
  linkStyle?: LinkStyle;
  /** wiki 写法下文件名在包内是否唯一；不唯一时写包内完整路径 */
  isUniqueStem?: (stem: string) => boolean;
}

const WIKI_SCHEME = "tau-wikilink:";
const stemOfFile = (fileName: string) => fileName.replace(/\.md$/i, "");

const textOf = (node: unknown): string => {
  if (!node || typeof node !== "object") return "";
  const record = node as { text?: unknown; children?: unknown[] };
  if (typeof record.text === "string") return record.text;
  return Array.isArray(record.children) ? record.children.map(textOf).join("") : "";
};

const localizeLinks = (node: unknown, options: LocalizeOptions): unknown => {
  if (!node || typeof node !== "object") return node;
  const record = node as Record<string, unknown> & { children?: unknown[] };
  if (record.type === "content-link") {
    const title = String(record.contentTitle || "").trim() || textOf(record) || "未命名";
    const kind = normalizeEntityRefKind(record.contentType);
    const style = options.linkStyle ?? "relative";
    const target =
      kind && style !== "text" ? options.resolveLink?.({ kind, id: Number(record.refId) }) : null;
    if (!target) return { type: "formatted", text: title };
    if (style === "wiki") {
      const stem = stemOfFile(target[target.length - 1]);
      const name = options.isUniqueStem?.(stem) === false ? stemOfFile(target.join("/")) : stem;
      // 占位链接，序列化后在 toPortableMarkdown 里换成 [[…]]（直接写文字会被转义）
      return {
        type: "link",
        url: WIKI_SCHEME + encodeURIComponent(name),
        children: [{ type: "formatted", text: title }],
      };
    }
    return {
      type: "link",
      url: encodeMarkdownPath(relativeBundlePath(options.dir, target)),
      children: [{ type: "formatted", text: title }],
    };
  }
  if (!Array.isArray(record.children)) return record;
  return { ...record, children: record.children.map(child => localizeLinks(child, options)) };
};

/** 把正文改写为包内可移植的形态（资源相对路径 + 链接改写），不修改原正文 */
export const localizeContent = (content: Descendant[], options: LocalizeOptions): Descendant[] => {
  const withAssets = mapAssetUrls(content, url => {
    const path = options.assets.get(url);
    return path ? encodeMarkdownPath(relativeBundlePath(options.dir, path.split("/"))) : undefined;
  });
  return withAssets.map(node => localizeLinks(node, options) as Descendant);
};

const WIKI_PLACEHOLDER_RE = /\[((?:\\.|[^\]\\])*)\]\(tau-wikilink:([^)\s]+)\)/g;

/** 占位链接 → [[名称]] / [[名称|显示文字]]；显示文字里的 | ] 会截断维基链接，替换掉 */
const restoreWikiLinks = (markdown: string) =>
  markdown.replace(WIKI_PLACEHOLDER_RE, (_, rawText: string, rawName: string) => {
    const text = rawText.replace(/\\(.)/g, "$1").replace(/[|\]]/g, " ").trim();
    const name = decodeURIComponent(rawName);
    return text && text !== name.split("/").pop() ? `[[${name}|${text}]]` : `[[${name}]]`;
  });

export const toPortableMarkdown = (content: Descendant[], options: LocalizeOptions) => {
  const markdown = getMarkdown(localizeContent(content, options)).trim() + "\n";
  return options.linkStyle === "wiki" ? restoreWikiLinks(markdown) : markdown;
};

export const zipBundle = async (files: BundleFile[]): Promise<Uint8Array> => {
  configureZip({ useWebWorkers: false });
  const writer = new ZipWriter(new Uint8ArrayWriter());
  for (const file of files) {
    await writer.add(
      file.path,
      typeof file.data === "string" ? new TextReader(file.data) : new Uint8ArrayReader(file.data)
    );
  }
  return await writer.close();
};
