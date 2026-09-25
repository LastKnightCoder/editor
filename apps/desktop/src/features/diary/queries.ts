/**
 * 日记页数据源（D-044）：一次拉全量扁平条目 + 标签库，渲染期纯函数派生（model.ts）。
 * 数量级：个人碎碎念通常数千条以内、只含正文 JSON，全量轻表足够；渲染侧按天虚拟化。
 *
 * 变更联动：主进程日记表层全部写命令广播 diary:changed（含 AI 工具 / MCP 等其它窗口写入口），
 * 本模块常驻订阅并失效 ["diary"]（按库过滤；侧栏标签子项经 navSlots 依赖本模块，监听随壳层
 * 加载即接线）。本窗口的写入走乐观更新改缓存，另外失效首页 / 统计（字数口径含日记）。
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Descendant } from "slate";
import type { TagColor } from "@tau/ui";
import {
  createDiaryMoment,
  deleteDiarySegment,
  deleteDiaryTagSetting,
  getAllDiarySegmentsFlat,
  getAllDiaryTagSettings,
  updateDiarySegment,
  upsertDiaryTagSetting,
} from "@/commands/diary";
import { on } from "@/electron";
import { queryClient } from "@/queryClient";
import useSettingStore from "@/stores/useSettingStore";
import { searchContent } from "@/utils";
import { resolveEmbeddingModelInfoFromSetting } from "@/utils/embedding-model-info";
import { getContentLength } from "@/utils/helper";
import {
  nextTagColor,
  sortMoments,
  toMoment,
  toTags,
  type DiaryMoment,
  type DiaryTag,
} from "./model";

const SNAPSHOT_KEY = ["diary", "snapshot"] as const;

const hasBridge = typeof window !== "undefined" && Boolean(window.electron);
if (hasBridge) {
  on("diary:changed", (_event, { databaseName }: { databaseName: string }) => {
    const active = useSettingStore.getState().setting.database.active;
    if (databaseName.replace(".db", "") !== active.replace(".db", "")) return;
    void queryClient.invalidateQueries({ queryKey: ["diary"] });
  });
}

export interface DiarySnapshot {
  /** 已按流顺序排好（归属日倒序、同日新在上） */
  moments: DiaryMoment[];
  tags: DiaryTag[];
}

async function fetchSnapshot(): Promise<DiarySnapshot> {
  if (!hasBridge) return { moments: [], tags: [] };
  const [items, settings] = await Promise.all([
    getAllDiarySegmentsFlat(),
    getAllDiaryTagSettings(),
  ]);
  return { moments: sortMoments(items.map(toMoment)), tags: toTags(settings) };
}

