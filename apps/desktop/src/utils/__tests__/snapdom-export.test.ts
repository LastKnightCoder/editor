import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@zumer/snapdom", () => ({
  snapdom: {
    toBlob: vi.fn(),
  },
}));

import { snapdom } from "@zumer/snapdom";
import { captureBlobWithSnapdom } from "../snapdom-export";

const toBlobMock = vi.mocked(snapdom.toBlob);

describe("snapdom-export", () => {
  let originalFontsDescriptor: PropertyDescriptor | undefined;

  const setDocumentFonts = (fonts: unknown) => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: fonts,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    originalFontsDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "fonts",
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalFontsDescriptor) {
      Object.defineProperty(document, "fonts", originalFontsDescriptor);
    } else {
      Reflect.deleteProperty(document, "fonts");
    }
  });

  it("会在字体 ready 之后再调用 toBlob", async () => {
    let resolveReady!: () => void;
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    setDocumentFonts({ ready: readyPromise });
    toBlobMock.mockResolvedValue(new Blob());

    const target = document.createElement("div");
    const exportTask = captureBlobWithSnapdom(target, {
      type: "png",
      fontReadyTimeoutMs: 10000,
    });

    await Promise.resolve();
    expect(toBlobMock).not.toHaveBeenCalled();

    resolveReady();
    await exportTask;

    expect(toBlobMock).toHaveBeenCalledTimes(1);
  });

  it("总是强制传递 embedFonts=true", async () => {
    setDocumentFonts({ ready: Promise.resolve() });
    toBlobMock.mockResolvedValue(new Blob());

    const target = document.createElement("div");
    await captureBlobWithSnapdom(target, {
      type: "png",
      embedFonts: false,
    });

    expect(toBlobMock).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        type: "png",
        embedFonts: true,
      }),
    );
  });

  it("document.fonts 不存在时也能正常导出", async () => {
    setDocumentFonts(undefined);
    toBlobMock.mockResolvedValue(new Blob());

    const target = document.createElement("div");
    await captureBlobWithSnapdom(target, { type: "png" });

    expect(toBlobMock).toHaveBeenCalledTimes(1);
  });

  it("字体等待超时时不中断导出", async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    setDocumentFonts({
      ready: new Promise<void>(() => {}),
    });
    toBlobMock.mockResolvedValue(new Blob());

    const target = document.createElement("div");
    const exportTask = captureBlobWithSnapdom(target, {
      type: "png",
      fontReadyTimeoutMs: 50,
    });

    await vi.advanceTimersByTimeAsync(51);
    await exportTask;

    expect(toBlobMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
