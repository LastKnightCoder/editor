// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  fetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(),
  visitor: vi.fn(async () => ({ Authorization: "Bearer test-visitor" })),
}));
vi.mock("electron", () => ({ net: { fetch: mock.fetch } }));
vi.mock("../plugin-center-visitor", () => ({
  visitorHeaders: mock.visitor,
}));

import {
  downloadPluginRelease,
  fetchPluginCatalog,
  fetchPluginRelease,
  fetchPluginVersions,
  fetchPluginCommunity,
  setPluginLiked,
  addPluginComment,
  deletePluginComment,
} from "../plugin-center";

const API = "https://plugins-api.taunote.app";

it("主进程按服务器排序翻页并去重，不遗漏更新查询所需的目录", async () => {
  mock.fetch
    .mockResolvedValueOnce(
      Response.json({ data: { items: [{ pluginId: "a" }], nextCursor: "next" } })
    )
    .mockResolvedValueOnce(
      Response.json({ data: { items: [{ pluginId: "a" }, { pluginId: "b" }], nextCursor: null } })
    );
  expect(
    (await fetchPluginCatalog("0.59.0", "", "downloadsTotal")).items.map(item => item.pluginId)
  ).toEqual(["a", "b"]);
  expect(mock.fetch).toHaveBeenLastCalledWith(
    `${API}/v1/catalog?appVersion=0.59.0&sort=downloadsTotal&cursor=next`
  );
});
const bytes = Buffer.from("zip-bytes");
const release = {
  id: "r1",
  pluginId: "test.center",
  version: "1.0.0",
  state: "published",
  size: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  content: { manifest: { name: "中心插件", description: "说明", minAppVersion: "0.59.0" } },
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
  mock.visitor.mockReset().mockResolvedValue({ Authorization: "Bearer test-visitor" });
});

it("社区请求由主进程携带匿名身份，分页按需读取，写入保留请求ID", async () => {
  mock.fetch.mockImplementation(async () =>
    Response.json({ data: { likes: 2, liked: true, comments: [], nextCursor: null } })
  );
  expect(await fetchPluginCommunity("test.center", "next-page")).toMatchObject({ likes: 2 });
  expect(mock.visitor).toHaveBeenCalledWith(API, true);
  expect(mock.fetch).toHaveBeenLastCalledWith(
    `${API}/v1/plugins/test.center/community?cursor=next-page`,
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer test-visitor" }),
    })
  );
  await setPluginLiked("test.center", true);
  expect(mock.fetch).toHaveBeenLastCalledWith(
    `${API}/v1/plugins/test.center/like`,
    expect.objectContaining({ method: "PUT", body: '{"liked":true}' })
  );
  const requestId = "request-1234567890";
  await addPluginComment("test.center", " 使用体验 ", requestId);
  expect(mock.fetch).toHaveBeenLastCalledWith(
    `${API}/v1/plugins/test.center/comments`,
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ message: "使用体验", clientRequestId: requestId }),
    })
  );
  await deletePluginComment("test.center", "comment-1");
  expect(mock.fetch).toHaveBeenLastCalledWith(
    `${API}/v1/plugins/test.center/comments/comment-1`,
    expect.objectContaining({ method: "DELETE" })
  );
});

it("身份失败阻断社区请求，非法路径不出网；网络写入失败提示结果未知", async () => {
  mock.visitor.mockRejectedValueOnce(new Error("身份不可用"));
  await expect(setPluginLiked("test.center", true)).rejects.toThrow("身份不可用");
  expect(mock.fetch).not.toHaveBeenCalled();
  await expect(fetchPluginCommunity("../admin")).rejects.toThrow("无效");
  expect(() => deletePluginComment("test.center", "../x")).toThrow("无效");
  expect(() => addPluginComment("test.center", " ", "request-1234567890")).toThrow("评论");
  mock.fetch.mockRejectedValueOnce(new Error("offline"));
  await expect(setPluginLiked("test.center", true)).rejects.toThrow("结果未知");
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

it("版本列表翻页读全，按版本号倒序并标出客户端可用性", async () => {
  const item = (id: string, version: string, minAppVersion = "0.59.0") => ({
    id,
    version,
    publishedAt: "2026-10-17T00:00:00.000Z",
    manifest: { minAppVersion },
  });
  mock.fetch
    .mockResolvedValueOnce(
      Response.json({ data: { items: [item("a", "1.0.3", "0.60.0")], nextCursor: "c1" } })
    )
    .mockResolvedValueOnce(
      Response.json({ data: { items: [item("b", "1.0.1"), item("c", "1.0.2")], nextCursor: null } })
    );
  const versions = await fetchPluginVersions("0.59.0", "weread");
  expect(mock.fetch).toHaveBeenNthCalledWith(1, `${API}/v1/releases?pluginId=weread`);
  expect(mock.fetch).toHaveBeenNthCalledWith(2, `${API}/v1/releases?pluginId=weread&cursor=c1`);
  expect(versions.map(v => [v.version, v.compatible])).toEqual([
    ["1.0.3", false],
    ["1.0.2", true],
    ["1.0.1", true],
  ]);
  await expect(fetchPluginVersions("0.59.0", "../x")).rejects.toThrow("无效");
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
    systemReviewed: false,
  });
  expect(mock.fetch).toHaveBeenLastCalledWith(`${API}/v1/releases/r1/download`, {
    headers: { Authorization: "Bearer test-visitor" },
  });
  serve({}, Buffer.from("tampered!"));
  await expect(downloadPluginRelease("r1")).rejects.toThrow("摘要不匹配");
  serve({ size: 17 * 1024 * 1024 });
  await expect(downloadPluginRelease("r1")).rejects.toThrow("上限");
  serve({ state: "failed" });
  await expect(downloadPluginRelease("r1")).rejects.toThrow("尚未发布");
});

it("后台版本未经审核不下载，已审核版本来源保留审核绑定，撤回版本拒绝", async () => {
  const native = {
    ...release,
    content: { manifest: { ...release.content.manifest, backend: { entry: "backend.js" } } },
  };
  mock.fetch.mockResolvedValueOnce(Response.json({ data: native }));
  await expect(downloadPluginRelease("r1")).rejects.toThrow("审核");
  expect(mock.fetch).toHaveBeenCalledTimes(1);
  mock.fetch
    .mockResolvedValueOnce(Response.json({ data: { ...native, systemReviewed: true } }))
    .mockResolvedValueOnce(new Response(bytes));
  expect((await downloadPluginRelease("r1")).source).toMatchObject({
    releaseId: "r1",
    sha256: release.sha256,
    systemReviewed: true,
  });
  mock.fetch.mockResolvedValueOnce(
    Response.json({ data: { ...native, systemReviewed: true, revokedAt: "2026-10-20T00:00:00Z" } })
  );
  await expect(downloadPluginRelease("r1")).rejects.toThrow("撤回");
});
