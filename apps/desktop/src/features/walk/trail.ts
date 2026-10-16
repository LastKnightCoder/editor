/**
 * 足迹状态机（纯函数）：steps 是走过的线性历史，index 指当前站；
 * 回看中途再走新站会截断后面的分支，上限 50 站（超出丢最早）。
 */

import type { WalkItem, WalkRelation } from "@/types";

export type WalkVia =
  | { type: "start" }
  | { type: "jump" }
  | {
      type: "relation";
      relation: WalkRelation;
      sharedTag: string | null;
      fromTitle: string;
    };

export interface WalkStep {
  item: WalkItem;
  via: WalkVia;
}

export interface WalkTrail {
  steps: WalkStep[];
  index: number;
}

export const TRAIL_MAX_STEPS = 50;

export function startTrail(item: WalkItem): WalkTrail {
  return { steps: [{ item, via: { type: "start" } }], index: 0 };
}

/** 前进一步：截断 index 之后的分支再追加，并指到新站 */
export function advanceTrail(trail: WalkTrail, step: WalkStep): WalkTrail {
  const steps = [...trail.steps.slice(0, trail.index + 1), step];
  if (steps.length > TRAIL_MAX_STEPS) steps.splice(0, steps.length - TRAIL_MAX_STEPS);
  return { steps, index: steps.length - 1 };
}

export function gotoTrail(trail: WalkTrail, index: number): WalkTrail {
  return { ...trail, index: Math.min(Math.max(index, 0), trail.steps.length - 1) };
}

export function backTrail(trail: WalkTrail): WalkTrail {
  return gotoTrail(trail, trail.index - 1);
}

export function forwardTrail(trail: WalkTrail): WalkTrail {
  return gotoTrail(trail, trail.index + 1);
}
