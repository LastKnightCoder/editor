/**
 * 批量导入的来源：本机文件夹（递归读取）或压缩包（整包读入内存）。
 * 对外只暴露包内相对路径（/ 分隔）与按相对路径读取，扫描与执行不区分来源形态。
 */

import {
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  configure as configureZip,
} from "@zip.js/zip.js";
import { getFileBaseName, readBinaryFile, readDirectory } from "@/commands/file";

export interface TransferSource {
  kind: "folder" | "zip";
  /** 文件夹名或压缩包名（不含扩展名），用作默认项目名 */
  name: string;
  /** 文件夹 / 压缩包的本机绝对路径 */
  rootPath: string;
  /** 全部文件的相对路径（已排除隐藏目录与系统垃圾文件） */
  files: string[];
  has: (relativePath: string) => boolean;
  readBytes: (relativePath: string) => Promise<Uint8Array>;
  readText: (relativePath: string) => Promise<string>;
}

/** 单个来源的文件数上限，防止误选家目录等超大目录时长时间卡在扫描 */
export const MAX_SOURCE_FILES = 20000;

const IGNORED_DIRS = new Set(["node_modules", "__MACOSX"]);
const IGNORED_FILES = new Set(["Thumbs.db", "desktop.ini"]);

/** 隐藏目录（.obsidian / .git / .trash…）与系统垃圾文件不参与导入 */
export const isIgnoredSegment = (segment: string, isDirectory: boolean) =>
  segment.startsWith(".") || (isDirectory ? IGNORED_DIRS.has(segment) : IGNORED_FILES.has(segment));

const isIgnoredPath = (path: string) => {
  const segments = path.split("/").filter(Boolean);
  return segments.some((segment, index) => isIgnoredSegment(segment, index < segments.length - 1));
};

const decoder = new TextDecoder("utf-8");

/** 规范化包内相对路径：统一 /，消解 . 与 ..；越出根目录返回 null */
export const normalizeRelativePath = (path: string): string | null => {
  const out: string[] = [];
  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else {
      out.push(segment);
    }
  }
  return out.join("/");
};

const stemOf = (fileName: string) => fileName.replace(/\.[^.]+$/, "") || fileName;

export interface SourceDeps {
  readDirectory: typeof readDirectory;
  readBinaryFile: typeof readBinaryFile;
  getFileBaseName: typeof getFileBaseName;
}

const defaultDeps: SourceDeps = { readDirectory, readBinaryFile, getFileBaseName };

export const openFolderSource = async (
  rootPath: string,
  deps: SourceDeps = defaultDeps
): Promise<TransferSource> => {
  const files: string[] = [];
  const absoluteOf = new Map<string, string>();
  const walk = async (dirPath: string, prefix: string) => {
    const entries = await deps.readDirectory(dirPath);
    for (const entry of entries) {
      if (isIgnoredSegment(entry.name, entry.isDirectory)) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory) {
        await walk(entry.path, relative);
      } else {
        if (files.length >= MAX_SOURCE_FILES) {
          throw new Error(`文件超过 ${MAX_SOURCE_FILES} 个，请选择更小的文件夹`);
        }
        files.push(relative);
        absoluteOf.set(relative, entry.path);
      }
    }
  };
  await walk(rootPath, "");

  const readBytes = async (relativePath: string) => {
    const absolute = absoluteOf.get(relativePath);
    if (!absolute) throw new Error(`来源中没有 ${relativePath}`);
    return deps.readBinaryFile(absolute);
  };
  return {
    kind: "folder",
    name: await deps.getFileBaseName(rootPath),
    rootPath,
    files,
    has: path => absoluteOf.has(path),
    readBytes,
    readText: async path => decoder.decode(await readBytes(path)),
  };
};

export const openZipSource = async (
  zipPath: string,
  deps: SourceDeps = defaultDeps
): Promise<TransferSource> => {
  configureZip({ useWebWorkers: false });
  const reader = new ZipReader(new Uint8ArrayReader(await deps.readBinaryFile(zipPath)));
  const entries = await reader.getEntries();
  await reader.close();

  const byPath = new Map<string, (typeof entries)[number]>();
  for (const entry of entries) {
    if (entry.directory) continue;
    const path = normalizeRelativePath(entry.filename);
    if (!path || isIgnoredPath(path)) continue;
    if (byPath.size >= MAX_SOURCE_FILES) {
      throw new Error(`压缩包内文件超过 ${MAX_SOURCE_FILES} 个`);
    }
    byPath.set(path, entry);
  }

  // 压缩包常带一层与包同名的根目录，剥掉后路径与直接选文件夹一致
  let files = [...byPath.keys()];
  const roots = new Set(files.map(path => path.split("/")[0]));
  const strip =
    roots.size === 1 && files.every(path => path.includes("/")) ? `${[...roots][0]}/` : "";
  if (strip) files = files.map(path => path.slice(strip.length));

  const readBytes = async (relativePath: string) => {
    const entry = byPath.get(strip + relativePath);
    if (!entry || entry.directory) throw new Error(`压缩包中没有 ${relativePath}`);
    return entry.getData(new Uint8ArrayWriter());
  };
  const zipName = stemOf(await deps.getFileBaseName(zipPath));
  return {
    kind: "zip",
    name: strip ? strip.slice(0, -1) : zipName,
    rootPath: zipPath,
    files,
    has: path => byPath.has(strip + path),
    readBytes,
    readText: async path => decoder.decode(await readBytes(path)),
  };
};

export const isZipPath = (path: string) => /\.zip$/i.test(path);

export const openTransferSource = (path: string) =>
  isZipPath(path) ? openZipSource(path) : openFolderSource(path);
