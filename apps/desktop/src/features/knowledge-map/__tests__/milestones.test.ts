import { describe, expect, it } from "vitest";
import { graphMoment, milestoneOf } from "../milestones";

describe("图谱动画的时机", () => {
  it("里程碑越往后越稀：100 / 300 / 500 / 1000 / 2000 / 5000 / 10000 / 20000，之后按万", () => {
    expect(milestoneOf(99)).toBe(0);
    expect(milestoneOf(100)).toBe(100);
    expect(milestoneOf(674)).toBe(500);
    expect(milestoneOf(999)).toBe(500);
    expect(milestoneOf(1500)).toBe(1000);
    expect(milestoneOf(4999)).toBe(2000);
    expect(milestoneOf(12000)).toBe(10000);
    expect(milestoneOf(35000)).toBe(30000);
  });

  it("第一次进入图谱自动播一次", () => {
    expect(graphMoment(674, null)).toEqual({ kind: "autoplay" });
  });

  it("跨过没提示过的里程碑时邀请，不自动播", () => {
    expect(graphMoment(1020, 500)).toEqual({ kind: "invite", milestone: 1000 });
  });

  it("里程碑没变就什么都不做", () => {
    expect(graphMoment(900, 500)).toEqual({ kind: "none" });
    expect(graphMoment(80, 0)).toEqual({ kind: "none" });
  });

  it("空库什么都不做", () => {
    expect(graphMoment(0, null)).toEqual({ kind: "none" });
  });
});
