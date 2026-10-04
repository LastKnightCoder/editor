import { describe, expect, it } from "vitest";
import { getChangedLines } from "../lineDiff";

describe("getChangedLines", () => {
  it("标出新增与改写的行，保留的行不标", () => {
    const previous = ["a", "b", "c"].join("\n");
    const next = ["a", "x", "b", "c2"].join("\n");
    expect([...getChangedLines(previous, next)]).toEqual([1, 3]);
  });

  it("只删除行时没有改动行", () => {
    expect(getChangedLines("a\nb\nc", "a\nc").size).toBe(0);
  });

  it("新增的空行不标", () => {
    expect([...getChangedLines("a\nb", "a\n\nb\nc")]).toEqual([3]);
  });

  it("相同代码没有改动行", () => {
    expect(getChangedLines("a\nb", "a\nb").size).toBe(0);
  });
});
