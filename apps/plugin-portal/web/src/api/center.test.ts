import { expect, it, vi } from "vitest";
import { createHttpApi } from "./http";
import { createCenterMock } from "./mock/center";
import { centerHost, centerRelease } from "../../../../../tests/fixtures/plugins/center";
import { centerKeys } from "../features/catalog/center-queries";

it("v2 查询和解析不请求登录或 CSRF；保留取消信号和未检查语义", async () => {
  const fetch = vi.fn(async () => Response.json({ data: { items: [], nextCursor: null } }));
  const api = createHttpApi({ baseUrl: "https://example.invalid", fetch });
  const controller = new AbortController();
  await api.center.queryCatalog({ platform: "all" }, controller.signal);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenLastCalledWith(
    "https://example.invalid/v2/catalog/query",
    expect.objectContaining({
      method: "POST",
      credentials: "include",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    })
  );
  await api.center.resolve("example.counter", { host: centerHost });
  expect(fetch).toHaveBeenLastCalledWith(
    "https://example.invalid/v2/plugins/example.counter/resolve",
    expect.objectContaining({
      body: JSON.stringify({
        host: { ...centerHost, capabilities: ["navigation.v1", "pages.v1"] },
      }),
    })
  );
});
it("真实 v2 故障直接返回错误，不回退 v1 或模拟成功", async () => {
  const fetch = vi.fn(async () =>
    Response.json({ error: { code: "NOT_FOUND", message: "尚未提供" } }, { status: 404 })
  );
  const api = createHttpApi({ baseUrl: "https://example.invalid", fetch });
  await expect(api.center.queryCatalog({ platform: "all" })).rejects.toThrow("尚未提供");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("状态查询限制数量，版本下载固定走 v2 中心地址", async () => {
  const fetch = vi.fn(async (input: RequestInfo | URL) =>
    String(input).endsWith("visitor-session") ? Response.json({ data: {} }) : new Response("zip")
  );
  const api = createHttpApi({ baseUrl: "https://example.invalid", fetch });
  expect(() => api.center.statuses(Array.from({ length: 101 }, (_, i) => String(i)))).toThrow(
    "100"
  );
  expect(() => api.center.getRelease("https://evil.invalid/zip")).toThrow("标识");
  expect(await (await api.center.download("release-1")).text()).toBe("zip");
  expect(fetch).toHaveBeenLastCalledWith(
    "https://example.invalid/v2/releases/release-1/download",
    expect.objectContaining({ credentials: "include" })
  );
});
it("显式模拟目录用共享选版规则，无宿主时不宣称可安装", async () => {
  const api = createCenterMock([centerRelease()]);
  expect((await api.queryCatalog({ platform: "ios" })).platformCounts).toEqual({
    all: 1,
    desktop: 0,
    android: 1,
    ios: 0,
  });
  expect((await api.queryCatalog({ platform: "all" })).items[0]).toMatchObject({
    compatible: null,
    compatibility: { status: "unchecked" },
  });
  expect(
    (await api.queryCatalog({ platform: "android", host: centerHost })).items[0].compatible
      ?.releaseId
  ).toBe("release-1");
  expect((await api.queryCatalog({ platform: "ios" })).items).toEqual([]);
  await expect(api.download("release-1")).rejects.toThrow("不提供可安装 ZIP");
});
it("平台和能力变化隔离查询缓存", () => {
  const input = { platform: "android" as const, host: centerHost };
  expect(centerKeys.catalog(input)).not.toEqual(centerKeys.catalog({ platform: "ios" }));
  expect(centerKeys.catalog(input)).not.toEqual(
    centerKeys.catalog({ ...input, host: { ...centerHost, capabilities: [] } })
  );
  expect(centerKeys.catalog(input)).toEqual(
    centerKeys.catalog({
      ...input,
      host: { ...centerHost, capabilities: [...centerHost.capabilities].reverse() },
    })
  );
});
