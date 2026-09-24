import Fuse, { type FuseResult, type IFuseOptions } from "fuse.js";

import type {
  ArticleData,
  CardData,
  DocData,
  InitData,
  ListData,
  QuestData,
  SearchIndexPayload,
  SearchItem,
} from "@blog/types";
import { getPlainText, truncate } from "@blog/utils";

export const SEARCH_RECENT_QUERIES_KEY = "blog:search:recent-queries";
export const SEARCH_RECENT_QUERIES_LIMIT = 5;
export const SEARCH_RESULT_LIMIT = 12;
export const BLOG_DEV_SEARCH_INDEX_HREF = "/__blog-dev-search-index.json";

export const BLOG_SEARCH_OPTIONS: IFuseOptions<SearchItem> = {
  includeMatches: true,
  includeScore: true,
  threshold: 0.35,
  ignoreLocation: true,
  minMatchCharLength: 1,
  keys: [
    { name: "title", weight: 0.42 },
    { name: "tags", weight: 0.2 },
    { name: "typeLabel", weight: 0.12 },
    { name: "summary", weight: 0.16 },
    { name: "content", weight: 0.1 },
  ],
};

type SerializedFuseIndex = Parameters<typeof Fuse.parseIndex<SearchItem>>[0];

export type BlogSearchResult = FuseResult<SearchItem>;

