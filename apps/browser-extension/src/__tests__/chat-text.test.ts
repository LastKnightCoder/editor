import { describe, expect, it } from "vitest";
import { composeUserText, splitQuote } from "../content/state/chat";
import { linkCites } from "../content/ui/Markdown";
import { splitShadowCss } from "../content/mount";
import { describeClient } from "../background/client-info";

describe("对话文本", () => {
  it("引用原文以引用块放在问题前，展示时再拆开", () => {
    const text = composeUserText("这是什么意思？", { text: "第一行\n第二行", block: 3 });
    expect(text).toBe("> 第一行\n> 第二行\n>\n> （第 3 段）\n\n这是什么意思？");
    expect(splitQuote(text)).toEqual({ quote: "第一行\n第二行", body: "这是什么意思？" });
    expect(splitQuote("没有引用")).toEqual({ quote: null, body: "没有引用" });
  });

  it("[n] 变成可点的段落引用，已有链接和脚注不动", () => {
    expect(linkCites("结论 [2][3]")).toBe("结论 [2](#tau-cite-2)[3](#tau-cite-3)");
    expect(linkCites("[1](https://x.com) 和 [^1] 与 [4]: 定义")).toBe(
      "[1](https://x.com) 和 [^1] 与 [4]: 定义"
    );
  });
});

describe("shadow 样式改写", () => {
  it(":root 改 :host，rem 换 px，@property 与 @font-face 拆到页面文档，字体只留 woff2 并改写地址", () => {
    const { shadow, document } = splitShadowCss(
      ':root{--a:1rem}.x{padding:.5rem}@property --tw-x{syntax:"*";inherits:false}' +
        '@font-face{font-family:KaTeX_Main;src:url(fonts/KaTeX_Main-Regular.woff2) format("woff2"),url(fonts/KaTeX_Main-Regular.woff) format("woff");font-weight:400}',
      file => `chrome-extension://x/katex/fonts/${file}`
    );
    expect(shadow).toBe(":host{--a:16px}.x{padding:8px}");
    expect(document).toContain("@property --tw-x");
    expect(document).toContain(
      'src:url(chrome-extension://x/katex/fonts/KaTeX_Main-Regular.woff2) format("woff2");font-weight:400'
    );
  });
});

describe("describeClient", () => {
  it("识别常见浏览器与系统", () => {
    const mac =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36";
    expect(describeClient(mac, undefined, "0.1.0")).toEqual({
      browser: "Chrome",
      os: "macOS",
      version: "0.1.0",
    });
    expect(describeClient(`${mac} Edg/131`, undefined, "1").browser).toBe("Edge");
    expect(
      describeClient("Mozilla/5.0 (Windows NT 10.0) Gecko/20100101 Firefox/133", undefined, "1")
    ).toMatchObject({
      browser: "Firefox",
      os: "Windows",
    });
  });
});
