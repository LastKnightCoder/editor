// @vitest-environment node
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  readSnapshotHead,
  publishSnapshot,
  SYNC_MODEL_VERSION,
} from "@tau/db-schema/sync-protocol";
import { loadAuditCandidate } from "./load-candidate";
import type { SyncProviderDefinition } from "@tau/plugins/sync";

vi.mock("electron", () => ({ ipcMain: {} }));
vi.mock("@/commands", async () => {
  const { default: service } = await import("../../src-electron/main/modules/s3");
  return {
    s3Upload: (input: Parameters<typeof service.upload>[0]) => service.upload(input),
    s3ListObjects: (input: Parameters<typeof service.listObjects>[0]) => service.listObjects(input),
  };
});
const candidateFile = process.env.TAU_SYNC_CANDIDATE;
describe.skipIf(!candidateFile)("指定作者产物的新旧S3对照", () => {
  let server: Server, endpoint: string, candidate: SyncProviderDefinition;
  let mode: "normal" | "unsupported" | "response-lost" = "normal";
  const objects = new Map<string, Buffer>();
  beforeEach(async () => {
    if (!candidateFile) throw new Error("需要指定作者构建产物");
    candidate = await loadAuditCandidate(candidateFile);
    objects.clear();
    mode = "normal";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost"),
        key = url.pathname.replace(/^\/bucket\//, "");
      const fail = (status: number, code: string) => {
        res.writeHead(status, { "Content-Type": "application/xml" });
        res.end("<Error><Code>" + code + "</Code><Message>test</Message></Error>");
      };
      if (req.method === "PUT") {
        if (!req.headers.authorization) return fail(403, "AccessDenied");
        const chunks: Buffer[] = [];
        for await (const part of req) chunks.push(Buffer.from(part));
        const conditional = req.headers["if-none-match"] === "*";
        if (conditional && mode === "unsupported") return fail(400, "NotImplemented");
        if (conditional && objects.has(key)) return fail(412, "PreconditionFailed");
        objects.set(key, Buffer.concat(chunks));
        if (conditional && mode === "response-lost") return fail(400, "RequestTimeout");
        res.setHeader("ETag", '"test"');
        return res.end();
      }
      const data = objects.get(key);
      if (!data) return fail(404, "NoSuchKey");
      res.setHeader("Content-Length", data.length);
      res.setHeader("ETag", '"test"');
      res.end(req.method === "HEAD" ? undefined : data);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server");
    endpoint = "http://127.0.0.1:" + address.port;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
    vi.restoreAllMocks();
  });
  function providers() {
    const config = {
      endpoint,
      bucket: "bucket",
      region: "test-region",
      accessKeyId: "test-only",
      secretAccessKey: "test-only",
      urlStyle: "path" as const,
    };
    return [["candidate", candidate.create({ ...config, pathPrefix: "candidate" })]] as const;
  }
  const next = () => ({
    version: 1,
    parentVersion: 0,
    dataModelVersion: SYNC_MODEL_VERSION,
    commitId: randomUUID(),
    databaseObject: "snapshot.db",
    sessionsObject: "sessions.zip",
  });
  it.each(["normal", "response-lost"] as const)(
    "完整存储提交链路在%s下新旧一致，迟到指针仍能找到提交",
    async scenario => {
      mode = scenario;
      for (const [name, provider] of providers()) {
        const parent = await readSnapshotHead(provider, "head.json");
        const metadata = next(),
          payload = new Uint8Array([1, 2, 3]);
        expect(await provider.uploadFile(metadata.databaseObject, payload)).toBe(true);
        expect(await provider.uploadFile(metadata.sessionsObject, payload)).toBe(true);
        await publishSnapshot(provider, "head.json", parent, metadata);
        expect(await readSnapshotHead(provider, "head.json")).toMatchObject(metadata);
        expect(await provider.downloadFile(metadata.databaseObject)).toEqual(payload);
        objects.set(name + "/head.json", Buffer.from(JSON.stringify({ version: 0 })));
        expect((await readSnapshotHead(provider, "head.json")).version).toBe(1);
        await publishSnapshot(provider, "head.json", parent, metadata);
        await expect(publishSnapshot(provider, "head.json", parent, next())).rejects.toThrow(
          "其他设备"
        );
      }
    }
  );
  it("真实目标的条件创建拒绝场景，新旧都不发布版本且保留已上传对象", async () => {
    mode = "unsupported";
    for (const [, provider] of providers()) {
      const payload = new Uint8Array([1, 2, 3]),
        metadata = next();
      await provider.uploadFile(metadata.databaseObject, payload);
      await provider.uploadFile(metadata.sessionsObject, payload);
      await expect(
        publishSnapshot(provider, "head.json", { version: 0 }, metadata)
      ).rejects.toThrow("无法确认");
      expect((await readSnapshotHead(provider, "head.json")).version).toBe(0);
      expect(await provider.downloadFile(metadata.databaseObject)).toEqual(payload);
    }
  });
});
