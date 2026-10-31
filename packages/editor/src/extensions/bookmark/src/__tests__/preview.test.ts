import { describe, expect, it, vi } from "vitest";
import { decodeHtml, downloadImage, parseLinkPreview, readLinkPreview } from "../preview";

const page = (head: string) => `<!doctype html><html><head>${head}</head><body>正文</body></html>`;

describe("parseLinkPreview", () => {
  it("优先取 Open Graph，相对地址按页面地址补全", () => {
    const preview = parseLinkPreview(
      page(`
        <title>页面标题</title>
        <meta property="og:title" content="分享标题">
        <meta name="description" content="普通描述">
        <meta property="og:description" content="分享描述">
        <meta property="og:site_name" content="少数派">
        <meta property="og:image" content="/cover.png">
        <link rel="icon" href="favicon-32.png">
        <link rel="apple-touch-icon" href="/touch.png">`),
      "https://sspai.com/post/1"
    );
    expect(preview).toEqual({
      url: "https://sspai.com/post/1",
      title: "分享标题",
      description: "分享描述",
      siteName: "少数派",
      image: "https://sspai.com/cover.png",
      icon: "https://sspai.com/touch.png",
    });
  });

  it("没有 og 时退回 twitter、title 与 meta description，图标默认 /favicon.ico", () => {
    const preview = parseLinkPreview(
      page(`<title> 文档 </title><meta name="description" content="说明">
        <meta name="twitter:image" content="https://cdn.example.com/a.jpg">`),
      "https://example.com/docs/a"
    );
    expect(preview.title).toBe("文档");
    expect(preview.description).toBe("说明");
    expect(preview.image).toBe("https://cdn.example.com/a.jpg");
    expect(preview.icon).toBe("https://example.com/favicon.ico");
    expect(preview.siteName).toBeUndefined();
  });

  it("拦截页的标题、描述与封面都不采用", () => {
    const preview = parseLinkPreview(
      page(`<title>安全验证</title><meta property="og:image" content="/x.png">`),
      "https://example.com/"
    );
    expect(preview.title).toBeUndefined();
    expect(preview.image).toBeUndefined();
  });

  it("忽略非 http(s) 的封面地址", () => {
    const preview = parseLinkPreview(
      page(`<meta property="og:image" content="javascript:alert(1)">`),
      "https://example.com/"
    );
    expect(preview.image).toBeUndefined();
  });
});

describe("decodeHtml", () => {
  it("按 meta charset 解码 GBK 页面", () => {
    // 「中文」的 GBK 编码
    const bytes = new Uint8Array([
      ...new TextEncoder().encode('<meta charset="gbk"><title>'),
      0xd6,
      0xd0,
      0xce,
      0xc4,
      ...new TextEncoder().encode("</title>"),
    ]);
    expect(decodeHtml(bytes, "text/html")).toContain("<title>中文</title>");
  });

  it("Content-Type 声明的编码优先", () => {
    const bytes = new TextEncoder().encode("<title>标题</title>");
    expect(decodeHtml(bytes, "text/html; charset=utf-8")).toBe("<title>标题</title>");
  });
});

describe("readLinkPreview", () => {
  it("用最终地址解析，非 HTML 与失败返回 null", async () => {
    const html = new Response(page(`<meta property="og:image" content="c.png">`), {
      headers: { "content-type": "text/html" },
    });
    Object.defineProperty(html, "url", { value: "https://b.com/x/" });
    const fetcher = vi.fn().mockResolvedValueOnce(html) as unknown as typeof fetch;
    await expect(readLinkPreview(fetcher, "https://a.com")).resolves.toMatchObject({
      url: "https://b.com/x/",
      image: "https://b.com/x/c.png",
    });

    const pdf = vi
      .fn()
      .mockResolvedValue(new Response("%PDF", { headers: { "content-type": "application/pdf" } }));
    await expect(
      readLinkPreview(pdf as unknown as typeof fetch, "https://a.com/a.pdf")
    ).resolves.toBeNull();

    const broken = vi.fn().mockRejectedValue(new TypeError("network")) as unknown as typeof fetch;
    await expect(readLinkPreview(broken, "https://a.com")).resolves.toBeNull();
  });

  it("调用方取消时抛出", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(
      readLinkPreview(fetcher as unknown as typeof fetch, "https://a.com", controller.signal)
    ).rejects.toThrow();
  });
});

describe("downloadImage", () => {
  it("按 Content-Type 命名，非图片返回 null", async () => {
    const image = vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } })
      );
    const file = await downloadImage(image as unknown as typeof fetch, "https://a.com/x", "cover");
    expect(file?.name).toBe("cover.png");
    expect(file?.type).toBe("image/png");

    const html = vi
      .fn()
      .mockResolvedValue(new Response("<html>", { headers: { "content-type": "text/html" } }));
    await expect(
      downloadImage(html as unknown as typeof fetch, "https://a.com", "cover")
    ).resolves.toBeNull();
  });
});
