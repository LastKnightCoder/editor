import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUILTIN_CONTENT_RESOURCES,
  mapContentResources,
  mergeContentResources,
  type ContentResourceDeclarations,
} from "@tau/db-schema/content-resources";
import type { ContentRef, PublishedData } from "@tau/plugins/publish-data";
import { normalizeLocalResourcePath } from "@tau/shared/resource-path";
import type { IPublishFile, PublishImageWarning } from "@/types/publish";
import PathUtil from "../utils/PathUtil";
import { isServableStaticPath } from "./server-access";
import { publishedImageReference } from "./publish-media-paths";

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".avif",
  ".bmp",
  ".ico",
  ".apng",
]);

function localImagePath(source: string): string | null {
  if (/^(?:data:|\/\/)/i.test(source)) return null;
  if (/^https?:/i.test(source)) {
    const url = new URL(source);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return null;
    if (url.port !== "24678" || !isServableStaticPath(url.pathname))
      throw new Error("本机服务地址无法用于网站，请重新插入本地图片");
    const path = resolve(PathUtil.getAppDir(), `.${decodeURIComponent(url.pathname)}`);
    const local = relative(PathUtil.getAppDir(), path);
    if (local.startsWith("..") || isAbsolute(local)) throw new Error("本机图片地址超出资源目录");
    return path;
  }
  if (/^blob:/i.test(source)) throw new Error("临时图片地址无法用于网站，请重新插入图片");
  let value = normalizeLocalResourcePath(source);
  if (/^file:/i.test(value)) value = fileURLToPath(value);
  else if (value.startsWith("ltoh:///")) value = value.slice("ltoh:///".length);
  else if (/^[a-z][a-z\d+.-]*:/i.test(value) && !win32.isAbsolute(value))
    throw new Error("图片地址无法解析为本地文件");
  if (value.startsWith("~/")) value = join(PathUtil.getHomeDir(), value.slice(2));
  if (!isAbsolute(value)) throw new Error("图片路径在当前设备无法定位，请重新选择图片");
  return value;
}

function imageFailure(error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT" || code === "ENOTDIR") return "本地图片不存在，可能已移动或删除";
  if (code === "EACCES" || code === "EPERM") return "没有读取本地图片的权限";
  if (code === "EISDIR") return "图片地址指向文件夹";
  return error instanceof Error ? error.message : "本地图片读取失败";
}

function readLocalImage(path: string): Buffer {
  try {
    return readFileSync(path);
  } catch (error) {
    if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      throw error;
    }
    if (decoded === path) throw error;
    return readFileSync(decoded);
  }
}

/** 只改写发布副本中的声明图片，按内容摘要收集站点资源。 */
export class PublishImages {
  private readonly declarations: ContentResourceDeclarations;
  private readonly sources = new Map<string, { path: string } | { reason: string }>();
  private readonly output = new Map<string, Omit<IPublishFile, "hash">>();
  private readonly issues = new Map<string, PublishImageWarning>();

  constructor(
    private readonly basePath: string,
    declarations: ContentResourceDeclarations = {}
  ) {
    this.declarations = mergeContentResources(declarations, BUILTIN_CONTENT_RESOURCES);
  }

  prepare<T extends PublishedData["content"]>(ref: ContentRef, body: T) {
    const dependencies = new Set<string>();
    const referencedMedia = new Set<string>();
    if (!("content" in body) || !Array.isArray(body.content))
      return { content: body, dependencies: [], referencedMedia: [] };
    const title =
      "breadcrumb" in body
        ? body.breadcrumb.map(item => item.label).join(" / ")
        : "title" in body
          ? body.title
          : `卡片 #${ref.id}`;
    const nodes = mapContentResources(body.content, this.declarations, (url, kind) => {
      if (kind !== "image" || !url.trim()) return undefined;
      const source = url.trim();
      const reference = publishedImageReference(source, this.basePath);
      if (reference) {
        referencedMedia.add(reference);
        return undefined;
      }
      let result = this.sources.get(source);
      if (!result) {
        try {
          const localPath = localImagePath(source);
          if (localPath === null) return undefined;
          const extension = extname(localPath)
            .toLowerCase()
            .replace(/^\.jpeg$/, ".jpg");
          if (!IMAGE_EXTENSIONS.has(extension))
            throw new Error("无法识别本地图片格式，请重新选择图片");
          const content = readLocalImage(localPath);
          if (!content.length) throw new Error("本地图片文件为空");
          const hash = createHash("sha256").update(content).digest("hex");
          let file = this.output.get(hash);
          if (!file) {
            file = { path: `_tau/media/${hash}${extension}`, content };
            this.output.set(hash, file);
          }
          result = { path: file.path };
        } catch (error) {
          result = { reason: imageFailure(error) };
        }
        this.sources.set(source, result);
      }
      if ("reason" in result) {
        this.issues.set(JSON.stringify([ref.key, source]), {
          content: ref,
          title,
          url,
          reason: result.reason,
        });
        return undefined;
      }
      dependencies.add(result.path);
      return this.basePath + result.path;
    });
    return {
      content: { ...body, content: nodes },
      dependencies: [...dependencies],
      referencedMedia: [...referencedMedia],
    };
  }

  files() {
    return [...this.output.values()];
  }
  warnings() {
    return [...this.issues.values()];
  }
}
