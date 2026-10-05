import { describe, expect, it } from "vitest";
import { compareVersions, notesBetween } from "../notes";

const notes = [
  { version: "0.52.0", note: "a" },
  { version: "0.54.0", note: "c" },
  { version: "0.53.0", note: "b" },
  { version: "0.55.0", note: "d" },
];

describe("升级公告区间", () => {
  it("版本号按数值比较", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("跨版本升级合并中间版本，从新到旧，不含起点与终点之后", () => {
    expect(notesBetween(notes, "0.52.0", "0.54.0").map(n => n.version)).toEqual([
      "0.54.0",
      "0.53.0",
    ]);
  });

  it("来源版本未知时只取目标版本", () => {
    expect(notesBetween(notes, null, "0.53.0").map(n => n.version)).toEqual(["0.53.0"]);
    expect(notesBetween(notes, "", "0.53.0").map(n => n.version)).toEqual(["0.53.0"]);
  });

  it("降级或同版本不产出公告", () => {
    expect(notesBetween(notes, "0.54.0", "0.53.0")).toEqual([]);
    expect(notesBetween(notes, "0.54.0", "0.54.0")).toEqual([]);
  });
});
