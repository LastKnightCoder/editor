import { invoke } from "@/electron";
import type {
  RandomWalkDailyAdvanceParams,
  RandomWalkDailyDeckParams,
  RandomWalkPickParams,
  RandomWalkSameTagParams,
  WalkDailyDeck,
  WalkItem,
  WalkNeighbor,
  WalkRef,
} from "@/types";

export function pickRandomWalk(params: RandomWalkPickParams): Promise<WalkItem | null> {
  const { kinds, ...rest } = params;
  // 空数组与缺省同义（全部 5 种），归一后省略字段保持载荷干净
  return invoke("random-walk:pick", kinds?.length ? { ...rest, kinds } : rest);
}

/** 岔路点进去：取该条实体的完整漫步内容（不在池口径返回 null） */
export function getRandomWalkItem(ref: WalkRef): Promise<WalkItem | null> {
  return invoke("random-walk:get", ref);
}

/** 岔路·同标签邻居 */
export function getRandomWalkSameTag(params: RandomWalkSameTagParams): Promise<WalkNeighbor[]> {
  return invoke("random-walk:same-tag", params);
}

export function markRandomWalkSeen(ref: WalkRef): Promise<void> {
  return invoke("random-walk:mark-seen", ref);
}

export function muteRandomWalk(ref: WalkRef): Promise<void> {
  return invoke("random-walk:mute", ref);
}

export function getRandomWalkDailyDeck(params: RandomWalkDailyDeckParams): Promise<WalkDailyDeck> {
  return invoke("random-walk:daily-deck", params);
}

export function advanceRandomWalkDailyDeck(params: RandomWalkDailyAdvanceParams): Promise<void> {
  return invoke("random-walk:daily-advance", params);
}

export function rerollRandomWalkDailyDeck(
  params: RandomWalkDailyDeckParams
): Promise<WalkDailyDeck> {
  return invoke("random-walk:daily-reroll", params);
}
