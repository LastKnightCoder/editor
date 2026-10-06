import { describe, expect, it } from "vitest";
import { contrast, dominantEdgeColor, nightPaper, paperPalette, type Rgb } from "../paper";

const parse = (value: string): Rgb =>
  (value.match(/\d+/g) ?? []).slice(0, 3).map(Number) as unknown as Rgb;

describe("纸色", () => {
  it("取边缘众数：零星文字不影响，杂色过多返回 null", () => {
    const cream: Rgb = [246, 238, 220];
    const edge = [...Array<Rgb>(90).fill(cream), ...Array<Rgb>(10).fill([20, 20, 20])];
    expect(dominantEdgeColor(edge)).toEqual(cream);
    const noisy = Array.from({ length: 100 }, (_, i) => [i * 2, 255 - i * 2, i] as Rgb);
    expect(dominantEdgeColor(noisy)).toBeNull();
  });

  it("夜间页面与页面滤镜一致：白纸变深、保持中性", () => {
    const [r, g, b] = nightPaper([255, 255, 255]);
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeLessThan(40);
  });

  it("文字色在浅纸、米黄纸、深纸上都达标", () => {
    for (const paper of [
      [255, 255, 255],
      [246, 238, 220],
      [40, 40, 40],
      nightPaper([246, 238, 220]),
    ] as Rgb[]) {
      const palette = paperPalette(paper);
      expect(contrast(parse(palette.ink), paper)).toBeGreaterThanOrEqual(5.5);
      expect(contrast(parse(palette.inkStrong), paper)).toBeGreaterThanOrEqual(9);
      expect(contrast(parse(palette.muted), paper)).toBeGreaterThanOrEqual(3);
    }
  });
});
