import { describe, expect, it } from "vitest";
import { toContainerSpace } from "../cursorOverlay";

describe("toContainerSpace", () => {
  it("没有缩放时原样返回", () => {
    const box = { top: 1, left: 2, height: 3 };
    expect(toContainerSpace(box, 1)).toBe(box);
  });
});
