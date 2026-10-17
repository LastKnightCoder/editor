import { beforeEach, describe, expect, it, vi } from "vitest";

const openExternal = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("electron", () => ({ shell: { openExternal } }));

import { routeWindowOpen } from "../open-handler";

beforeEach(() => openExternal.mockClear());

describe("窗口打开请求", () => {
  it("http(s) 交给系统浏览器，不创建子窗口", () => {
    expect(routeWindowOpen({ url: "https://weread.qq.com/web/reader/x" })).toEqual({
      action: "deny",
    });
    expect(openExternal).toHaveBeenCalledWith("https://weread.qq.com/web/reader/x");
  });

  it("其他协议直接拒绝", () => {
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "tau://x"])
      expect(routeWindowOpen({ url })).toEqual({ action: "deny" });
    expect(openExternal).not.toHaveBeenCalled();
  });
});
