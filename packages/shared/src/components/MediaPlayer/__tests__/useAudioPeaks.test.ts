import { describe, expect, it } from "vitest";
import { computePeaks, resamplePeaks } from "../useAudioPeaks";

describe("computePeaks", () => {
  it("按桶取各声道绝对值峰值并归一", () => {
    const left = new Float32Array([0.1, -0.5, 0.2, 0.25, 0, 0, -1, 0.3]);
    const right = new Float32Array([0, 0, 0.1, 0.4, 0, 0, 0.2, 0.1]);
    expect(computePeaks([left, right], 4)).toEqual([0.5, 0.4, 0.06, 1]);
  });

  it("全静音时保底最小高度，空数据返回空数组", () => {
    expect(computePeaks([new Float32Array(8)], 2)).toEqual([0.06, 0.06]);
    expect(computePeaks([new Float32Array(0)], 4)).toEqual([]);
    expect(computePeaks([], 4)).toEqual([]);
  });
});

describe("resamplePeaks", () => {
  it("按目标柱数最大值池化", () => {
    expect(resamplePeaks([0.1, 0.9, 0.2, 0.3, 0.8, 0.4], 3)).toEqual([0.9, 0.3, 0.8]);
  });

  it("柱数不少于峰值数时原样返回", () => {
    const peaks = [0.1, 0.2];
    expect(resamplePeaks(peaks, 5)).toBe(peaks);
    expect(resamplePeaks(peaks, 0)).toEqual([]);
  });
});
