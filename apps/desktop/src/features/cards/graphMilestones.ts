/**
 * 图谱入场动画的时机：第一次进入图谱自动播一次；之后卡片数每跨过一个里程碑，
 * 说明行换成一句邀请（点了才播，不自动播）。看过的里程碑按库记在本地，重启不重复。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 里程碑节点：越往后越稀，才像「里程碑」。每 500 张一次太密（用户确认过），
 * 2 万张以后按万位继续。
 */
export const MILESTONES = [100, 300, 500, 1000, 2000, 5000, 10000, 20000] as const;

/** count 已经跨过的最高里程碑；一个都没到时为 0 */
export function milestoneOf(count: number): number {
  if (count >= 20000) return Math.floor(count / 10000) * 10000;
  let reached = 0;
  for (const milestone of MILESTONES) if (count >= milestone) reached = milestone;
  return reached;
}

/**
 * 这次进入图谱该做什么。
 *  - autoplay：这个库从没播过（第一次进入），自动播一次；
 *  - invite：跨过了还没提示过的里程碑，给出邀请语；
 *  - none：什么都不做。
 * seen 是已经播过或提示过的最高里程碑；null 表示从没进过。
 */
export function graphMoment(
  count: number,
  seen: number | null
): { kind: "autoplay" } | { kind: "invite"; milestone: number } | { kind: "none" } {
  if (count === 0) return { kind: "none" };
  if (seen === null) return { kind: "autoplay" };
  const milestone = milestoneOf(count);
  if (milestone > seen) return { kind: "invite", milestone };
  return { kind: "none" };
}

interface GraphMilestoneState {
  /** 库名 → 已播过 / 提示过的最高里程碑 */
  seenByDatabase: Record<string, number>;
  markSeen(databaseName: string, milestone: number): void;
}

export const useGraphMilestoneStore = create<GraphMilestoneState>()(
  persist(
    set => ({
      seenByDatabase: {},
      markSeen: (databaseName, milestone) =>
        set(state => ({
          seenByDatabase: {
            ...state.seenByDatabase,
            [databaseName]: Math.max(state.seenByDatabase[databaseName] ?? 0, milestone),
          },
        })),
    }),
    { name: "tau-cards-graph-milestones", version: 1 }
  )
);
