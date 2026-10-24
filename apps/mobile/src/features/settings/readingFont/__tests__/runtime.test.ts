import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke, Channel: class {} }));
vi.mock("../../../../components/toast", () => ({ toast: { warning: vi.fn() } }));

import type { ReadingFontRelease } from "../api";
import { normalizeReadingFontId, readingFontOption, withReadingFont } from "../fonts";
import { applyReadingFontVars, forgetReadingFontFaces, loadReadingFontFaces } from "../runtime";

class FakeFontFace {
  constructor(
    public family: string,
    public source: ArrayBuffer,
    public descriptors: { weight?: string }
  ) {}
  load() {
    return Promise.resolve(this);
  }
}

const added = new Set<unknown>();

function release(id: string, version: string): ReadingFontRelease {
  return {
    id,
    name: id,
    version,
    license: `${id}-${version}-LICENSE.txt`,
    files: [
      {
        style: "regular",
        weight: "400",
        file: `${id}-${version}-regular.woff2`,
        size: 4,
        sha256: "a".repeat(64),
      },
    ],
  };
}

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(new ArrayBuffer(4));
  added.clear();
  vi.stubGlobal("FontFace", FakeFontFace);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      add: (face: unknown) => added.add(face),
      delete: (face: unknown) => added.delete(face),
    },
  });
});

afterEach(() => {
  forgetReadingFontFaces("lxgw-wenkai");
  applyReadingFontVars(null);
  vi.unstubAllGlobals();
});

describe("fonts", () => {
  it("未知或缺省的字体 id 归一为系统默认", () => {
    expect(normalizeReadingFontId(undefined)).toBe("system");
    expect(normalizeReadingFontId("comic-sans")).toBe("system");
    expect(normalizeReadingFontId("noto-serif-sc")).toBe("noto-serif-sc");
  });

  it("写入 appearance.readingFont 时保留其他外观设置", () => {
    const next = withReadingFont(
      { appearance: { image: { borderRadius: "md" } } } as never,
      "lxgw-wenkai"
    );
    expect(next.appearance).toEqual({ image: { borderRadius: "md" }, readingFont: "lxgw-wenkai" });
  });
});

describe("loadReadingFontFaces", () => {
  it("按字重文件读字节注册 FontFace，同一版本只注册一次", async () => {
    const font = release("lxgw-wenkai", "1.530");
    const faces = await loadReadingFontFaces(font);
    await loadReadingFontFaces(font);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("reading_font_read", {
      id: "lxgw-wenkai",
      style: "regular",
    });
    expect(faces[0]).toMatchObject({
      family: "Tau Reading lxgw-wenkai",
      descriptors: { weight: "400" },
    });
    expect(added.size).toBe(1);
  });

  it("换版本时撤下旧字形，移除字体后全部撤下", async () => {
    const [oldFace] = await loadReadingFontFaces(release("lxgw-wenkai", "1.530"));
    const [newFace] = await loadReadingFontFaces(release("lxgw-wenkai", "1.600"));
    await Promise.resolve();
    expect(added.has(oldFace)).toBe(false);
    expect(added.has(newFace)).toBe(true);

    forgetReadingFontFaces("lxgw-wenkai");
    await Promise.resolve();
    expect(added.size).toBe(0);
  });

  it("读取失败时不缓存，下次重新读取", async () => {
    invoke.mockRejectedValueOnce("READING_FONT_NOT_INSTALLED: lxgw-wenkai");
    await expect(loadReadingFontFaces(release("lxgw-wenkai", "1.530"))).rejects.toBeTruthy();
    await loadReadingFontFaces(release("lxgw-wenkai", "1.530"));
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});

describe("applyReadingFontVars", () => {
  const style = () => document.documentElement.style;

  it("文楷写入 family 并开启合成粗体，宋体不合成，系统默认清空变量", () => {
    applyReadingFontVars(readingFontOption("lxgw-wenkai"));
    expect(style().getPropertyValue("--mobile-reading-font")).toBe(
      '"Tau Reading lxgw-wenkai", var(--tau-font)'
    );
    expect(style().getPropertyValue("--mobile-reading-font-synthesis")).toBe("weight");

    applyReadingFontVars(readingFontOption("noto-serif-sc"));
    expect(style().getPropertyValue("--mobile-reading-font-synthesis")).toBe("");

    applyReadingFontVars(readingFontOption("system"));
    expect(style().getPropertyValue("--mobile-reading-font")).toBe("");
  });
});
