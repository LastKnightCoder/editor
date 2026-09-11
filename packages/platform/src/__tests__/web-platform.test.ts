import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAPABILITY_IDS, UnsupportedError } from "../capabilities";
import { webPlatform } from "../web";

describe("webPlatform 能力声明", () => {
  it("白名单能力 supports 为 true", () => {
    expect(webPlatform.kind).toBe("web");
    expect(webPlatform.supports("shell.open-external")).toBe(true);
    expect(webPlatform.supports("fileDialog.download-file")).toBe(true);
    expect(webPlatform.supports("window.focus-events")).toBe(true);
  });

  it("非白名单能力 supports 为 false", () => {
    expect(webPlatform.supports("window.minimize")).toBe(false);
    expect(webPlatform.supports("localFile.read-text")).toBe(false);
  });

  it("supports 覆盖清单内全部能力（防拼写漂移）", () => {
    for (const id of CAPABILITY_IDS) {
      expect(typeof webPlatform.supports(id)).toBe("boolean");
    }
  });
});

describe("webPlatform 缺失能力统一抛 UnsupportedError", () => {
  it("窗口方法携带 capability 标识", async () => {
    await expect(webPlatform.window.minimize()).rejects.toMatchObject({
      name: "UnsupportedError",
      capability: "window.minimize",
    });
  });

  it("本地文件读取同样抛错", async () => {
    await expect(webPlatform.localFile.readTextFile("/tmp/a.md")).rejects.toBeInstanceOf(
      UnsupportedError
    );
  });
});

describe("webPlatform 浏览器等价实现", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("openExternal 经 window.open 打开并带 noopener", async () => {
    const open = vi.fn();
    vi.stubGlobal("window", { open });
    await webPlatform.shell.openExternal("https://example.com");
    expect(open).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
    vi.unstubAllGlobals();
  });

  it("onFocusChange 订阅原生 focus/blur 且取消函数移除监听", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal("window", { addEventListener, removeEventListener });

    const dispose = webPlatform.window.onFocusChange(vi.fn());
    expect(addEventListener).toHaveBeenCalledTimes(2);

    dispose();
    expect(removeEventListener).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
