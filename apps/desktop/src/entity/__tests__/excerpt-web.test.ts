import { describe, expect, it } from "vitest";
import { normalizeWebPageUrl, parseWebPagePayload, WEB_PAGE_LIMITS } from "../excerpt/web";

const highlight = (id: string, text = "原文") => ({
  id,
  text,
  note: "想法",
  color: "pink",
  createdAt: 5,
  anchor: { startXPath: "/p", startOffset: 0, endXPath: "/p", endOffset: 2 },
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
      highlights: [highlight("h1"), highlight("h2", "  ")],
    });
    expect(result.url).toBe("https://a.com/x");
    expect(result.inputs).toEqual([
      {
        externalId: "h1",
        quote: "原文",
        note: "想法",
        location: "",
        url: "https://a.com/x#tau-hl=h1",
        anchor: { startXPath: "/p", startOffset: 0, endXPath: "/p", endOffset: 2 },
        color: "pink",
        sourceTime: 5,
      },
    ]);
  });

  it("非法参数整页拒绝", () => {
    expect(() => parseWebPagePayload(null)).toThrow();
    expect(() => parseWebPagePayload({ url: "ftp://a", highlights: [] })).toThrow();
    expect(() => parseWebPagePayload({ url: "https://a.com", highlights: [{ id: 1 }] })).toThrow();
    expect(() =>
      parseWebPagePayload({
        url: "https://a.com",
        highlights: [highlight("h", "x".repeat(WEB_PAGE_LIMITS.quoteChars + 1))],
      })
    ).toThrow();
    expect(() =>
      parseWebPagePayload({
        url: "https://a.com",
        highlights: Array.from({ length: WEB_PAGE_LIMITS.highlights + 1 }, (_, i) =>
          highlight(String(i))
        ),
      })
    ).toThrow();
  });
});
