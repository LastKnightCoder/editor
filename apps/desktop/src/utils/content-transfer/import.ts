/**
 * Markdown 文件导入：解析正文，把正文引用的本机资源（相对 .md 所在目录、绝对路径、~、file://）
 * 读出后经当前资源存储上传，地址改写为上传结果。远程地址与 data URI 原样保留。
 */

import type { Descendant } from "slate";
import {
  getDirectoryName,
  getFileBaseName,
  getHomeDir,
  readBinaryFile,
  readTextFile,
  resolvePathFrom,
} from "@/commands/file";
import { uploadResource } from "@/hooks/useUploadResource";
import { importFromMarkdown } from "@/utils/markdown";
import {
  baseNameOf,
  collectAssetUrls,
  isDataUri,
  isPortableAssetSource,
  mapAssetUrls,
  mimeTypeOf,
} from "./assets";

export interface ImportIo {
  readTextFile: (path: string) => Promise<string>;
  readBinaryFile: (path: string) => Promise<Uint8Array>;
  getDirectoryName: (path: string) => Promise<string>;
  getFileBaseName: (path: string, noExtension?: boolean) => Promise<string>;
  getHomeDir: () => Promise<string>;
  resolvePathFrom: (baseDir: string, target: string) => Promise<string>;
  /** 上传到当前资源存储，返回写进正文的地址；失败返回 null */
  upload: (file: File) => Promise<string | null>;
}

const defaultImportIo: ImportIo = {
  readTextFile,
  readBinaryFile,
  getDirectoryName,
  getFileBaseName,
  getHomeDir,
  resolvePathFrom,
  upload: uploadResource,
};

export interface ImportedMarkdown {
  /** 文件名（不含扩展名），作为文章 / 文档标题 */
  title: string;
  content: Descendant[];
  /** 成功入库的资源数 */
  assetCount: number;
  warnings: string[];
}

const tryDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** 资源地址 → 本机绝对路径（相对路径以 .md 所在目录为基准） */
const toAbsolutePath = async (raw: string, baseDir: string, io: ImportIo) => {
  let value = raw.replace(/^<|>$/g, "");
  if (/^file:\/\//i.test(value)) {
    value = tryDecode(new URL(value).pathname).replace(/^\/([a-zA-Z]:\/)/, "$1");
  } else {
    value = tryDecode(value.split(/[?#]/)[0]);
  }
  if (value === "~" || value.startsWith("~/") || value.startsWith("~\\")) {
    value = (await io.getHomeDir()) + value.slice(1);
  }
  return io.resolvePathFrom(baseDir, value);
};

/** 把正文引用的本机资源上传到当前资源存储，地址改写为上传结果 */
export const ingestLocalAssets = async (
  content: Descendant[],
  baseDir: string,
  io: ImportIo = defaultImportIo
): Promise<{ content: Descendant[]; assetCount: number; warnings: string[] }> => {
  const uploaded = new Map<string, string>();
  const warnings: string[] = [];
  for (const { url } of collectAssetUrls(content)) {
    if (!isPortableAssetSource(url) || isDataUri(url)) continue;
    try {
      const path = await toAbsolutePath(url, baseDir, io);
      const bytes = await io.readBinaryFile(path);
      const fileName = baseNameOf(path) || "file";
      const file = new File([bytes as Uint8Array<ArrayBuffer>], fileName, {
        type: mimeTypeOf(fileName),
      });
      const target = await io.upload(file);
      if (!target) throw new Error("上传失败");
      uploaded.set(url, target);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      warnings.push(`资源未导入（${url}）：${reason}`);
    }
  }
  return {
    content: uploaded.size
      ? mapAssetUrls(content, url => uploaded.get(url), { uploaded: true })
      : content,
    assetCount: uploaded.size,
    warnings,
  };
};

/** 读取并解析一个 Markdown 文件，连同其引用的本机资源一起入库 */
export const readMarkdownForImport = async (
  path: string,
  io: ImportIo = defaultImportIo
): Promise<ImportedMarkdown> => {
  const markdown = await io.readTextFile(path);
  const parsed = importFromMarkdown(markdown, ["yaml"]);
  const baseDir = await io.getDirectoryName(path);
  const { content, assetCount, warnings } = await ingestLocalAssets(parsed, baseDir, io);
  const title = await io.getFileBaseName(path, true);
  return {
    title,
    content,
    assetCount,
    warnings: warnings.map(warning => `${title}：${warning}`),
  };
};
