import { describe, expect, it } from "vitest";
import {
  isInvalidLinkUrl,
  isPastedUrl,
  linkDisplayText,
  normalizeLinkUrl,
  splitLinkUrl,
} from "../url";

describe("链接地址规则", () => {
  it("像域名的补 https，带协议、锚点、相对路径原样保留", () => {
    expect(normalizeLinkUrl(" react.dev/learn ")).toBe("https://react.dev/learn");
    expect(normalizeLinkUrl("localhost:3000")).toBe("https://localhost:3000");
    expect(normalizeLinkUrl("http://a.com")).toBe("http://a.com");
    expect(normalizeLinkUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(normalizeLinkUrl("#section")).toBe("#section");
    expect(normalizeLinkUrl("./notes.md")).toBe("./notes.md");
    expect(normalizeLinkUrl("/docs")).toBe("/docs");
    expect(normalizeLinkUrl("   ")).toBe("");
  });

  it("只拦明显错误：空白、漏冒号、斜杠不全、协议拼错", () => {
    for (const bad of [
      "react dev",
      "https//a.com",
      "http//a.com",
      "https:/a.com",
      "htps://a.com",
    ]) {
      expect(isInvalidLinkUrl(bad), bad).toBe(true);
    }
    for (const ok of [
      "",
      "https://a.com",
      "a.com",
      "#x",
      "./a",
      "mailto:a@b.com",
      "tau://card/1",
    ]) {
      expect(isInvalidLinkUrl(ok), ok).toBe(false);
    }
  });

  it("粘贴认领只认单个网址", () => {
    expect(isPastedUrl("https://a.com/x?y=1")).toBe(true);
    expect(isPastedUrl(" www.a.com ")).toBe(true);
    expect(isPastedUrl("看看 https://a.com")).toBe(false);
    expect(isPastedUrl("https://a.com\nhttps://b.com")).toBe(false);
    expect(isPastedUrl("a.com")).toBe(false);
  });

  it("展示文字去掉协议与末尾斜杠，浮层把域名和路径分开", () => {
    expect(linkDisplayText("https://react.dev/learn/")).toBe("react.dev/learn");
    expect(splitLinkUrl("https://www.react.dev/learn?a=1#h")).toEqual({
      host: "react.dev",
      rest: "/learn?a=1#h",
    });
    expect(splitLinkUrl("https://react.dev/")).toEqual({ host: "react.dev", rest: "" });
    expect(splitLinkUrl("#section")).toEqual({ host: "#section", rest: "" });
  });
});
