/**
 * 搜索面板数据源：正文、实体名称与文档待办分别查询，失败时保留其他来源的结果。
 * 输入防抖由调用方承担；同库连续输入保留上一批结果，开关面板时重读。
 *
 * 展示文案与移动端 unified_search 同构（utils/richTextText）：Slate 提纯文本拼接
 * + 截断；卡片无 title 字段时正文开头作标题、余文作摘要，空内容兜底「类型 #id」。
 */

import { useMemo } from "react";
import type { Translator } from "@tau/i18n";
import { useSearchI18n, searchTranslator, type SearchMessageKey } from "./i18n";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { searchHybridContent } from "@/commands/fts";
import { searchCatalog } from "@/commands/entity";
import { taskAssistantRequest } from "@/commands/task-assistant";
import { useDatabaseCommands } from "@/hooks/useDatabaseCommands";
import { databaseQueryKey } from "@/services/command-context";
import { richTextPlainText, clampText } from "@tau/shared/rich-text-text";
import type { AssistantQueryResult, AssistantTask } from "@tau/shared/task-assistant";
import { resolveEmbeddingModelInfoFromSetting } from "@/utils/embedding-model-info";
import useSettingStore from "@/stores/useSettingStore";
import { CONTENT_TYPES, isCatalogSearchType, type PaletteSearchType } from "./searchMeta";
import type { IndexType, SearchResult } from "@/types";
import {
  CATALOG_SEARCH_TYPES,
  type CatalogSearchResult,
  type DocumentTaskSearchResult,
} from "@/types/search";

export type PaletteSearchResult = SearchResult | CatalogSearchResult | DocumentTaskSearchResult;
interface SearchBatch {
  items: PaletteSearchResult[];
  warnings: string[];
  failures?: SearchFailure[];
}

export interface SearchFailure {
  source: "content" | "catalog" | "document-task";
  reason: string | null;
}
class SearchFailureError extends Error {
  constructor(readonly failures: SearchFailure[]) {
    super(failures.map(failure => `${failure.source}: ${failure.reason ?? ""}`).join("; "));
  }
}
export function searchFailureText(
  failure: SearchFailure,
  t: Translator<SearchMessageKey>["t"] = searchTranslator.t
): string {
  return t("source.failed", {
    source: t(`source.${failure.source}`),
    reason: failure.reason ?? t("source.retry"),
  });
}
export function searchErrorText(error: unknown): string {
  return error instanceof SearchFailureError
    ? error.failures.map(failure => searchFailureText(failure)).join("; ")
    : error instanceof Error
      ? error.message
      : "";
}

const RESULT_LIMIT = 24;
const SEARCH_COMMANDS = { searchHybridContent, searchCatalog, taskAssistantRequest };

