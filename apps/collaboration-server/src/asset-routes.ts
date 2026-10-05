import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { CollaborationError } from "@tau/collaboration";
import type { CollaborationStore } from "./store";
import type { ServerConfig } from "./config";
const params = (request: FastifyRequest) => request.params as Record<string, string>;
export function registerAssetRoutes(
  app: FastifyInstance,
  store: CollaborationStore,
  config: ServerConfig,
  device: (request: FastifyRequest) => ReturnType<CollaborationStore["authenticate"]>
) {
  app.post("/v1/documents/:id/assets", async request => {
    const identity = device(request);
    const id = params(request).id;
    store.authorize(id, identity.id, false, true);
    const file = await request.file();
    if (!file) throw new CollaborationError("INVALID_FILE", "请选择文件");
    const temporary = join(config.dataDir, "tmp", randomUUID());
    const hash = createHash("sha256");
    let size = 0;
    try {
      store.ensureCapacity(config.maxAssetBytes);
      await pipeline(
        file.file,
        new Transform({
          transform(chunk, _encoding, callback) {
            size += chunk.length;
            hash.update(chunk);
            callback(null, chunk);
          },
        }),
        createWriteStream(temporary, { mode: 0o600, flags: "wx" })
      );
      if (file.file.truncated)
        throw new CollaborationError("FILE_TOO_LARGE", "文件超过上传限制", 413);
      const digest = hash.digest("hex");
      return store.db.transaction(() => {
        store.authorize(id, identity.id, false, true);
        const requestedId = request.headers["x-asset-id"];
        if (
          requestedId !== undefined &&
          (typeof requestedId !== "string" || !/^[a-f0-9-]{36}$/.test(requestedId))
        )
          throw new CollaborationError("INVALID_ASSET", "资源标识不合法");
        const previous = store.db
          .prepare("SELECT id,name,mime,size FROM assets WHERE document_id=? AND hash=?")
          .get(id, digest) as { id: string } | undefined;
        if (previous && (!requestedId || previous.id === requestedId)) return previous;
        if (requestedId && store.db.prepare("SELECT 1 FROM assets WHERE id=?").get(requestedId))
          throw new CollaborationError("ASSET_CONFLICT", "资源标识已被使用", 409);
        const total = (
          store.db
            .prepare("SELECT coalesce(sum(size),0) AS bytes FROM assets WHERE document_id=?")
            .get(id) as { bytes: number }
        ).bytes;
        if (total + size > config.maxDocumentAssetBytes)
          throw new CollaborationError("ASSET_LIMIT", "文章资源配额已用尽", 413);
        store.ensureCapacity(size);
        const assetId = requestedId || randomUUID();
        const name =
          [...file.filename]
            .map(character =>
              character.charCodeAt(0) < 32 || character === "/" || character === "\\"
                ? "_"
                : character
            )
            .join("")
            .slice(0, 200) || "附件";
        const mime =
          /^(image\/(png|jpeg|gif|webp|avif|svg\+xml)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|application\/pdf)$/.test(
            file.mimetype
          )
            ? file.mimetype
            : "application/octet-stream";
        const target = join(config.dataDir, "assets", digest);
        if (!existsSync(target)) renameSync(temporary, target);
        store.insertAsset(id, assetId, digest, name, mime, size);
        return { id: assetId, name, mime, size };
      })();
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  });
  app.get("/v1/documents/:id/assets/:assetId", async (request, reply) => {
    const { id, assetId } = params(request);
    store.authorize(id, device(request).id);
    const asset = store.db
      .prepare("SELECT * FROM assets WHERE document_id=? AND id=?")
      .get(id, assetId) as { hash: string; mime: string; name: string; size: number } | undefined;
    if (!asset) throw new CollaborationError("NOT_FOUND", "资源不存在", 404);
    const path = join(config.dataDir, "assets", asset.hash);
    if (!existsSync(path)) throw new CollaborationError("NOT_FOUND", "资源文件缺失", 404);
    return reply
      .type(asset.mime)
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "private, no-store")
      .header("Content-Length", asset.size)
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`
      )
      .send(createReadStream(path));
  });
}
