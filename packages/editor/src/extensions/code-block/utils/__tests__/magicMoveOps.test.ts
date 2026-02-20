import { describe, expect, it } from "vitest";
import {
  createInitialMagicMove,
  getActiveStepHighlightLines,
  insertNextMagicMoveStep,
  normalizeMagicMove,
  removeMagicMoveStep,
} from "../magicMoveOps";

describe("magicMoveOps", () => {
  it("开启 Diff 时应继承初始高亮", () => {
    const magicMove = createInitialMagicMove("const a = 1", "2-3");
    expect(magicMove.steps).toHaveLength(2);
    expect(magicMove.steps[0]?.highlightLines).toBe("2-3");
    expect(magicMove.steps[1]?.highlightLines).toBe("2-3");
  });

  it("新增步骤应继承当前步骤高亮", () => {
    const base = createInitialMagicMove("a", "2");
    const next = insertNextMagicMoveStep(base, "a");
    expect(next.steps).toHaveLength(3);
    expect(next.activeStep).toBe(2);
    expect(next.steps[2]?.highlightLines).toBe("2");
  });

  it("删除步骤后应返回新的激活步骤高亮", () => {
    const base = {
      v: 1 as const,
      activeStep: 1,
      steps: [
        { id: "step-1", code: "a", highlightLines: "1" },
        { id: "step-2", code: "b", highlightLines: "2" },
      ],
    };
    const result = removeMagicMoveStep(base, "b");
    expect(result.removed).toBe(true);
    expect(result.magicMove).toBeNull();
    expect(result.highlightLines).toBe("1");
  });

  it("应规范化步骤中的空高亮字符串", () => {
    const normalized = normalizeMagicMove({
      v: 1,
      activeStep: 0,
      steps: [{ id: "step-1", code: "a", highlightLines: "   " }],
    });
    expect(normalized).not.toBeNull();
    expect(getActiveStepHighlightLines(normalized!)).toBeUndefined();
  });
});
