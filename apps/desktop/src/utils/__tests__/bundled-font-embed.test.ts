/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "@/assets/fonts/hand/hand-font.json";

const readBinaryFile = vi.hoisted(() => vi.fn(async () => new Uint8Array([1, 2, 3])));
vi.mock("@/commands/file", () => ({ readBinaryFile }));

import { getBundledLocalFonts, rangeStart } from "../bundled-font-embed";

const setFonts = (faces: { family: string; unicodeRange: string; status: string }[]) => {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { forEach: (cb: (face: unknown) => void) => faces.forEach(cb) },
  });
};

afterEach(() => {
  readBinaryFile.mockClear();
  vi.unstubAllGlobals();
});

describe("bundled-font-embed", () => {
  it("清单与 unicode-range 起始码位对得上（构建产物自洽）", () => {
    const families = new Set(manifest.map(entry => entry.family));
    expect(families.size).toBe(manifest.length);
    expect(manifest[0]).toMatchObject({ family: "Tau Hand Latin", start: 0x20 });
    expect(rangeStart("U+4E00-4E3F, U+5000")).toBe(0x4e00);
    expect(rangeStart("u+20-7e")).toBe(0x20);
  });

  it("只内嵌已加载的内置分片，未加载或非内置字体忽略", async () => {
    const cjk = manifest[3];
    setFonts([
      { family: '"Tau Hand Latin"', unicodeRange: "U+20-7E, U+A0-FF", status: "loaded" },
      { family: cjk.family, unicodeRange: `U+${cjk.start.toString(16)}-FFFF`, status: "loaded" },
      {
        family: manifest[4].family,
        unicodeRange: `U+${manifest[4].start.toString(16)}`,
        status: "unloaded",
      },
      { family: "KaTeX_Main", unicodeRange: "U+0-10FFFF", status: "loaded" },
    ]);
    // jsdom 的 baseURI 是 http://，走 fetch 分支；打包后的 file:// 走 readBinaryFile
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([7, 8])));
    vi.stubGlobal("fetch", fetchMock);
    const fonts = await getBundledLocalFonts();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fonts.map(f => f.family)).toEqual(["Tau Hand Latin", cjk.family]);
    expect(fonts[0]).toMatchObject({
      weight: "300 800",
      src: expect.stringMatching(/^data:font\/woff2;base64,/),
    });
    expect(fonts[1].weight).toBe("400");
  });

  it("没有用到内置字体时不读任何文件", async () => {
    setFonts([{ family: "KaTeX_Main", unicodeRange: "U+0-10FFFF", status: "loaded" }]);
    expect(await getBundledLocalFonts()).toEqual([]);
    expect(readBinaryFile).not.toHaveBeenCalled();
  });
});
