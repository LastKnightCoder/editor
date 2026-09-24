import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ASSET_PREFIX,
  PRIVATE_BLOCKS,
  RESOURCE_FIELDS,
  type DeviceIdentity,
  type SharedContent,
} from "@tau/collaboration";
import type { CollaborationLocalStore } from "./local-store";

export interface ResourceRow {
  id: string;
  document_id: string;
  name: string;
  mime: string;
  path: string;
  uploaded: number;
}
const MAX_BYTES = 25 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "application/pdf": ".pdf",
};

async function mapResources(
  value: unknown,
  transform: (reference: string) => Promise<string>
): Promise<void> {
  if (Array.isArray(value)) {
    for (const entry of value) await mapResources(entry, transform);
    return;
  }
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if (PRIVATE_BLOCKS.has(String(object.type))) return;
  for (const [key, entry] of Object.entries(object)) {
    if (RESOURCE_FIELDS.has(key) && typeof entry === "string" && entry)
      object[key] = await transform(entry);
    else await mapResources(entry, transform);
  }
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
    if (value.startsWith("~/")) return join(resolve(this.appDirectory, ".."), value.slice(2));
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
        .prepare("SELECT 1 FROM resources WHERE document_id=? AND uploaded=0 LIMIT 1")
        .get(documentId)
    );
  }

  async enqueue(documentId: string, file: { name: string; mime: string; bytes: Uint8Array }) {
    if (file.bytes.byteLength > MAX_BYTES) throw new Error("文件超过 25 MB");
    const id = randomUUID();
    const directory = join(this.appDirectory, "collaboration", "assets", documentId);
    await mkdir(directory, { recursive: true });
    const path = join(directory, id + (MIME_EXTENSIONS[file.mime] || ".bin"));
    await writeFile(path, file.bytes, { mode: 0o600 });
    this.record({
      id,
      document_id: documentId,
      name: basename(file.name),
      mime: file.mime,
      path,
      uploaded: 0,
    });
    return ASSET_PREFIX + id;
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
    this.record({ ...resource, uploaded: 1 });
  }

  async prepare(url: string, documentId: string, value: SharedContent) {
    await mapResources(value, async reference => {
      const path = this.localPath(reference);
      if (!path) return reference;
      if ((await stat(path)).size > MAX_BYTES) throw new Error(`资源超过 25 MB：${basename(path)}`);
      const mime =
        Object.entries(MIME_EXTENSIONS).find(
          ([, extension]) => extension === extname(path).toLowerCase()
        )?.[0] || "application/octet-stream";
      const resource: ResourceRow = {
        id: randomUUID(),
        document_id: documentId,
        name: basename(path),
        mime,
        path,
        uploaded: 0,
      };
      await this.upload(url, resource);
      return ASSET_PREFIX + resource.id;
    });
  }

  async flush(url: string, documentId: string) {
    const resources = this.store.db
      .prepare("SELECT * FROM resources WHERE document_id=? AND uploaded=0")
      .all(documentId) as ResourceRow[];
    for (const resource of resources) await this.upload(url, resource);
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
    const directory = join(this.appDirectory, "collaboration", "assets", documentId);
    await mkdir(directory, { recursive: true });
    const path = join(directory, assetId + (MIME_EXTENSIONS[mime] || ".bin"));
    await writeFile(path, Buffer.concat(parts), { mode: 0o600 });
    this.record({ id: assetId, document_id: documentId, name: assetId, mime, path, uploaded: 1 });
    return path;
  }

  async localize(url: string, documentId: string, value: SharedContent) {
    const local = structuredClone(value);
    await mapResources(local, async reference => {
      if (!reference.startsWith(ASSET_PREFIX)) return reference;
      const cached = await this.resolve(url, documentId, reference.slice(ASSET_PREFIX.length));
      const directory = join(this.appDirectory, "resources", "collaboration");
      await mkdir(directory, { recursive: true });
      const bytes = await readFile(cached);
      const hash = createHash("sha256").update(bytes).digest("hex");
      const target = join(directory, hash + extname(cached));
      if (!existsSync(target)) {
        await copyFile(cached, target);
      }
      return target;
    });
    return local;
  }
}
