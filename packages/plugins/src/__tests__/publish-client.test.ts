import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createClient } from "../publish-client";

const digest = (text: string) => createHash("sha256").update(text).digest("hex");
function serve(site: unknown) {
  const body = JSON.stringify({
    version: 1,
    site,
    search: { data: "search.json", integrity: "0".repeat(64) },
    items: [],
  });
  const hash = digest(body);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body))
  );
  return `https://example.com/data/site.${hash}.json`;
}
afterEach(() => vi.unstubAllGlobals());

it("清单站点信息以 fields 承载模板字段，不再要求 description", async () => {
  const url = serve({ title: "博客", basePath: "/", fields: { description: "记录", dark: true } });
  const manifest = await createClient({ manifestUrl: url }).readManifest();
  expect(manifest.site.fields).toEqual({ description: "记录", dark: true });
});

it.each([
  [{ title: "博客", basePath: "/" }],
  [{ title: "博客", basePath: "/", fields: { count: 1 } }],
])("站点字段缺失或类型错误时拒绝清单 %#", async site => {
  await expect(createClient({ manifestUrl: serve(site) }).readManifest()).rejects.toThrow(
    "站点数据缺失"
  );
});
