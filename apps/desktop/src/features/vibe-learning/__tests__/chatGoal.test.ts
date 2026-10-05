import { describe, expect, it } from "vitest";
import type { Descendant } from "slate";
import { buildVLGoalSection } from "../views/VibeLearningView/chatGoal";

const desc = [
  { type: "paragraph", children: [{ type: "formatted", text: "读《置身事内》时想到" }] },
] as unknown as Descendant[];

describe("Notebook 对话的课题目标", () => {
  it("标题与目标描述进系统提示词", () => {
    const section = buildVLGoalSection("为什么地方财政依赖土地", desc);
    expect(section).toContain("## 课题目标");
    expect(section).toContain("课题：为什么地方财政依赖土地");
    expect(section).toContain("目标描述：\n读《置身事内》时想到");
  });

  it("没有描述只带标题；都为空时不加这一节", () => {
    expect(buildVLGoalSection("土地财政", [])).not.toContain("目标描述");
    expect(buildVLGoalSection("  ", undefined)).toBe("");
  });

  it("过长的描述截断", () => {
    const long = [
      { type: "paragraph", children: [{ type: "formatted", text: "字".repeat(3000) }] },
    ] as unknown as Descendant[];
    expect(buildVLGoalSection("x", long)).toContain(`${"字".repeat(2000)}…`);
  });
});
