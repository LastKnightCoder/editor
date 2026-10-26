import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_COLLABORATION_URL } from "@tau/collaboration";
import { CollaborationClient } from "../client";
import type { CollaborationLocalStore } from "../local-store";

afterEach(() => vi.unstubAllGlobals());
const former = "https://former-service.example.com";
const selfHosted = "https://private-server.example.org";
function fixture(current = false) {
  const source = { id: "source-device", secret: "source-proof", nickname: "原身份" };
  const target = { id: "target-device", secret: "target-proof", nickname: "新身份" };
  const unrelated = { id: "self-hosted", secret: "private-proof", nickname: "自托管" };
  const aliases = { canonical: DEFAULT_COLLABORATION_URL, origins: [former], hashes: [] };
  const values = new Map<string, unknown>([
    ["identity:" + former, JSON.stringify(source)],
    ["identity:" + selfHosted, JSON.stringify(unrelated)],
    ["endpoint-aliases", aliases],
    ...(current
      ? [["identity:" + DEFAULT_COLLABORATION_URL, JSON.stringify(target)] as [string, unknown]]
      : []),
  ]);
  const store = {
    get: (key: string, fallback: unknown) => values.get(key) ?? fallback,
    set: (key: string, value: unknown) => values.set(key, value),
    delete: (key: string) => values.delete(key),
  } as unknown as CollaborationLocalStore;
  return {
    client: new CollaborationClient(store),
    store,
    values,
    source,
    target,
    unrelated,
    aliases,
  };
}

describe("协作服务器身份隔离", () => {
  it("编辑期限按服务器记录 Date，不使用其他地址的响应或客户端墙钟", async () => {
    const value = fixture();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({}, { headers: { Date: "Sun, 25 Oct 2026 00:00:00 GMT" } })
      )
      .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal("fetch", fetcher);
    await value.client.request(former, "/v1/documents/doc/protocol");
    expect(value.client.serverTime(former)).toBe(Date.parse("2026-10-25T00:00:00Z"));
    expect(() => value.client.serverTime(DEFAULT_COLLABORATION_URL)).toThrow("Date");
    await value.client.request(former, "/v1/documents/doc/protocol");
    expect(() => value.client.serverTime(former)).toThrow("Date");
  });

  it("产品入口没有身份时只向该地址注册，并发请求共用一次注册", async () => {
    const value = fixture();
    const fetcher = vi.fn(async () => Response.json(value.target));
    vi.stubGlobal("fetch", fetcher);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => value.client.identity(DEFAULT_COLLABORATION_URL))
    );
    expect(results).toEqual(Array(8).fill(value.target));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toEqual([
      DEFAULT_COLLABORATION_URL + "/v1/devices",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: "Tau 用户" }),
      }),
    ]);
    expect(value.values.get("identity:" + former)).toBe(JSON.stringify(value.source));
    expect(value.values.get("identity:" + selfHosted)).toBe(JSON.stringify(value.unrelated));
    expect(value.values.get("endpoint-aliases")).toEqual(value.aliases);
    expect(await new CollaborationClient(value.store).identity(DEFAULT_COLLABORATION_URL)).toEqual(
      value.target
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("旧地址、产品入口与自托管请求各用自己的凭据，不应用旧别名", async () => {
    const value = fixture(true);
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    const before = [...value.values];
    for (const [url, identity] of [
      [former, value.source],
      [DEFAULT_COLLABORATION_URL, value.target],
      [selfHosted, value.unrelated],
    ] as const) {
      await value.client.request(url, "/v1/documents");
      expect(fetcher).toHaveBeenLastCalledWith(
        url + "/v1/documents",
        expect.objectContaining({
          headers: { Authorization: `Bearer ${identity.id}:${identity.secret}` },
        })
      );
    }
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect([...value.values]).toEqual(before);
  });

  it("注册失败不挪用其他服务器身份，原配置保留且允许重试", async () => {
    const value = fixture();
    const before = [...value.values];
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(Response.json(value.target));
    vi.stubGlobal("fetch", fetcher);
    await expect(value.client.identity(DEFAULT_COLLABORATION_URL)).rejects.toThrow(
      "无法创建协作身份"
    );
    expect([...value.values]).toEqual(before);
    expect(await value.client.identity(DEFAULT_COLLABORATION_URL)).toEqual(value.target);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