export function useSearchContent(query: string, types?: PaletteSearchType[], enabled = true) {
  const { t } = useSearchI18n();
  const database = useSettingStore(state => state.setting.database.active);
  const { commands, connectionId } = useDatabaseCommands(SEARCH_COMMANDS, database);
  const result = useQuery({
    queryKey: databaseQueryKey(
      ["search", "content", database, query, types ?? "all"],
      connectionId
    ),
    queryFn: async (): Promise<SearchBatch> => {
      const contentTypes = types?.filter(
        (type): type is IndexType => type !== "document-task" && !isCatalogSearchType(type)
      );
      const catalogTypes = types?.filter(isCatalogSearchType);
      const requests: Array<{ source: SearchFailure["source"]; promise: Promise<SearchBatch> }> =
        [];
      if (!contentTypes || contentTypes.length) {
        const modelInfo = resolveEmbeddingModelInfoFromSetting(useSettingStore.getState().setting);
        requests.push({
          source: "content",
          promise: commands
            .searchHybridContent({
              query,
              types: contentTypes,
              limit: RESULT_LIMIT,
              modelInfo,
            })
            .then(items => ({ items, warnings: [] })),
        });
      }
      if (!catalogTypes || catalogTypes.length) {
        requests.push({
          source: "catalog",
          promise: commands
            .searchCatalog({
              keyword: query,
              types: catalogTypes ?? [...CATALOG_SEARCH_TYPES],
              limit: RESULT_LIMIT,
            })
            .then(items => ({ items, warnings: [] })),
        });
      }
      if (!types || types.includes("document-task")) {
        requests.push({
          source: "document-task",
          promise: commands
            .taskAssistantRequest<AssistantQueryResult<AssistantTask>>(
              "task-assistant:read",
              [
                "query_todos",
                {
                  keyword: query,
                  source: "document",
                  archived: false,
                  sort: "updatedAt",
                  pageSize: RESULT_LIMIT,
                },
              ],
              database
            )
            .then(response => ({
              items: response.items.flatMap(task =>
                task.taskRef.kind === "document" && task.sourceRef
                  ? [
                      {
                        type: "document-task" as const,
                        id: `${task.taskRef.contentId}:${task.taskRef.taskId}`,
                        title: task.title,
                        snippet: task.sourceTitle ?? "",
                        completed: task.completed,
                        sourceRef: task.sourceRef,
                        taskId: task.taskRef.taskId,
                      },
                    ]
                  : []
              ),
              warnings: response.warnings,
            })),
        });
      }
      const settled = await Promise.allSettled(requests.map(request => request.promise));
      const batches: SearchBatch[] = [];
      const failures: SearchFailure[] = [];
      settled.forEach((response, index) => {
        if (response.status === "fulfilled") batches.push(response.value);
        else
          failures.push({
            source: requests[index].source,
            reason: response.reason instanceof Error ? response.reason.message : null,
          });
      });
      if (requests.length && !batches.length) throw new SearchFailureError(failures);
      // 名称与任务命中优先，正文保留检索管线给出的相关性顺序。
      return {
        items: batches
          .flatMap(batch => batch.items)
          .sort((a, b) => Number("content" in a) - Number("content" in b)),
        warnings: batches.flatMap(batch => batch.warnings),
        failures,
      };
    },
    enabled: enabled && query.trim().length > 0,
    staleTime: 0,
    placeholderData: (previous, previousQuery) => {
      const scope = previousQuery?.queryKey.at(-1);
      const previousConnection =
        scope && typeof scope === "object" && "connectionId" in scope
          ? scope.connectionId
          : undefined;
      return previousQuery?.queryKey[2] === database && previousConnection === connectionId
        ? keepPreviousData(previous)
        : undefined;
    },
  });
  const warnings = useMemo(
    () => [
      ...(result.data?.failures ?? []).map(failure => searchFailureText(failure, t)),
      ...(result.data?.warnings ?? []),
    ],
    [result.data, t]
  );
  const warningKey = JSON.stringify([result.data?.failures, result.data?.warnings]);
  return { ...result, data: result.data?.items, warnings, warningKey };
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
    const label = CONTENT_TYPES[result.type]?.label ?? searchTranslator.t("type.content");
    return {
      title: searchTranslator.t("result.fallback", { type: label, id: result.contentId }),
      snippet: "",
    };
  }
  const title = clampText(plain, maxTitle);
  const rest = plain.length > maxTitle ? plain.slice(maxTitle).trim() : "";
  return { title, snippet: clampText(rest, maxSnippet) };
}

export function relativeTime(ts: number, locale = desktopLocaleSource.getSnapshot()): string {
  const days = Math.floor(
    (new Date(new Date().toDateString()).getTime() -
      new Date(new Date(ts).toDateString()).getTime()) /
      86_400_000
  );
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: days <= 1 ? "auto" : "always" });
  if (days <= 0) return relative.format(0, "day");
  if (days === 1) return relative.format(-1, "day");
  if (days < 30) return relative.format(-days, "day");
  if (days < 365) return relative.format(-Math.floor(days / 30), "month");
  return relative.format(-Math.floor(days / 365), "year");
}
