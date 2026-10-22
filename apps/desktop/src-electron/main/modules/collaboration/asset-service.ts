import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ASSET_PREFIX,
  LOCAL_ASSET_PREFIX,
  isLocalAssetReference,
  isSafeResource,
  type DeviceIdentity,
  type SharedContent,
} from "@tau/collaboration";
import {
  collectContentResources,
  mapContentResources,
  type ContentResourceDeclarations,
} from "@tau/db-schema/content-resources";
import type { CollaborationLocalStore } from "./local-store";

export interface ResourceRow {
  id: string;
  document_id: string;
  name: string;
  mime: string;
  path: string;
  /** PENDING / UPLOADED / LOCAL_ONLY */
  uploaded: number;
}
const PENDING = 0;
const UPLOADED = 1;
/** 仅本机资源：不上传；path 是本机缓存文件或共享前的原始引用 */
const LOCAL_ONLY = 2;
const MAX_BYTES = 25 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "audio/flac": ".flac",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/x-matroska": ".mkv",
  "application/pdf": ".pdf",
};
const EXTENSION_MIMES: Record<string, string> = {
  ...Object.fromEntries(Object.entries(MIME_EXTENSIONS).map(([mime, ext]) => [ext, mime])),
  ".jpeg": "image/jpeg",
};
// 视频体积大，共享时一律不上传服务器
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v", ".mkv", ".avi", ".ogv"]);

export const isVideoFile = (file: { name: string; mime: string }) =>
  file.mime.startsWith("video/") || VIDEO_EXTENSIONS.has(extname(file.name).toLowerCase());

const isUploadableFile = async (path: string) => {
  try {
    const info = await stat(path);
    return info.isFile() && info.size <= MAX_BYTES;
  } catch {
    return false;
  }
};

/** 按文档携带的资源声明改写正文与题图里的资源引用；未声明的字段原样保留 */
async function mapResources(
  value: SharedContent,
  declarations: ContentResourceDeclarations,
  transform: (reference: string) => Promise<string>
): Promise<SharedContent> {
  const mapped = new Map<string, string>();
  for (const { url } of collectContentResources(value.content, declarations))
    mapped.set(url, await transform(url));
  if (value.bannerBg) mapped.set(value.bannerBg, await transform(value.bannerBg));
  return {
    ...value,
    bannerBg: mapped.get(value.bannerBg) ?? value.bannerBg,
    content: mapContentResources(value.content, declarations, url => mapped.get(url)),
  };
}

export class CollaborationAssetService {
  private downloads = new Map<string, Promise<string>>();

  constructor(
    private store: CollaborationLocalStore,
    private appDirectory: string,
    private identity: (url: string) => Promise<DeviceIdentity>
  ) {}

