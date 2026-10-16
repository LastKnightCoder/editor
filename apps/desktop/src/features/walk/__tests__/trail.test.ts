import { describe, expect, it } from "vitest";
import type { WalkItem } from "@/types";
import {
  TRAIL_MAX_STEPS,
  advanceTrail,
  backTrail,
  forwardTrail,
  gotoTrail,
  startTrail,
  type WalkStep,
} from "../trail";

const item = (id: number): WalkItem => ({
  ref: { kind: "card", id },
  title: `内容${id}`,
  contentId: id,
  content: [],
  excerpt: null,
  note: null,
  source: null,
  tags: [],
  createTime: 0,
  updateTime: 0,
  lastSeenTime: null,
  reason: { type: "random" },
});

const step = (id: number, type: WalkStep["via"]["type"] = "jump"): WalkStep => ({
  item: item(id),
  via:
    type === "relation"
      ? { type: "relation", relation: "link", sharedTag: null, fromTitle: "来源" }
      : { type: type },
});

describe("trail 状态机", () => {
  it("start 建立首站；advance 顺序追加并指到新站", () => {
    const trail = startTrail(item(1));
    expect(trail).toEqual({ steps: [expect.anything()], index: 0 });
    expect(trail.steps[0].via).toEqual({ type: "start" });

    const next = advanceTrail(trail, step(2, "relation"));
    expect(next.steps).toHaveLength(2);
    expect(next.index).toBe(1);
    expect(next.steps[1].item.ref.id).toBe(2);
  });

  it("回看中途再前进：截断 index 之后的分支", () => {
    let trail = startTrail(item(1));
    trail = advanceTrail(trail, step(2));
    trail = advanceTrail(trail, step(3));
    trail = gotoTrail(trail, 0);
    expect(trail.index).toBe(0);

    trail = advanceTrail(trail, step(9));
    expect(trail.steps.map(s => s.item.ref.id)).toEqual([1, 9]);
    expect(trail.index).toBe(1);
  });

  it("steps 上限 50：超出丢最早，index 保持指向新站", () => {
    let trail = startTrail(item(0));
    for (let i = 1; i <= TRAIL_MAX_STEPS + 5; i++) trail = advanceTrail(trail, step(i));
    expect(trail.steps).toHaveLength(TRAIL_MAX_STEPS);
    expect(trail.index).toBe(TRAIL_MAX_STEPS - 1);
    // 丢掉的是最早 6 站（0–5），首站变成 6
    expect(trail.steps[0].item.ref.id).toBe(6);
    expect(trail.steps[trail.index].item.ref.id).toBe(TRAIL_MAX_STEPS + 5);
  });

  it("goto 夹取边界；back/forward 在端点 no-op", () => {
    let trail = startTrail(item(1));
    trail = advanceTrail(trail, step(2));
    trail = advanceTrail(trail, step(3));

    expect(gotoTrail(trail, -5).index).toBe(0);
    expect(gotoTrail(trail, 99).index).toBe(2);

    const atStart = gotoTrail(trail, 0);
    expect(backTrail(atStart).index).toBe(0);
    expect(forwardTrail(atStart).index).toBe(1);

    const atEnd = gotoTrail(trail, 2);
    expect(forwardTrail(atEnd).index).toBe(2);
    expect(backTrail(atEnd).index).toBe(1);
  });
});
