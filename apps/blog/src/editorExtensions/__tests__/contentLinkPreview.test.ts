import { describe, expect, it, vi } from "vitest";
import {
  buildContentLinkTargetKey,
  createContentLinkPreviewLoader,
  extractInitDataJson,
  parseInitDataFromHtml,
  resolveContentLinkTarget,
} from "../contentLinkPreview";

describe("blog/contentLinkPreview", () => {
  it("应按 contentType + refId 命中目标链接", () => {
    const target = resolveContentLinkTarget(
      { contentType: "card", refId: 12 },
      {
        "card:12": {
          contentType: "card",
          refId: 12,
          href: "/cards/12.html",
          title: "卡片 12",
        },
      },
    );

    expect(target?.key).toBe("card:12");
    expect(target?.href).toBe("/cards/12.html");
  });

  it("未命中目标时应返回 null", () => {
    const target = resolveContentLinkTarget(
      { contentType: "card", refId: 99 },
      {
        "card:12": {
          contentType: "card",
          refId: 12,
          href: "/cards/12.html",
        },
      },
    );
    expect(target).toBeNull();
  });

  it("应从 html 中提取并解析 _INIT_DATA_", () => {
    const html = `
      <html>
        <head>
          <script>
            window._INIT_DATA_ = {"site":{"title":"站点","description":"","basePath":"/"},"navigation":[],"content":{"id":12,"title":"卡片 12","content":[{"type":"paragraph","children":[{"type":"formatted","text":"hello"}]}]},"meta":{"type":"card","publishTime":1}};
          </script>
        </head>
      </html>
    `;

    const json = extractInitDataJson(html);
    const parsed = parseInitDataFromHtml(html);

    expect(json).toContain('"meta":{"type":"card"');
    expect(parsed?.meta.type).toBe("card");
  });

  it("同一 href 的预览应复用缓存，避免重复请求", async () => {
    const html = `
      <html>
        <script>
          window._INIT_DATA_ = {"site":{"title":"站点","description":"","basePath":"/"},"navigation":[],"content":{"id":12,"title":"卡片 12","content":[{"type":"paragraph","children":[{"type":"formatted","text":"hello"}]}]},"meta":{"type":"card","publishTime":1}};
        </script>
      </html>
    `;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => html,
    });

    const loader = createContentLinkPreviewLoader(fetchMock as any);

    const first = await loader.load("/cards/12.html", "fallback");
    const second = await loader.load("/cards/12.html", "fallback");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.title).toBe("卡片 12");
    expect(second.title).toBe("卡片 12");
  });

  it("解析失败时应抛出异常", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "<html><body>invalid</body></html>",
    });

    const loader = createContentLinkPreviewLoader(fetchMock as any);

    await expect(loader.load("/cards/12.html", "fallback")).rejects.toThrow(
      "PREVIEW_PARSE_FAILED",
    );
  });

  it("key 生成应符合约定", () => {
    expect(buildContentLinkTargetKey("project-item", 301)).toBe(
      "project-item:301",
    );
  });
});
