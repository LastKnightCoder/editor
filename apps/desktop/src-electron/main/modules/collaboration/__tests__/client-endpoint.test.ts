import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { DEFAULT_COLLABORATION_URL } from "@tau/collaboration";
import { CollaborationClient } from "../client";
import type { CollaborationLocalStore } from "../local-store";

afterEach(() => vi.unstubAllGlobals());
const legacy = "https://former-service.example.com",
  selfHosted = "https://private-server.example.org";
function fixture(canonical = false) {
  const source = { id: "source-device", secret: "source-proof", nickname: "原身份" };
  const target = { id: "target-device", secret: "target-proof", nickname: "新身份" };
  const unrelated = { id: "self-hosted", secret: "private-proof", nickname: "自托管" };
  const values = new Map<string, unknown>([
    ["identity:" + legacy, JSON.stringify(source)],
    ["identity:" + selfHosted, JSON.stringify(unrelated)],
    ...(canonical
      ? [["identity:" + DEFAULT_COLLABORATION_URL, JSON.stringify(target)] as [string, unknown]]
      : []),
  ]);
  const store = {
    get: (key: string, fallback: unknown) => values.get(key) ?? fallback,
    set: (key: string, value: unknown) => values.set(key, value),
    delete: (key: string) => values.delete(key),
    identityEntries: () =>
      [...values.entries()]
        .filter(([key]) => key.startsWith("identity:"))
        .map(([key, value]) => [key.slice(9), value]),
  } as unknown as CollaborationLocalStore;
  return { client: new CollaborationClient(store), store, values, source, target };
}
describe("产品协作端点身份升级", () => {
  it("编辑期限读取服务端 Date，不使用客户端墙钟", async () => {
    const value = fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({}, { headers: { Date: "Sun, 25 Oct 2026 00:00:00 GMT" } }))
    );
    await value.client.request(legacy, "/v1/documents/doc/protocol");
    expect(value.client.serverTime(legacy)).toBe(Date.parse("2026-10-25T00:00:00Z"));
    expect(() => value.client.serverTime(selfHosted)).toThrow("Date");
  });
  it("本机初始化可延迟网络检查，远程首次使用时再升级", async () => {
    const value = fixture();
    const fetcher = vi.fn(async () =>
      Response.json({
        canonicalUrl: DEFAULT_COLLABORATION_URL,
        legacyOriginHashes: [createHash("sha256").update(legacy).digest("hex")],
      })
    );
    vi.stubGlobal("fetch", fetcher);
    await value.client.migrateOfficialEndpoint(true);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await value.client.identity(DEFAULT_COLLABORATION_URL)).toEqual(value.source);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("仅迁移经产品端点认可的旧来源，不发送自托管凭据", async () => {
    const value = fixture();
    const fetcher = vi.fn(async () =>
      Response.json({
        canonicalUrl: DEFAULT_COLLABORATION_URL,
        legacyOriginHashes: [createHash("sha256").update(legacy).digest("hex")],
      })
    );
    vi.stubGlobal("fetch", fetcher);
    await value.client.migrateOfficialEndpoint();
    expect(await value.client.identity(DEFAULT_COLLABORATION_URL)).toEqual(value.source);
    expect(value.client.canonicalUrl(legacy)).toBe(DEFAULT_COLLABORATION_URL);
    expect(value.client.canonicalUrl(selfHosted)).toBe(selfHosted);
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockClear();
    await new CollaborationClient(value.store).migrateOfficialEndpoint();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("两个来源已有不同身份时提交双凭据证明，失败不落盘", async () => {
    const value = fixture(true);
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/health/ready"))
        return Response.json({
          canonicalUrl: DEFAULT_COLLABORATION_URL,
          legacyOriginHashes: [createHash("sha256").update(legacy).digest("hex")],
        });
      expect(url).toBe(DEFAULT_COLLABORATION_URL + "/v1/devices/merge");
      expect(JSON.parse(String(init?.body))).toEqual({
        sourceId: value.source.id,
        sourceSecret: value.source.secret,
      });
      return Response.json({ message: "暂时不可用" }, { status: 503 });
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(value.client.migrateOfficialEndpoint()).rejects.toThrow("身份升级失败");
    expect(value.values.has("endpoint-aliases")).toBe(false);
    expect(JSON.parse(String(value.values.get("identity:" + legacy)))).toEqual(value.source);
  });
});