  private localPath(value: string): string | null {
    if (value.startsWith("file:")) return fileURLToPath(value);
    if (value.startsWith("ltoh:///")) return decodeURIComponent(value.slice("ltoh:///".length));
    if (value.startsWith("~/") || value.startsWith("~\\"))
      return join(resolve(this.appDirectory, ".."), value.slice(2));
    if (isAbsolute(value)) return value;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "24678") {
      const path = resolve(this.appDirectory, `.${decodeURIComponent(url.pathname)}`);
      if (!path.startsWith(resolve(this.appDirectory) + sep)) throw new Error("本地资源路径不合法");
      return path;
    }
    return null;
  }

  private record(resource: ResourceRow) {
    this.store.db
      .prepare("INSERT OR REPLACE INTO resources VALUES (?,?,?,?,?,?)")
      .run(
        resource.id,
        resource.document_id,
        resource.name,
        resource.mime,
        resource.path,
        resource.uploaded
      );
  }

  hasPending(documentId: string) {
    return Boolean(
      this.store.db
        .prepare("SELECT 1 FROM resources WHERE document_id=? AND uploaded=? LIMIT 1")
        .get(documentId, PENDING)
    );
  }

  private get cacheDirectory() {
    return join(this.appDirectory, "collaboration", "assets");
  }

  private async cache(
    documentId: string,
    file: { name: string; mime: string; bytes: Uint8Array },
    uploaded: number
  ) {
    const id = randomUUID();
    const directory = join(this.cacheDirectory, documentId);
    await mkdir(directory, { recursive: true });
    // 视频按原扩展名缓存，本机播放依赖扩展名识别格式
    const extension = extname(file.name).toLowerCase();
    const suffix =
      MIME_EXTENSIONS[file.mime] || (VIDEO_EXTENSIONS.has(extension) ? extension : ".bin");
    const path = join(directory, id + suffix);
    await writeFile(path, file.bytes, { mode: 0o600 });
    this.record({
      id,
      document_id: documentId,
      name: basename(file.name),
      mime: file.mime,
      path,
      uploaded,
    });
    return id;
  }

  async enqueue(documentId: string, file: { name: string; mime: string; bytes: Uint8Array }) {
    if (file.bytes.byteLength > MAX_BYTES) throw new Error("文件超过 25 MB");
    return ASSET_PREFIX + (await this.cache(documentId, file, PENDING));
  }

  /** 协作中插入的视频不上传：文件只缓存在本机，文档里放仅本机引用 */
  async keepLocalFile(documentId: string, file: { name: string; mime: string; bytes: Uint8Array }) {
    return LOCAL_ASSET_PREFIX + (await this.cache(documentId, file, LOCAL_ONLY));
  }

  /** 共享前的原始引用只记在本机，文档里换成不透明标识，不泄露本地路径 */
  private keepLocalReference(documentId: string, reference: string) {
    const id = randomUUID();
    this.record({
      id,
      document_id: documentId,
      name: "",
      mime: "",
      path: reference,
      uploaded: LOCAL_ONLY,
    });
    return LOCAL_ASSET_PREFIX + id;
  }

  private async upload(url: string, resource: ResourceRow) {
    const identity = await this.identity(url);
    const bytes = await readFile(resource.path);
    if (bytes.byteLength > MAX_BYTES) throw new Error("资源超过 25 MB");
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: resource.mime }), resource.name);
    const response = await fetch(`${url}/v1/documents/${resource.document_id}/assets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${identity.id}:${identity.secret}`,
        "X-Asset-Id": resource.id,
      },
      body: form,
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error("资源上传失败，请检查网络和资源配额");
    const uploaded = (await response.json()) as { id: string };
    if (uploaded.id !== resource.id) throw new Error("服务器资源标识不匹配");
    this.record({ ...resource, uploaded: UPLOADED });
  }

  /**
   * 发起共享时逐引用调用（会话升级）：可上传的本地资源换资产引用；视频、丢失、超限或
   * 无法识别的本地资源换仅本机引用，不阻止共享；远程地址原样返回。
   */
  async shareReference(url: string, documentId: string, reference: string, field = "") {
    if (reference.startsWith(ASSET_PREFIX) || isLocalAssetReference(reference)) return reference;
    let path: string | null;
    try {
      path = this.localPath(reference);
    } catch {
      return this.keepLocalReference(documentId, reference);
    }
    if (!path)
      return isSafeResource(reference, field)
        ? reference
        : this.keepLocalReference(documentId, reference);
    const extension = extname(path).toLowerCase();
    if (VIDEO_EXTENSIONS.has(extension) || !(await isUploadableFile(path)))
      return this.keepLocalReference(documentId, reference);
    const resource: ResourceRow = {
      id: randomUUID(),
      document_id: documentId,
      name: basename(path),
      mime: EXTENSION_MIMES[extension] || "application/octet-stream",
      path,
      uploaded: PENDING,
    };
    await this.upload(url, resource);
    return ASSET_PREFIX + resource.id;
  }

  async flush(url: string, documentId: string) {
    const resources = this.store.db
      .prepare("SELECT * FROM resources WHERE document_id=? AND uploaded=?")
      .all(documentId, PENDING) as ResourceRow[];
    for (const resource of resources) await this.upload(url, resource);
  }

  /** 资源引用解析为本机文件路径；仅本机引用只在记录它的设备上可解析 */
  async resolveReference(url: string, documentId: string, reference: string) {
    if (reference.startsWith(ASSET_PREFIX))
      return this.resolve(url, documentId, reference.slice(ASSET_PREFIX.length));
    const row = isLocalAssetReference(reference) ? this.localRow(documentId, reference) : undefined;
    let path: string | null = null;
    try {
      path = row ? this.localPath(row.path) : null;
    } catch {
      path = null;
    }
    if (!path || !existsSync(path)) throw new Error("资源仅在分享者本机可用");
    return path;
  }

  private localRow(documentId: string, reference: string) {
    return this.store.db
      .prepare("SELECT * FROM resources WHERE id=? AND document_id=? AND uploaded=?")
      .get(reference.slice(LOCAL_ASSET_PREFIX.length), documentId, LOCAL_ONLY) as
      ResourceRow | undefined;
  }

  resolve(url: string, documentId: string, assetId: string): Promise<string> {
    if (!/^[a-f0-9-]{36}$/.test(assetId)) return Promise.reject(new Error("资源标识不合法"));
    const key = `${url}/${documentId}/${assetId}`;
    let promise = this.downloads.get(key);
    if (!promise) {
      promise = this.download(url, documentId, assetId).finally(() => this.downloads.delete(key));
      this.downloads.set(key, promise);
    }
    return promise;
  }

  private async download(url: string, documentId: string, assetId: string) {
    const cached = this.store.db
      .prepare("SELECT * FROM resources WHERE id=? AND document_id=?")
      .get(assetId, documentId) as ResourceRow | undefined;
    if (cached && existsSync(cached.path)) return cached.path;
    const identity = await this.identity(url);
    const response = await fetch(`${url}/v1/documents/${documentId}/assets/${assetId}`, {
      headers: { Authorization: `Bearer ${identity.id}:${identity.secret}` },
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok || !response.body)
      throw new Error("资源下载失败或访问权限已撤销，请重新发起共享");
    const parts: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.length;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error("资源超过大小限制");
      }
      parts.push(result.value);
    }
    const mime = response.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
    const directory = join(this.cacheDirectory, documentId);
    await mkdir(directory, { recursive: true });
    const path = join(directory, assetId + (MIME_EXTENSIONS[mime] || ".bin"));
    await writeFile(path, Buffer.concat(parts), { mode: 0o600 });
    this.record({
      id: assetId,
      document_id: documentId,
      name: assetId,
      mime,
      path,
      uploaded: UPLOADED,
    });
    return path;
  }

  /**
   * 把单个资源引用取回本机（会话降级逐引用调用）：资产引用下载后转存；仅本机引用还原为
   * 共享前的原始引用，本机找不到记录（其他成员插入的视频）时原样返回，由降级删除该节点；
   * 其余原样返回。
   */
  async localizeReference(url: string, documentId: string, reference: string) {
    if (isLocalAssetReference(reference)) {
      const row = this.localRow(documentId, reference);
      if (!row) return reference;
      return row.path.startsWith(this.cacheDirectory + sep) ? this.persist(row.path) : row.path;
    }
    if (!reference.startsWith(ASSET_PREFIX)) return reference;
    return this.persist(await this.resolve(url, documentId, reference.slice(ASSET_PREFIX.length)));
  }

  /** 协作缓存文件转存到资源目录（按内容去重），会话缓存目录随结束共享清理 */
  private async persist(cached: string) {
    const directory = join(this.appDirectory, "resources", "collaboration");
    await mkdir(directory, { recursive: true });
    const bytes = await readFile(cached);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const target = join(directory, hash + extname(cached));
    if (!existsSync(target)) {
      await copyFile(cached, target);
    }
    return target;
  }

  async localize(
    url: string,
    documentId: string,
    value: SharedContent,
    declarations: ContentResourceDeclarations
  ) {
    return mapResources(value, declarations, reference =>
      this.localizeReference(url, documentId, reference)
    );
  }
}
