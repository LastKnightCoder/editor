/**
 * 卡片库数据源与派生。
 *
 * 数据：getScopedCards 轻表拉取（content 为主进程截好的预览块，不含播客对象），
 * react-query 承载缓存与窗口聚焦刷新；单卡全文/播客经 useCardDetail 按需获取。
 * 写入与跨窗口事件按 id 单卡并入缓存，不做整域失效——全量重拉只剩显式 refresh
 * 与窗口聚焦。分类 / 标签树 / 时间分组全部前端派生（旧版同口径）。
 *
 * 派生：filterCards（分类 + 标签前缀）→ bucketByTimeGroups
 * （置顶优先 → 创建时间降序的分组呈现）→ buildTagTree（层级计数）。
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  createScopedCard,
  deleteScopedCard,
  getScopedCard,
  getScopedCards,
  patchScopedCard,
} from "@/commands/card";
import { ECardCategory, type ICard } from "@/types";
import type { CardMetadataPatch, ICreateCard } from "@/types/card";
import useSettingStore from "@/stores/useSettingStore";
import useGlobalStateStore from "@/stores/useGlobalStateStore";
import { defaultCardEventBus } from "@/utils/event-bus/card-event-bus";
import { defaultContentEventBus } from "@/utils/event-bus/content-event-bus";
import { startOfWeek } from "@/utils/time";
import { toast } from "@tau/ui/Toast";
import type { CardFilter, CardTagNode, CardTimeGroup, CardTimeGroupKey } from "./types";

export const cardsKey = (databaseName: string) => ["cards", databaseName, "all"] as const;

export const cardDetailKey = (databaseName: string, id: number | null) =>
  ["cards", databaseName, "detail", id] as const;

/** 单卡并入列表缓存：更新/新增在位替换或追加，删除移除，并同步单卡详情缓存 */
function mergeCardIntoCache(
  queryClient: QueryClient,
  databaseName: string,
  card: ICard,
  change: "upsert" | "deleted"
) {
  queryClient.setQueryData<ICard[]>(cardsKey(databaseName), cards => {
    if (change === "deleted") return cards?.filter(item => item.id !== card.id);
    if (!cards) return [card];
    return cards.some(item => item.id === card.id)
      ? cards.map(item => (item.id === card.id ? card : item))
      : [...cards, card];
  });
  if (change !== "deleted") {
    queryClient.setQueryData(cardDetailKey(databaseName, card.id), card);
  }
}

/* ---------- 查询 ---------- */

export function useCardsFeed(): {
  cards: ICard[];
  loading: boolean;
  error: string | null;
  refresh(): void;
} {
  const databaseName = useSettingStore(state => state.setting.database.active);
  const ready = useGlobalStateStore(state => state.databaseStatus[databaseName] === "ready");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: cardsKey(databaseName),
    queryFn: () => getScopedCards(databaseName),
    enabled: Boolean(databaseName) && ready,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    const editor = defaultCardEventBus.createEditor();
    /* 事件载荷即全量卡片（跨窗口经 useItemUpdateListener 按 id 回查），直接并入缓存 */
    const unsubscribe = (["card:created", "card:updated", "card:deleted"] as const).map(event =>
      editor.subscribeToOtherEditors(event, ({ card }) => {
        mergeCardIntoCache(
          queryClient,
          databaseName,
          card,
          event === "card:deleted" ? "deleted" : "upsert"
        );
      })
    );
    unsubscribe.push(
      defaultContentEventBus
        .createEditor()
        .subscribeToOtherEditors("content:updated", ({ content }) => {
          if (useSettingStore.getState().setting.database.active !== databaseName) return;
          const update = (card: ICard): ICard =>
            card.contentId === content.id
              ? {
                  ...card,
                  content: content.content,
                  count: content.count,
                  update_time: Math.max(card.update_time, content.updateTime),
                }
              : card;
          queryClient.setQueryData<ICard[]>(cardsKey(databaseName), cards => cards?.map(update));
          queryClient.setQueriesData<ICard>(
            { queryKey: ["cards", databaseName, "detail"] },
            card => card && update(card)
          );
        })
    );
    return () => unsubscribe.forEach(stop => stop());
  }, [databaseName, queryClient]);
  return {
    cards: ready ? (query.data ?? []) : [],
    loading: ready && query.isPending,
    error: ready ? (query.error?.message ?? null) : "数据库尚未就绪",
    refresh: () => {
      if (ready) void query.refetch();
    },
  };
}

/** 单卡全量（含全文与播客）：预览弹窗与导出/演示按需取 */
export function useCardDetail(id: number | null) {
  const databaseName = useSettingStore(state => state.setting.database.active);
  return useQuery({
    queryKey: cardDetailKey(databaseName, id),
    queryFn: () => getScopedCard(databaseName, id!),
    enabled: id != null && Boolean(databaseName),
  });
}

/* ---------- 变更（单卡并入缓存，不整域失效） ---------- */

