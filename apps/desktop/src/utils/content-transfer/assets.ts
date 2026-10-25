/**
 * 正文里的资源引用（图片 / 音视频 / 附件）：遍历改写与字节读取。
 * 导出打包、导入入库、PDF 内联共用这一处；哪些字段是资源只看节点的资源声明。
 */

import type { Descendant } from "slate";
import {
  mapNodeResources,
  type ContentResourceDeclarations,
  type ContentResourceKind,
} from "@tau/db-schema/content-resources";
import { readBinaryFile } from "@/commands/file";
import { getMediaMimeType, resolveLocalMediaPath } from "@/utils/localMediaPath";
import { contentResourceDeclarations } from "@/services/content-resources";

export type AssetKind = ContentResourceKind;

/** 改写一个资源地址；返回 undefined 保持原值 */
export type AssetUrlMapper = (url: string, kind: AssetKind) => string | undefined;

type SlateRecord = Record<string, unknown> & { children?: unknown[] };

export const isRemoteUrl = (value: string) => /^https?:\/\//i.test(value);
export const isDataUri = (value: string) => value.startsWith("data:");

/** 只有本机文件与 data URI 需要随内容搬运；远程地址、blob 与空值原样保留 */
export const isPortableAssetSource = (value: string) =>
  !!value && !isRemoteUrl(value) && !value.startsWith("blob:");

export interface MapAssetOptions {
  contracts?: import("@tau/db-schema/content-contracts").ContentContractDictionary;
  /** 新地址是资源存储的上传结果（附件 isLocal=false，与插入附件时「上传」一致）；否则视为引用本机文件 */
  uploaded?: boolean;
}

const mapAttachment = (
  record: SlateRecord,
  mapper: AssetUrlMapper,
  options: MapAssetOptions
): SlateRecord => {
  const source = String((record.isLocal && record.localFilePath) || record.filePath || "").trim();
  if (!source) return record;
  const next = mapper(source, "file");
  if (next === undefined) return record;
  const rest = { ...record };
  delete rest.localFilePath;
  return { ...rest, filePath: next, isLocal: !options.uploaded && !isRemoteUrl(next) };
};

const mapNode = (
  node: unknown,
  mapper: AssetUrlMapper,
  options: MapAssetOptions,
  declarations: ContentResourceDeclarations
): unknown => {
  if (!node || typeof node !== "object") return node;
  let record = node as SlateRecord;
  // 附件的本机副本与 isLocal 标记一起换，不按字段逐个改写
  if (record.type === "file-attachment" && !record.tauContract)
    record = mapAttachment(record, mapper, options);
  else if (typeof record.type === "string")
    record = mapNodeResources(
      record,
      typeof record.tauContract === "string"
        ? options.contracts?.[record.tauContract]?.resources
        : declarations[record.type],
      (url, kind) => (url.trim() ? mapper(url.trim(), kind) : undefined)
    );
  const original = record.children;
  if (Array.isArray(original)) {
    const children = original.map(child => mapNode(child, mapper, options, declarations));
    if (children.some((child, index) => child !== original[index])) {
      record = { ...record, children };
    }
  }
  return record;
};

/** 按 mapper 改写正文中的全部资源地址，未改动的子树保持原引用 */
export const mapAssetUrls = (
  content: Descendant[],
  mapper: AssetUrlMapper,
  options: MapAssetOptions = {},
  declarations: ContentResourceDeclarations = contentResourceDeclarations()
): Descendant[] => content.map(node => mapNode(node, mapper, options, declarations) as Descendant);

/** 收集正文中的资源地址（去重，保持出现顺序） */
export const collectAssetUrls = (
  content: Descendant[],
  declarations: ContentResourceDeclarations = contentResourceDeclarations(),
  contracts?: import("@tau/db-schema/content-contracts").ContentContractDictionary
): Array<{ url: string; kind: AssetKind }> => {
  const found = new Map<string, AssetKind>();
  mapAssetUrls(
    content,
    (url, kind) => {
      if (!found.has(url)) found.set(url, kind);
      return undefined;
    },
    { contracts },
    declarations
  );
  return [...found].map(([url, kind]) => ({ url, kind }));
};

