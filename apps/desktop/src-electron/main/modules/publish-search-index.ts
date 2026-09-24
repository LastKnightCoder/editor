import Fuse, { type IFuseOptions } from "fuse.js";
import type { Descendant } from "slate";

import type { IArticle } from "@/types/article";
import type { ICard } from "@/types/card";
import type {
  IPublishSearchIndexPayload,
  IPublishSearchItem,
  IPublishSearchItemType,
} from "@/types/publish";
import { getMarkdown } from "@/utils/markdown.ts";

export interface IPublishSearchDocEntry {
  id: number;
  title: string;
  summary: string;
  href: string;
  createTime: number;
  updateTime: number;
  tags: string[];
  kind: "project";
  content: Descendant[];
}

export interface IPublishSearchQuestEntry {
  id: number;
  title: string;
  summary: string;
  href: string;
  groupTitle: string;
  answers: Array<{
    content?: Descendant[];
  }>;
  description?: Descendant[];
  createTime: number;
  updateTime: number;
}

export interface BuildPublishSearchIndexInput {
  cards: ICard[];
  articles: IArticle[];
  docs: IPublishSearchDocEntry[];
  quests: IPublishSearchQuestEntry[];
  generatedAt?: number;
}

export const PUBLISH_SEARCH_INDEX_PATH = "search-index.json";
export const PUBLISH_SEARCH_INDEX_HREF = "/search-index.json";

export const PUBLISH_SEARCH_OPTIONS: IFuseOptions<IPublishSearchItem> = {
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

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function serializeContent(content?: Descendant[]): string {
  if (!content || content.length === 0) {
    return "";
  }
  return compactText(getMarkdown(content));
}

function truncate(text: string, maxLength: number): string {
  const normalized = compactText(text);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function firstMarkdownLine(markdown: string): string {
  return (
    markdown
      .split(/\r?\n/)
      .map(line => line.replace(/^#+\s*/, "").trim())
      .find(line => line.length > 0) || ""
  );
}

function createItem(
  item: Omit<IPublishSearchItem, "typeLabel"> & {
    type: IPublishSearchItemType;
  }
): IPublishSearchItem {
  const typeLabels: Record<IPublishSearchItemType, string> = {
    card: "卡片",
    article: "文章",
    "project-doc": "项目文档",
    quest: "求索录",
  };

  return {
    ...item,
    title: item.title.trim(),
    summary: item.summary.trim(),
    content: item.content.trim(),
    tags: item.tags.map(tag => tag.trim()).filter(Boolean),
    typeLabel: typeLabels[item.type],
  };
}

function buildCardSearchItem(card: ICard): IPublishSearchItem {
  const rawMarkdown = getMarkdown(card.content || []);
  const content = compactText(rawMarkdown);
  const summary = truncate(content, 120);
  const title = firstMarkdownLine(rawMarkdown) || summary || `卡片 #${card.id}`;

  return createItem({
    id: card.id,
    type: "card",
    title,
    summary,
    content,
    tags: card.tags || [],
    href: `/cards/${card.id}.html`,
    createTime: card.create_time,
    updateTime: card.update_time,
  });
}

function buildArticleSearchItem(article: IArticle): IPublishSearchItem {
  const content = serializeContent(article.content || []);

  return createItem({
    id: article.id,
    type: "article",
    title: article.title || `文章 #${article.id}`,
    summary: truncate(content, 120),
    content,
    tags: article.tags || [],
    href: `/articles/${article.id}.html`,
    createTime: article.create_time,
    updateTime: article.update_time,
  });
}

export function getDocSearchType(
  _kind: IPublishSearchDocEntry["kind"]
): Extract<IPublishSearchItemType, "project-doc"> {
  return "project-doc";
}

function buildDocSearchItem(entry: IPublishSearchDocEntry): IPublishSearchItem {
  const content = serializeContent(entry.content || []);

  return createItem({
    id: entry.id,
    type: getDocSearchType(entry.kind),
    title: entry.title || `文档 #${entry.id}`,
    summary: entry.summary || truncate(content, 120),
    content,
    tags: entry.tags || [],
    href: entry.href,
    createTime: entry.createTime,
    updateTime: entry.updateTime,
  });
}

function buildQuestSearchItem(entry: IPublishSearchQuestEntry): IPublishSearchItem {
  const description = serializeContent(entry.description || []);
  const answers = entry.answers
    .map(answer => serializeContent(answer.content || []))
    .filter(Boolean);
  const content = compactText([entry.title, entry.summary, description, ...answers].join(" "));

  return createItem({
    id: entry.id,
    type: "quest",
    title: entry.title || `求索 #${entry.id}`,
    summary: entry.summary || truncate(content, 120),
    content,
    tags: [entry.groupTitle],
    href: entry.href,
    createTime: entry.createTime,
    updateTime: entry.updateTime,
  });
}

export function buildPublishSearchItems({
  cards,
  articles,
  docs,
  quests,
}: BuildPublishSearchIndexInput): IPublishSearchItem[] {
  return [
    ...cards.map(buildCardSearchItem),
    ...articles.map(buildArticleSearchItem),
    ...docs.map(buildDocSearchItem),
    ...quests.map(buildQuestSearchItem),
  ].sort((a, b) => b.updateTime - a.updateTime || b.createTime - a.createTime);
}

export function buildPublishSearchIndexPayload(
  input: BuildPublishSearchIndexInput
): IPublishSearchIndexPayload {
  const items = buildPublishSearchItems(input);
  const index = Fuse.createIndex(PUBLISH_SEARCH_OPTIONS.keys || [], items);

  return {
    version: 1,
    generatedAt: input.generatedAt ?? Date.now(),
    options: PUBLISH_SEARCH_OPTIONS as Record<string, unknown>,
    items,
    index: index.toJSON(),
  };
}
