/**
 * 搜索面板数据源 —— 内容混合检索（复用 legacy 的 searchHybridContent 管线，
 * FTS + 向量多路召回）。输入防抖由调用方（SearchPalette 的 useDebouncedValue）
 * 承担；keepPreviousData 保证连续输入时结果不闪 Loading。
 *
 * 展示文案与移动端 unified_search 同构（utils/richTextText）：Slate 提纯文本拼接
 * + 截断；卡片无 title 字段时正文开头作标题、余文作摘要，空内容兜底「类型 #id」。
 */

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { searchHybridContent } from "@/commands";
import { richTextPlainText, clampText } from "@tau/shared/rich-text-text";
import { resolveEmbeddingModelInfoFromSetting } from "@/utils/embedding-model-info";
import useSettingStore from "@/stores/useSettingStore";
import { CONTENT_TYPES } from "./searchMeta";
import type { IndexType, SearchResult } from "@/types";

/** 一次面板会话最多取回的结果数（分组展示足够，避免全量拉取） */
const RESULT_LIMIT = 24;

export function useSearchContent(query: string, types?: IndexType[]) {
  return useQuery({
    queryKey: ["search", "content", query, types ?? "all"],
    queryFn: async (): Promise<SearchResult[]> => {
      const setting = useSettingStore.getState().setting;
      // 未配置 embedding 时返回 undefined，管线自动只走 FTS 路。
      // 直调命令而非 utils/search 的 searchContent 包装——后者吞错返回 []，
      // 这里需要错误冒泡到 react-query（isError）以触发 toast 反馈
      const modelInfo = resolveEmbeddingModelInfoFromSetting(setting);
      return searchHybridContent({ query, types, limit: RESULT_LIMIT, modelInfo });
    },
    enabled: query.trim().length > 0,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** 无 title 字段时正文开头作标题、余文作摘要（对齐移动端 excerpt 派生） */
export function resultDisplay(
  result: SearchResult,
  maxTitle = 60,
  maxSnippet = 90
): { title: string; snippet: string } {
  const rawTitle = (result.title ?? "").trim();
  if (result.section) {
    return {
      title: clampText(rawTitle || richTextPlainText(result.content), maxTitle),
      snippet: [
        result.section.headingPath ? `› ${result.section.headingPath}` : "",
        clampText(result.section.text, maxSnippet),
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }
  if (rawTitle) {
    return {
      title: clampText(rawTitle, maxTitle),
      snippet: clampText(richTextPlainText(result.content), maxSnippet),
    };
  }
  const plain = richTextPlainText(result.content);
  if (!plain) {
    const label = CONTENT_TYPES[result.type]?.label ?? "内容";
    return { title: `${label} #${result.contentId}`, snippet: "" };
  }
  const title = clampText(plain, maxTitle);
  const rest = plain.length > maxTitle ? plain.slice(maxTitle).trim() : "";
  return { title, snippet: clampText(rest, maxSnippet) };
}

export function relativeTime(ts: number): string {
  const days = Math.floor(
    (new Date(new Date().toDateString()).getTime() -
      new Date(new Date(ts).toDateString()).getTime()) /
      86_400_000
  );
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}
