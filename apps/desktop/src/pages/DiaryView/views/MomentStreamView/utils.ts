import type { DiarySegmentItem } from "@/types/diary";

export type DiarySearchRankMap = Map<number, number>;

export function buildDiarySearchRankMap(
  entryIds: number[],
): DiarySearchRankMap {
  const rankMap: DiarySearchRankMap = new Map();
  entryIds.forEach((entryId) => {
    if (!rankMap.has(entryId)) {
      rankMap.set(entryId, rankMap.size);
    }
  });
  return rankMap;
}

export function filterAndSortSegmentsBySearchRank(
  segments: DiarySegmentItem[],
  rankMap: DiarySearchRankMap,
): DiarySegmentItem[] {
  return segments
    .map((segment, index) => ({
      segment,
      index,
      rank: rankMap.get(segment.diaryId),
    }))
    .filter(
      (
        item,
      ): item is { segment: DiarySegmentItem; index: number; rank: number } =>
        item.rank !== undefined,
    )
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((item) => item.segment);
}
