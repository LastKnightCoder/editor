// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ fetch: vi.fn<(url: string) => Promise<Response>>() }));
vi.mock("electron", () => ({ net: { fetch: mock.fetch } }));

import { downloadPluginRelease, fetchPluginCatalog, fetchPluginRelease } from "../plugin-center";

const API = "https://plugins-api.taunote.app";
const bytes = Buffer.from("zip-bytes");
const release = {
  id: "r1",
  pluginId: "test.center",
  version: "1.0.0",
  state: "published",
  size: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
function serve(overrides: Partial<typeof release> = {}, body: Buffer = bytes) {
  mock.fetch.mockImplementation(async (url: string) => {
    return url.endsWith("/download")
      ? new Response(body)
      : Response.json({ data: { ...release, ...overrides } });
  });
}
beforeEach(() => {
  mock.fetch.mockReset();
});

it("目录携带客户端版本与搜索词，错误透传门户信息", async () => {
  mock.fetch.mockResolvedValueOnce(Response.json({ data: { items: [] } }));
  await fetchPluginCatalog("0.59.0", " 阅读 ");
  expect(mock.fetch).toHaveBeenCalledWith(
    `${API}/v1/catalog?appVersion=0.59.0&q=${encodeURIComponent("阅读")}`
  );
  mock.fetch.mockResolvedValueOnce(
    Response.json({ error: { message: "appVersion必须是有效的客户端版本号" } }, { status: 400 })
  );
  await expect(fetchPluginCatalog("x")).rejects.toThrow("appVersion");
  mock.fetch.mockRejectedValueOnce(new TypeError("offline"));
  await expect(fetchPluginCatalog("0.59.0")).rejects.toThrow("连不上插件中心");
  await expect(fetchPluginRelease("../admin")).rejects.toThrow("无效");
});

it("下载按发布记录核对大小与摘要，地址由服务拼接", async () => {
  serve();
  const result = await downloadPluginRelease("r1");
  expect(result.bytes.equals(bytes)).toBe(true);
  expect(result.source).toEqual({
    kind: "center",
    releaseId: "r1",
    pluginId: "test.center",
    version: "1.0.0",
    sha256: release.sha256,
  });
  expect(mock.fetch).toHaveBeenLastCalledWith(`${API}/v1/releases/r1/download`);
  serve({}, Buffer.from("tampered!"));
  await expect(downloadPluginRelease("r1")).rejects.toThrow("摘要不匹配");
  serve({ size: 9 * 1024 * 1024 });
  await expect(downloadPluginRelease("r1")).rejects.toThrow("上限");
  serve({ state: "failed" });
  await expect(downloadPluginRelease("r1")).rejects.toThrow("尚未发布");
});