export function useDiarySnapshot() {
  const query = useQuery({
    queryKey: SNAPSHOT_KEY,
    queryFn: fetchSnapshot,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  return { snapshot: query.data ?? null, loading: query.isPending };
}

/** 侧栏子项槽「是否有内容」：有条目才展开（空库不挂空子项，navSlots 用） */
export function useDiaryNavHasContent() {
  const { snapshot } = useDiarySnapshot();
  return (snapshot?.moments.length ?? 0) > 0;
}

/* ───────── 写入 ───────── */

function patch(client: QueryClient, fn: (s: DiarySnapshot) => DiarySnapshot) {
  client.setQueryData<DiarySnapshot>(SNAPSHOT_KEY, prev => (prev ? fn(prev) : prev));
}

/** 字数进首页 / 统计口径：本窗口写入不会收到自己的广播，这里补失效 */
function touchDerived(client: QueryClient) {
  void client.invalidateQueries({ queryKey: ["home"] });
  void client.invalidateQueries({ queryKey: ["stats"] });
}

export function useDiaryMutations() {
  const client = useQueryClient();
  // 引用稳定：条目组件 memo 依赖它
  return useMemo(() => createMutations(client), [client]);
}

function createMutations(client: QueryClient) {
  const current = () => client.getQueryData<DiarySnapshot>(SNAPSHOT_KEY);

  /** 条目上出现了库里没有的标签名：按轮转色补进标签库（与发布 / 改标签同一路径） */
  const ensureTags = async (names: string[]) => {
    const known = new Set(current()?.tags.map(t => t.name));
    let count = current()?.tags.length ?? 0;
    for (const name of names) {
      if (known.has(name)) continue;
      const color = nextTagColor(count);
      const sort = count++;
      known.add(name);
      patch(client, s => ({ ...s, tags: [...s.tags, { name, color, sort }] }));
      await upsertDiaryTagSetting({ name, color, sort });
    }
  };

  return {
    async create(input: { day: string; content: Descendant[]; tags: string[] }) {
      await ensureTags(input.tags);
      const item = await createDiaryMoment({
        date: input.day,
        content: input.content,
        tags: input.tags,
      });
      const moment = toMoment(item);
      patch(client, s => ({ ...s, moments: sortMoments([moment, ...s.moments]) }));
      touchDerived(client);
      return moment;
    },

    /** 正文落库（编辑器节流回调）；协作会话持有内容时主进程只同步字数与时间 */
    async updateContent(id: number, content: Descendant[]) {
      const seg = await updateDiarySegment({ segmentId: id, content });
      if (!seg) return;
      // 正文以本端刚发出的为准：挂协作会话时主进程不写正文（会话异步投影落库），
      // 返回的 seg.content / wordCount 可能还是旧的——拿它回填会让只读渲染显示改前内容
      patch(client, s => ({
        ...s,
        moments: s.moments.map(m =>
          m.id === id
            ? { ...m, content, words: getContentLength(content), updateTime: seg.updateTime }
            : m
        ),
      }));
      touchDerived(client);
    },

    async setTags(id: number, tags: string[]) {
      patch(client, s => ({
        ...s,
        moments: s.moments.map(m => (m.id === id ? { ...m, tags } : m)),
      }));
      await ensureTags(tags);
      await updateDiarySegment({ segmentId: id, tags });
    },

    async remove(id: number) {
      patch(client, s => ({ ...s, moments: s.moments.filter(m => m.id !== id) }));
      await deleteDiarySegment(id);
      touchDerived(client);
    },

    async recolor(name: string, color: TagColor) {
      const tag = current()?.tags.find(t => t.name === name);
      const sort = tag?.sort ?? current()?.tags.length ?? 0;
      patch(client, s => ({
        ...s,
        tags: tag
          ? s.tags.map(t => (t.name === name ? { ...t, color } : t))
          : [...s.tags, { name, color, sort }],
      }));
      await upsertDiaryTagSetting({ name, color, sort });
    },

    /** 清理标签：主进程事务级联摘除所有条目上的该标签 */
    async clearTag(name: string) {
      patch(client, s => ({
        tags: s.tags.filter(t => t.name !== name),
        moments: s.moments.map(m =>
          m.tags.includes(name) ? { ...m, tags: m.tags.filter(t => t !== name) } : m
        ),
      }));
      await deleteDiaryTagSetting(name);
    },
  };
}

export type DiaryMutations = ReturnType<typeof createMutations>;

/* ───────── 搜索 ───────── */

/**
 * 混合召回（FTS + 向量，日粒度）：去抖 300ms，返回命中的 diaryId 集合；空查询返回 null。
 * 查询变化即作废上一次（alive 标记），慢请求不会覆盖新结果。
 */
export function useDiarySearch(query: string) {
  const [state, setState] = useState<{ hits: Set<number> | null; searching: boolean }>({
    hits: null,
    searching: false,
  });
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setState({ hits: null, searching: false });
      return;
    }
    setState(prev => ({ ...prev, searching: true }));
    let alive = true;
    const timer = window.setTimeout(async () => {
      const modelInfo = resolveEmbeddingModelInfoFromSetting(useSettingStore.getState().setting);
      const results = await searchContent({
        query: trimmed,
        types: ["diary-daily"],
        limit: 100,
        ...(modelInfo ? { modelInfo } : {}),
      });
      if (alive) setState({ hits: new Set(results.map(r => r.id)), searching: false });
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query]);
  return state;
}

/** 当前时刻（分钟级刷新）：「此刻 HH:mm」与今天的判定 */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
