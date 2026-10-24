import { afterEach, describe, expect, it, vi } from "vitest";
import { archFromRenderer, detectMacArch, detectOs } from "./platform.ts";

afterEach(() => vi.unstubAllGlobals());

describe("访客平台识别", () => {
  it("Android 手机推荐 Android 安装包", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36",
      maxTouchPoints: 5,
    });
    expect(detectOs()).toBe("android");
  });

  it("iPad 桌面模式不推荐 Mac 安装包", () => {
    vi.stubGlobal("navigator", { userAgent: "Macintosh; Intel Mac OS X", maxTouchPoints: 5 });
    expect(detectOs()).toBeNull();
  });

  it("Mac 的 UA 写 Intel 时也不据此判断芯片", async () => {
    vi.stubGlobal("navigator", { userAgent: "Macintosh; Intel Mac OS X", maxTouchPoints: 0 });
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
    expect(detectOs()).toBe("mac");
    expect(await detectMacArch()).toBeNull();
  });

  it.each([
    ["arm", "arm64"],
    ["x86", "x64"],
  ])("按 Client Hints 的 %s 识别为 %s", async (architecture, expected) => {
    vi.stubGlobal("navigator", {
      userAgentData: { getHighEntropyValues: async () => ({ architecture }) },
    });
    expect(await detectMacArch()).toBe(expected);
  });

  it("浏览器拒绝 Client Hints 时继续读取显卡名称", async () => {
    vi.stubGlobal("navigator", {
      userAgentData: {
        getHighEntropyValues: async () => {
          throw new Error("denied");
        },
      },
    });
    const loseContext = vi.fn();
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => ({
          getExtension: (name: string) =>
            name === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 1 } : { loseContext },
          getParameter: () => "Apple M4",
        }),
      }),
    });
    expect(await detectMacArch()).toBe("arm64");
    expect(loseContext).toHaveBeenCalledOnce();
  });
});

describe("archFromRenderer", () => {
  it("Apple 芯片的显卡名判为 arm64", () => {
    expect(
      archFromRenderer("ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)")
    ).toBe("arm64");
  });

  it("Intel Mac 的集显或独显判为 x64", () => {
    expect(
      archFromRenderer("ANGLE (Intel Inc., Intel(R) Iris(TM) Plus Graphics 655, OpenGL 4.1)")
    ).toBe("x64");
    expect(archFromRenderer("AMD Radeon Pro 5500M OpenGL Engine")).toBe("x64");
  });

  it("Safari 的「Apple GPU」判断不了", () => {
    expect(archFromRenderer("Apple GPU")).toBeNull();
  });
});
