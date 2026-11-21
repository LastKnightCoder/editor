import type { QueryClient } from "@tanstack/react-query";
import type { ICard } from "@/types/card";

export const cardsKey = (databaseName: string) => ["cards", databaseName, "all"] as const;

export const cardDetailKey = (databaseName: string, id: number | null) =>
  ["cards", databaseName, "detail", id] as const;

export function removeCardFromCache(queryClient: QueryClient, databaseName: string, id: number) {
  queryClient.setQueryData<ICard[]>(cardsKey(databaseName), cards =>
    cards?.filter(card => card.id !== id)
  );
  queryClient.removeQueries({ queryKey: cardDetailKey(databaseName, id), exact: true });
}

/** 单卡并入列表与详情缓存，避免元数据变更触发全量重拉。 */
export function mergeCardIntoCache(
  queryClient: QueryClient,
  databaseName: string,
  card: ICard,
  change: "upsert" | "deleted"
) {
  if (change === "deleted") return removeCardFromCache(queryClient, databaseName, card.id);
  queryClient.setQueryData<ICard[]>(cardsKey(databaseName), cards => {
    if (!cards) return cards;
    return cards.some(item => item.id === card.id)
      ? cards.map(item => (item.id === card.id ? card : item))
      : [...cards, card];
  });
  queryClient.setQueryData(cardDetailKey(databaseName, card.id), card);
}
