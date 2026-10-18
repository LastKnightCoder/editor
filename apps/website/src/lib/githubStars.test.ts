import { describe, expect, it } from "vitest";
import { formatStars } from "./githubStars.ts";

describe("formatStars", () => {
  it("不足 100 星或读取失败时不展示", () => {
    expect(formatStars(null)).toBeNull();
    expect(formatStars(0)).toBeNull();
    expect(formatStars(99)).toBeNull();
  });

  it("千位以下原样展示，以上折成 k", () => {
    expect(formatStars(100)).toBe("100");
    expect(formatStars(999)).toBe("999");
    expect(formatStars(1000)).toBe("1k");
    expect(formatStars(1234)).toBe("1.2k");
    expect(formatStars(12_345)).toBe("12k");
  });
});
