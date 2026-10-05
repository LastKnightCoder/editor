/**
 * 文章页数据源：月刊形态（A3 定稿，mockups/articles/plan-a3-journal.html）。
 * - 列表：getArticlePage 分页窗口（轻量条目，不取正文全文）+ useInfiniteQuery
 *   承载无限滚动；网格按月归段的展示分组是纯前端派生（分桶不断数据流，翻页与分段解耦），
 *   列表排布平铺，排序下推到主进程（D-105）。
 * - 筛选：标签（侧栏子项）+ 标题关键词（页内搜索框）都下推到 getArticlePage，
 *   分页 / 总数 / 字数统计随筛选结果；标签计数 getArticleTagCounts 供侧栏子项。
 * - 变更（置顶/删除/新建/导入）后整域失效重拉。
 */

import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getArticlePage,
  getArticleTagCounts,
  createArticle,
  deleteArticle,
  findOneArticle,
  updateArticleIsTop,
} from "@/commands/article";
import { DEFAULT_ARTICLE_CONTENT } from "@/constants";
import { clampText, richTextPlainText } from "@/utils/richTextText";
import type { ArticlePageItem, ArticlePageSort, IArticle } from "@/types";
import type { ArticleMonthSection } from "./types";

/** 每页条数：网格卡高、列表行矮，列表一页要多取才填得满首屏 */
export const ARTICLE_PAGE_SIZE = { grid: 12, list: 30 } as const;
const DAY_MS = 86_400_000;

/* ---------- 派生 ---------- */

/** 摘要：主进程只回 Slate JSON 前缀（可能截断），渲染端压成纯文本、
 *  上限 100 字（封面三行文字块需要 ~75 字，留出余量）；截断导致
 *  JSON.parse 失败时退化为正则抽取文本片段 */
export function articleExcerpt(raw: string): string {
  if (!raw) return "";
  try {
    return clampText(richTextPlainText(JSON.parse(raw)), 100);
  } catch {
    const texts = [...raw.matchAll(/"text"\s*:\s*"([^"]*)"/g)].map(m => m[1]);
    return clampText(texts.join(" "), 100);
  }
}

export function articleRelativeTime(ts: number): string {
  const days = Math.floor((startOfDay(Date.now()) - startOfDay(ts)) / DAY_MS);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  return `${Math.floor(days / 30)} 个月前`;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 置顶之外的条目按「编辑年月」倒序归段（月刊的滚动时间锚点） */
export function bucketByMonths(items: ArticlePageItem[]): ArticleMonthSection[] {
  const byMonth = new Map<string, ArticleMonthSection>();
  for (const item of items) {
    if (item.isTop) continue;
    const d = new Date(item.updateTime);
    const month = d.getMonth() + 1;
    const key = `${d.getFullYear()}-${month}`;
    let section = byMonth.get(key);
    if (!section) {
      section = { key, year: d.getFullYear(), month, items: [], words: 0 };
      byMonth.set(key, section);
    }
    section.items.push(item);
    section.words += item.words;
  }
  return [...byMonth.values()].sort((a, b) => b.year - a.year || b.month - a.month);
}

/* ---------- 查询 ---------- */

export function useArticleFeed({
  tag,
  keyword,
  sort,
  pageSize,
}: {
  tag: string;
  keyword: string;
  sort: ArticlePageSort;
  pageSize: number;
}): {
  items: ArticlePageItem[];
  total: number;
  totalWords: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  loadMore(): void;
  refresh(): void;
} {
  const query = useInfiniteQuery({
    queryKey: ["articles", "feed", tag, keyword, sort, pageSize],
    queryFn: ({ pageParam }) =>
      getArticlePage(pageParam, pageSize, tag || undefined, keyword || undefined, sort),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    // 换标签 / 搜索词时先留着旧列表，新结果到了再替换：页面不闪回 Loading、搜索框不失焦
    placeholderData: keepPreviousData,
  });
  const pages = query.data?.pages ?? [];
  return {
    items: pages.flatMap(p => p.items),
    total: pages[0]?.total ?? 0,
    totalWords: pages[0]?.totalWords ?? 0,
    hasMore: query.hasNextPage,
    loading: query.isPending,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    refresh: () => void query.refetch(),
  };
}

export function useArticleTagCounts(): {
  tags: { tag: string; count: number }[];
  loading: boolean;
} {
  const query = useQuery({
    queryKey: ["articles", "tag-counts"],
    queryFn: getArticleTagCounts,
    staleTime: 5 * 60_000,
  });
  return { tags: query.data ?? [], loading: query.isPending };
}

/** 文章详情（占位页数据源）：按 id 拉全文条目，编辑器迁移后由此接编辑器 */
export function useArticleDetail(id: number): {
  data: IArticle | null;
  loading: boolean;
} {
  const query = useQuery({
    queryKey: ["articles", "detail", id],
    queryFn: () => findOneArticle(id),
    enabled: Number.isFinite(id),
    staleTime: 60_000,
  });
  return { data: query.data ?? null, loading: query.isPending };
}

/* ---------- 变更 ---------- */

/** 文章域变更：置顶/删除/新建后整域失效（feed + 标签计数一并重拉） */
export function useArticleMutations(): {
  toggleTop(id: number, isTop: boolean): Promise<void>;
  remove(id: number): Promise<void>;
  createDefault(): Promise<ArticlePageItem | null>;
} {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["articles"] });

  return {
    async toggleTop(id, isTop) {
      await updateArticleIsTop(id, isTop);
      invalidate();
    },
    async remove(id) {
      await deleteArticle(id);
      invalidate();
    },
    async createDefault() {
      const article = await createArticle({
        title: "默认文章标题",
        content: DEFAULT_ARTICLE_CONTENT,
        bannerBg: "",
        bannerPosition: "center",
        isTop: false,
        author: "",
        links: [],
        tags: [],
        isDelete: false,
        count: 0,
      });
      invalidate();
      return {
        id: article.id,
        title: article.title,
        author: article.author,
        createTime: article.create_time,
        updateTime: article.update_time,
        tags: article.tags,
        bannerBg: article.bannerBg,
        bannerPosition: article.bannerPosition ?? "center",
        isTop: article.isTop,
        words: article.count,
        excerpt: "",
      };
    },
  };
}