export interface BlogSearchIndex {
  payload: SearchIndexPayload;
  search: (query: string) => BlogSearchResult[];
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

export function readRecentSearchQueries(): string[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  try {
    const parsed = JSON.parse(storage.getItem(SEARCH_RECENT_QUERIES_KEY) || "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((query): query is string => typeof query === "string")
      .map(normalizeQuery)
      .filter(Boolean)
      .slice(0, SEARCH_RECENT_QUERIES_LIMIT);
  } catch {
    return [];
  }
}

export function saveRecentSearchQuery(query: string): string[] {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    return readRecentSearchQueries();
  }

  const nextQueries = [
    normalized,
    ...readRecentSearchQueries().filter(item => item !== normalized),
  ].slice(0, SEARCH_RECENT_QUERIES_LIMIT);

  const storage = getStorage();
  if (storage) {
    storage.setItem(SEARCH_RECENT_QUERIES_KEY, JSON.stringify(nextQueries));
  }

  return nextQueries;
}

export function clearRecentSearchQueries(): void {
  const storage = getStorage();
  storage?.removeItem(SEARCH_RECENT_QUERIES_KEY);
}

function isSerializedFuseIndex(index: unknown): index is SerializedFuseIndex {
  return (
    Boolean(index) &&
    typeof index === "object" &&
    Array.isArray((index as SerializedFuseIndex).keys) &&
    Array.isArray((index as SerializedFuseIndex).records)
  );
}

function createSearchPayload(items: SearchItem[]): SearchIndexPayload {
  return {
    version: 1,
    generatedAt: Date.now(),
    options: BLOG_SEARCH_OPTIONS as Record<string, unknown>,
    items,
    index: Fuse.createIndex(BLOG_SEARCH_OPTIONS.keys || [], items).toJSON(),
  };
}

function createItem(item: SearchItem): SearchItem {
  return {
    ...item,
    title: item.title.trim(),
    summary: item.summary.trim(),
    content: item.content.trim(),
    tags: item.tags.map(tag => tag.trim()).filter(Boolean),
  };
}

function buildDevSearchPayload(): SearchIndexPayload {
  const initDataList = collectDevInitData();
  const seen = new Set<string>();
  const items: SearchItem[] = [];

  initDataList.forEach(initData => {
    const content = initData.content;

    if (isCardData(content)) {
      const body = getPlainText(content.content || []);
      items.push(
        createItem({
          id: content.id,
          type: "card",
          typeLabel: "卡片",
          title: firstLine(body) || truncate(content.tags.join(" "), 40),
          summary: truncate(body, 120),
          content: body,
          tags: content.tags || [],
          href: `/cards/${content.id}`,
          createTime: content.createTime,
          updateTime: content.updateTime,
        })
      );
      return;
    }

    if (isArticleData(content)) {
      const body = getPlainText(content.content || []);
      items.push(
        createItem({
          id: content.id,
          type: "article",
          typeLabel: "文章",
          title: content.title,
          summary: truncate(body, 120),
          content: body,
          tags: content.tags || [],
          href: `/articles/${content.id}`,
          createTime: content.createTime,
          updateTime: content.updateTime,
        })
      );
      return;
    }

    if (isDocData(content)) {
      const body = getPlainText(content.content || []);
      items.push(
        createItem({
          id: content.id,
          type: "project-doc",
          typeLabel: "项目文档",
          title: content.title,
          summary: truncate(body, 120),
          content: body,
          tags: [],
          href: content.currentPath || `/docs/${content.id}`,
          createTime: content.createTime,
          updateTime: content.updateTime,
        })
      );
      return;
    }

    if (isQuestData(content)) {
      const body = [
        content.summary,
        getPlainText(content.description || []),
        ...content.answers.map(answer => getPlainText(answer.content || [])),
      ].join(" ");
      items.push(
        createItem({
          id: content.id,
          type: "quest",
          typeLabel: "求索录",
          title: content.title,
          summary: content.summary || truncate(body, 120),
          content: body,
          tags: [content.groupTitle],
          href: content.href,
          createTime: content.createTime,
          updateTime: content.updateTime,
        })
      );
      return;
    }

    if (isListData(content)) {
      content.items.forEach(listItem => {
        const type = content.type === "doc" ? ("project-doc" as const) : content.type;
        const typeLabel = getTypeLabel(type);
        items.push(
          createItem({
            id: listItem.id,
            type,
            typeLabel,
            title: listItem.title || listItem.summary,
            summary: listItem.summary,
            content: listItem.summary,
            tags: listItem.tags || [],
            href: listItem.href,
            createTime: listItem.createTime,
            updateTime: listItem.updateTime || listItem.createTime,
          })
        );
      });
    }
  });

  const uniqueItems = items.filter(item => {
    const key = `${item.type}:${item.id}:${item.href}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  return createSearchPayload(uniqueItems);
}

async function loadDevSearchIndex(): Promise<BlogSearchIndex> {
  const payload = buildDevSearchPayload();
  const index = Fuse.parseIndex<SearchItem>(payload.index as SerializedFuseIndex);
  const fuse = new Fuse(payload.items, BLOG_SEARCH_OPTIONS, index);

  return {
    payload,
    search: (query: string) =>
      fuse.search(query, {
        limit: SEARCH_RESULT_LIMIT,
      }),
  };
}

export async function loadBlogSearchIndex(href: string): Promise<BlogSearchIndex> {
  // @ts-ignore - import.meta.env.DEV 是 Vite 提供的
  if (import.meta.env.DEV && href.endsWith(BLOG_DEV_SEARCH_INDEX_HREF)) {
    return loadDevSearchIndex();
  }

  const response = await fetch(href);
  if (!response.ok) {
    throw new Error(`加载搜索索引失败: ${response.status}`);
  }

  const payload = (await response.json()) as SearchIndexPayload;
  if (
    payload.version !== 1 ||
    !Array.isArray(payload.items) ||
    !isSerializedFuseIndex(payload.index)
  ) {
    throw new Error("搜索索引格式无效");
  }

  const index = Fuse.parseIndex<SearchItem>(payload.index);
  const fuse = new Fuse(payload.items, BLOG_SEARCH_OPTIONS, index);

  return {
    payload,
    search: (query: string) =>
      fuse.search(query, {
        limit: SEARCH_RESULT_LIMIT,
      }),
  };
}

function firstLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(Boolean) || ""
  );
}

function isCardData(content: InitData["content"]): content is CardData {
  return "category" in content && "content" in content && Array.isArray(content.content);
}

function isArticleData(content: InitData["content"]): content is ArticleData {
  return "author" in content && "title" in content && "content" in content;
}

function isDocData(content: InitData["content"]): content is DocData {
  return "breadcrumb" in content && "title" in content && "content" in content;
}

function isQuestData(content: InitData["content"]): content is QuestData {
  return "answers" in content && "groupTitle" in content && "status" in content;
}

function isListData(content: InitData["content"]): content is ListData {
  return "items" in content && Array.isArray(content.items) && "type" in content;
}

function getTypeLabel(type: SearchItem["type"]): string {
  const labels: Record<SearchItem["type"], string> = {
    card: "卡片",
    article: "文章",
    "project-doc": "项目文档",
    quest: "求索录",
  };
  return labels[type];
}

function collectDevInitData(): InitData[] {
  const mockWindow = window as typeof window & {
    __BLOG_DEV_MOCK_DATA__?: InitData[];
  };
  if (mockWindow.__BLOG_DEV_MOCK_DATA__) {
    return mockWindow.__BLOG_DEV_MOCK_DATA__;
  }
  return [window._INIT_DATA_].filter(Boolean);
}
