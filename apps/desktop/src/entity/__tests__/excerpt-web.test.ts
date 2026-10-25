import { describe, expect, it } from "vitest";
import { normalizeWebPageUrl, parseWebPagePayload, WEB_PAGE_LIMITS } from "../excerpt/web";

const anchor = {
  quote: { exact: "原文", prefix: "前", suffix: "后" },
  position: { start: 3, end: 5 },
};

const item = (id: string, text = "原文", extra: Record<string, unknown> = {}) => ({
  id,
  text,
  note: "想法",
  color: "green",
  createdAt: 5,
  anchor,
  ...extra,
});

describe("parseWebPagePayload", () => {
  it("只收 http(s)，去掉 hash", () => {
    expect(normalizeWebPageUrl("https://a.com/x?q=1#top")).toBe("https://a.com/x?q=1");
    expect(normalizeWebPageUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeWebPageUrl("file:///etc/passwd")).toBeNull();
  });

  it("转成摘录输入；空原文跳过", () => {
    const result = parseWebPagePayload({
      url: "https://a.com/x",
      title: "标题",
      items: [item("h1"), item("h2", "  ")],
    });
    expect(result.url).toBe("https://a.com/x");
    expect(result.inputs).toEqual([
      {
        externalId: "h1",
        quote: "原文",
        note: "想法",
        location: "",
        url: "https://a.com/x#tau-hl=h1",
        anchor,
        color: "green",
        sourceTime: 5,
      },
    ]);
  });

  it("锚点结构不对时存空锚点，不整页拒绝", () => {
    const result = parseWebPagePayload({
      url: "https://a.com",
      items: [item("h", "原文", { anchor: { startXPath: "/p" } })],
    });
    expect(result.inputs[0].anchor).toBeNull();
  });

  it("非法参数整页拒绝", () => {
    expect(() => parseWebPagePayload(null)).toThrow();
    expect(() => parseWebPagePayload({ url: "ftp://a", items: [] })).toThrow();
    expect(() => parseWebPagePayload({ url: "https://a.com", items: [{ id: 1 }] })).toThrow();
    expect(() =>
      parseWebPagePayload({ url: "https://a.com", items: [item("h", "x", { color: "pink" })] })
    ).toThrow();
    expect(() =>
      parseWebPagePayload({
        url: "https://a.com",
        items: [item("h", "x".repeat(WEB_PAGE_LIMITS.quoteChars + 1))],
      })
    ).toThrow();
    expect(() =>
      parseWebPagePayload({
        url: "https://a.com",
        items: Array.from({ length: WEB_PAGE_LIMITS.highlights + 1 }, (_, i) => item(String(i))),
      })
    ).toThrow();
  });
});
