import { describe, expect, it } from "vitest";
import {
  buildScopedToolbarDisableKey,
  getToolbarDisableScopeFromUrl,
} from "../toolbarDisableScope";

describe("toolbarDisableScope", () => {
  it("按 hostname 生成域名作用域", () => {
    expect(
      getToolbarDisableScopeFromUrl("https://Docs.Example.com/article?id=1"),
    ).toBe("docs.example.com");
  });

  it("忽略端口，让同域 localhost 共用禁用状态", () => {
    expect(getToolbarDisableScopeFromUrl("http://localhost:3000/page")).toBe(
      "localhost",
    );
    expect(getToolbarDisableScopeFromUrl("http://localhost:5173/other")).toBe(
      "localhost",
    );
  });

  it("file url 在没有 hostname 时回退到协议作用域", () => {
    expect(getToolbarDisableScopeFromUrl("file:///Users/test/demo.html")).toBe(
      "file",
    );
  });

  it("组合后的 key 带有域名后缀", () => {
    expect(
      buildScopedToolbarDisableKey(
        "tau-highlighter-toolbar-disabled-permanent",
        "https://sub.example.com/path",
      ),
    ).toBe("tau-highlighter-toolbar-disabled-permanent:sub.example.com");
  });
});
