import { createHash } from "node:crypto";
import { CollaborationStore, fail } from "./store";

export class AssetOperations {
  private pending = new Map<string, Promise<void>>();
  run<T>(hash: string, action: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(hash) ?? Promise.resolve();
    const task = previous.catch(() => undefined).then(action);
    const released = task.then(
      () => undefined,
      () => undefined
    );
    this.pending.set(hash, released);
    return task.finally(() => {
      if (this.pending.get(hash) === released) this.pending.delete(hash);
    });
  }
}

export async function assetRequest(
  request: Request,
  store: CollaborationStore,
  bucket: R2Bucket,
  documentId: string,
  deviceId: string,
  assetId?: string,
  operations = new AssetOperations()
): Promise<Response> {
  store.authorize(documentId, deviceId, false, request.method === "POST");
  if (request.method === "GET" && assetId) {
    const asset = store.asset(documentId, assetId) ?? fail("NOT_FOUND", "资源不存在", 404);
    const object = await bucket.get("assets/" + asset.hash);
    if (!object) return fail("NOT_FOUND", "资源文件缺失", 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": asset.mime,
        "Content-Length": String(asset.size),
        "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(asset.name),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (request.method !== "POST" || assetId) return fail("NOT_FOUND", "资源接口不存在", 404);
  const declared = Number(request.headers.get("content-length"));
  if (declared > 25 * 1024 * 1024 + 65_536) return fail("FILE_TOO_LARGE", "文件超过上传限制", 413);
  let received = 0;
  const limited = request.body?.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > 25 * 1024 * 1024 + 65_536)
          throw fail("FILE_TOO_LARGE", "文件超过上传限制", 413);
        controller.enqueue(chunk);
      },
    })
  );
  const form = await new Request(request, { body: limited }).formData();
  const values = [...form.values()];
  const file = values.find((value): value is File => typeof value !== "string");
  if (!file || values.length !== 1) return fail("INVALID_FILE", "一次只能上传一个文件");
  if (file.size > 25 * 1024 * 1024) return fail("FILE_TOO_LARGE", "文件超过上传限制", 413);
  const bytes = await file.arrayBuffer();
  const digest = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
  return operations.run(digest, async () => {
    const requestedId = request.headers.get("x-asset-id");
    if (requestedId && !/^[a-f0-9-]{36}$/.test(requestedId))
      return fail("INVALID_ASSET", "资源标识无效");
    const previous = store.assetByHash(documentId, digest);
    if (previous && (!requestedId || previous.id === requestedId)) return Response.json(previous);
    const mime =
      /^(image\/(png|jpeg|gif|webp|avif|svg\+xml)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|application\/pdf)$/.test(
        file.type
      )
        ? file.type
        : "application/octet-stream";
    const row = {
      id: requestedId ?? crypto.randomUUID(),
      document_id: documentId,
      hash: digest,
      name:
        [...file.name]
          .map(char => (char.charCodeAt(0) < 32 || char === "/" || char === "\\" ? "_" : char))
          .join("")
          .slice(0, 200) || "附件",
      mime,
      size: bytes.byteLength,
      created_at: Date.now(),
      last_referenced_at: Date.now(),
    };
    store.ensureCapacity(row.size);
    await bucket.put("assets/" + digest, bytes, {
      sha256: digest,
      httpMetadata: { contentType: mime },
    });
    // R2 等待期间权限可能变化，提交前再次以当前成员关系鉴权。
    store.authorize(documentId, deviceId, false, true);
    try {
      return Response.json(store.insertAsset(row));
    } catch (error) {
      if (!store.hashReferenced(digest)) await bucket.delete("assets/" + digest);
      throw error;
    }
  });
}
