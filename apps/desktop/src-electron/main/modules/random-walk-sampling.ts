/**
 * 随机漫步的加权抽样：纯函数，不碰数据库（候选由表模块用轻量 SQL 取出）。
 * 随机源可注入，测试用固定种子 / 序列。
 */

import type { WalkBias, WalkReason, WalkRef } from "@/types";

export interface WalkCandidate {
  kind: WalkRef["kind"];
  id: number;
  createTime: number;
  updateTime: number;
  lastSeenTime: number | null;
  /** 本地日期 YYYY-MM-DD：diary-moment 为所属日记日，其余为 create_time 本地日 */
  dateKey: string;
}

export interface WalkSampleOptions {
  bias: WalkBias;
  now: number;
  /** 本地今日 YYYY-MM-DD，用于 on-this-day 的月日匹配与年差 */
  today: string;
  exclude?: WalkRef[];
  /** 返回 [0,1) 的随机源；缺省用 Math.random */
  random?: () => number;
}

export interface WalkSample {
  candidate: WalkCandidate;
  reason: WalkReason;
}

const DAY_MS = 86_400_000;

const refKey = (ref: { kind: string; id: number }) => `${ref.kind}:${ref.id}`;

/** 距今天数：自上次漫步或最近一次更新（取更晚者）算起 */
export function walkStaleDays(candidate: WalkCandidate, now: number): number {
  return Math.max(0, (now - Math.max(candidate.lastSeenTime ?? 0, candidate.updateTime)) / DAY_MS);
}

/** 往年同月同日（不含今年：今年的内容谈不上「那年今日」） */
function isOnThisDay(candidate: WalkCandidate, today: string): boolean {
  return (
    candidate.dateKey.slice(5) === today.slice(5) &&
    Number(candidate.dateKey.slice(0, 4)) < Number(today.slice(0, 4))
  );
}

/** 加权无放回抽 count 张；池为空返回空数组 */
export function sampleWalk(
  candidates: WalkCandidate[],
  count: number,
  options: WalkSampleOptions
): WalkSample[] {
  const random = options.random ?? Math.random;
  const excluded = new Set((options.exclude ?? []).map(refKey));
  let pool = candidates.filter(candidate => !excluded.has(refKey(candidate)));

  // 实际生效的偏好：on-this-day 无候选时如实回退 stale（权重与 reason 一并按 stale）
  let bias = options.bias;
  if (bias === "on-this-day") {
    const matched = pool.filter(candidate => isOnThisDay(candidate, options.today));
    if (matched.length > 0) pool = matched;
    else bias = "stale";
  }

  const reasonOf = (candidate: WalkCandidate): WalkReason => {
    switch (bias) {
      case "on-this-day":
        return {
          type: "on-this-day",
          years: Number(options.today.slice(0, 4)) - Number(candidate.dateKey.slice(0, 4)),
        };
      case "stale":
        return { type: "stale", days: Math.floor(walkStaleDays(candidate, options.now)) };
      default:
        return { type: "random" };
    }
  };

  const picked: WalkSample[] = [];
  const weights =
    bias === "random"
      ? pool.map(() => 1)
      : pool.map(candidate => Math.log(walkStaleDays(candidate, options.now) + 2));

  while (picked.length < count && pool.length > 0) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let dart = random() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      dart -= weights[i];
      if (dart <= 0) {
        index = i;
        break;
      }
    }
    picked.push({ candidate: pool[index], reason: reasonOf(pool[index]) });
    pool.splice(index, 1);
    weights.splice(index, 1);
  }
  return picked;
}

/** 抽一条；池为空返回 null */
export function pickWalk(
  candidates: WalkCandidate[],
  options: WalkSampleOptions
): WalkSample | null {
  return sampleWalk(candidates, 1, options)[0] ?? null;
}