/* ---------- 字节读取 ---------- */

export interface AssetIo {
  resolveLocalMediaPath: (raw: string) => Promise<string>;
  readBinaryFile: (path: string) => Promise<Uint8Array>;
}

export const defaultAssetIo: AssetIo = { resolveLocalMediaPath, readBinaryFile };

export interface AssetBytes {
  bytes: Uint8Array;
  /** 来源文件名（含扩展名），data URI 按 mime 生成 */
  fileName: string;
  mimeType: string;
}

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

const decodeBase64ToBytes = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

export const parseDataUri = (dataUri: string): { mimeType: string; bytes: Uint8Array } => {
  const commaIndex = dataUri.indexOf(",");
  if (commaIndex < 0) throw new Error("无效的 data URI");
  const header = dataUri.slice(5, commaIndex);
  const payload = dataUri.slice(commaIndex + 1);
  const mimeType = header.split(";")[0].trim() || "application/octet-stream";
  return /;base64/i.test(header)
    ? { mimeType, bytes: decodeBase64ToBytes(payload) }
    : { mimeType, bytes: new TextEncoder().encode(decodeURIComponent(payload)) };
};

const tryDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** 路径最后一段（兼容 / 与 \，去掉查询串） */
export const baseNameOf = (path: string) =>
  tryDecode(path.split(/[?#]/)[0].split(/[\\/]/).pop() || "");

export const extensionOf = (fileName: string) => {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
};

export const mimeTypeOf = (fileName: string) => {
  const ext = extensionOf(fileName);
  return ext ? getMediaMimeType(`.${ext}`) : "application/octet-stream";
};

const stripLtohProtocol = (value: string) =>
  value.startsWith("ltoh:///") ? tryDecode(value.slice("ltoh:///".length)) : value;

/** 读取本机资源或 data URI 的字节；远程地址不在此处理 */
export const readAssetBytes = async (
  src: string,
  io: AssetIo = defaultAssetIo
): Promise<AssetBytes> => {
  if (isDataUri(src)) {
    const { mimeType, bytes } = parseDataUri(src);
    const ext = MIME_TO_EXTENSION[mimeType.toLowerCase()] || mimeType.split("/")[1] || "bin";
    return { bytes, mimeType, fileName: `embedded.${ext}` };
  }
  const resolved = stripLtohProtocol((await io.resolveLocalMediaPath(src)) || src);
  const bytes = await io.readBinaryFile(resolved);
  const fileName = baseNameOf(resolved) || "file";
  return { bytes, fileName, mimeType: mimeTypeOf(fileName) };
};

/**
 * 把本机图片内联为 data URI：PDF 在 data: 页面里渲染，读不到 ~/ 与本机路径。
 * 读取失败的图片保留原地址并记入 warnings。
 */
export const inlineLocalImages = async (
  content: Descendant[],
  io: AssetIo = defaultAssetIo
): Promise<{ content: Descendant[]; warnings: string[] }> => {
  const warnings: string[] = [];
  const inlined = new Map<string, string>();
  for (const { url, kind } of collectAssetUrls(content)) {
    if (kind !== "image" || !isPortableAssetSource(url) || isDataUri(url)) continue;
    try {
      const { bytes, mimeType } = await readAssetBytes(url, io);
      inlined.set(url, `data:${mimeType};base64,${bytesToBase64(bytes)}`);
    } catch (error) {
      warnings.push(`图片读取失败（${url}）：${error instanceof Error ? error.message : error}`);
    }
  }
  if (inlined.size === 0) return { content, warnings };
  return {
    content: mapAssetUrls(content, (url, kind) =>
      kind === "image" ? inlined.get(url) : undefined
    ),
    warnings,
  };
};