export function useCardsMutations() {
  const databaseName = useSettingStore(state => state.setting.database.active);
  const queryClient = useQueryClient();
  const assertActive = () => {
    if (
      useSettingStore.getState().setting.database.active !== databaseName ||
      useGlobalStateStore.getState().databaseStatus[databaseName] !== "ready"
    ) {
      throw new Error("数据库已切换或尚未就绪");
    }
  };
  const changed = (card: ICard, event: "card:created" | "card:updated") => {
    mergeCardIntoCache(queryClient, databaseName, card, "upsert");
    if (useSettingStore.getState().setting.database.active === databaseName) {
      defaultCardEventBus.createEditor().publishCardEvent(event, card);
    }
  };
  const patch = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: CardMetadataPatch }) => {
      assertActive();
      return patchScopedCard(databaseName, id, patch);
    },
    onSuccess: card => changed(card, "card:updated"),
    onError: () => toast.error("卡片保存失败"),
  });
  const create = useMutation({
    mutationFn: (card: ICreateCard) => {
      assertActive();
      return createScopedCard(databaseName, card);
    },
    onSuccess: card => changed(card, "card:created"),
  });

  const toggleTop = useMutation({
    mutationFn: ({ card, isTop }: { card: ICard; isTop: boolean }) =>
      patch.mutateAsync({ id: card.id, patch: { isTop } }),
  });
  const changeCategory = useMutation({
    mutationFn: ({ card, category }: { card: ICard; category: ECardCategory }) =>
      patch.mutateAsync({ id: card.id, patch: { category } }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => {
      assertActive();
      return deleteScopedCard(databaseName, id);
    },
    onSuccess: (_count, id) => {
      const card = queryClient
        .getQueryData<ICard[]>(cardsKey(databaseName))
        ?.find(card => card.id === id);
      if (card) mergeCardIntoCache(queryClient, databaseName, card, "deleted");
      if (card && useSettingStore.getState().setting.database.active === databaseName) {
        defaultCardEventBus.createEditor().publishCardEvent("card:deleted", card);
      }
    },
  });
  return { toggleTop, changeCategory, remove, patch, create };
}

/* ---------- 派生 ---------- */

/** 置顶优先 → 创建时间降序（旧版排序口径） */
export function sortCards(cards: ICard[]): ICard[] {
  return [...cards].sort(
    (a, b) => Number(b.isTop) - Number(a.isTop) || b.create_time - a.create_time
  );
}

/** 分类与标签过滤后，按置顶优先、创建时间降序排列。 */
export function filterCards(cards: ICard[], filter: CardFilter): ICard[] {
  const filtered = cards.filter(card => {
    if (filter.category !== "all" && card.category !== filter.category) return false;
    if (filter.tag && !card.tags.some(t => t === filter.tag || t.startsWith(filter.tag + "/")))
      return false;
    return true;
  });
  return sortCards(filtered);
}

/** 置顶之外的卡片按创建时间归段（今天/昨天/本周/本月/更早） */
export function bucketByTimeGroups(cards: ICard[]): CardTimeGroup[] {
  const buckets = new Map<CardTimeGroupKey, ICard[]>();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const card of cards) {
    if (card.isTop) continue;
    const key = timeGroupKey(card.create_time, startOfToday);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(card);
    else buckets.set(key, [card]);
  }
  const order: CardTimeGroupKey[] = ["today", "yesterday", "week", "month", "earlier"];
  const labels: Record<CardTimeGroupKey, string> = {
    today: "今天",
    yesterday: "昨天",
    week: "本周",
    month: "本月",
    earlier: "更早",
  };
  return order
    .map(key => ({ key, label: labels[key], cards: buckets.get(key) ?? [] }))
    .filter(group => group.cards.length > 0);
}

function timeGroupKey(ts: number, startOfToday: number): CardTimeGroupKey {
  const today = new Date(startOfToday);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const week = startOfWeek(today);
  const month = new Date(today.getFullYear(), today.getMonth(), 1);
  if (ts >= startOfToday) return "today";
  if (ts >= yesterday.getTime()) return "yesterday";
  if (ts >= week.getTime()) return "week";
  if (ts >= month.getTime()) return "month";
  return "earlier";
}

/** 层级标签树：`a/b` 按段拆层，计数含后代（左树与旧版前缀过滤同口径） */
export function buildTagTree(cards: ICard[]): CardTagNode[] {
  const root: CardTagNode = { path: "", name: "", count: 0, children: [] };
  const findOrCreate = (parent: CardTagNode, name: string) => {
    let child = parent.children.find(node => node.name === name);
    if (!child) {
      child = { path: parent.path ? `${parent.path}/${name}` : name, name, count: 0, children: [] };
      parent.children.push(child);
    }
    return child;
  };
  for (const card of cards) {
    const countedPaths = new Set<string>();
    for (const tag of card.tags) {
      let node = root;
      for (const segment of tag.split("/")) {
        node = findOrCreate(node, segment);
        if (!countedPaths.has(node.path)) {
          node.count += 1;
          countedPaths.add(node.path);
        }
      }
    }
  }
  const sortTree = (nodes: CardTagNode[]): CardTagNode[] =>
    nodes
      .map(node => ({ ...node, children: sortTree(node.children) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
  return sortTree(root.children);
}
