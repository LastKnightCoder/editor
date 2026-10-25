/**
 * 伴读写入当前库的数据：网页标注即「web」来源的摘录（与知识库的划线、索引、谱系同一份），
 * 页面笔记（编辑器原生节点）存为一张新卡片（正文末尾附来源链接）。写完补发写事件，索引与脉络按既有链路刷新。
 */
import { basename } from "node:path";
import type Database from "better-sqlite3";
import type { IContent } from "@/types/content";
import {
  HIGHLIGHT_COLORS,
  LIBRARY_PAGE_LIMIT,
  LIBRARY_SORTS,
  type HighlightColor,
  type LibraryFeedItem,
  type LibraryList,
  type LibrarySite,
  type LibrarySort,
  type NoteSaveParams,
  type WebAnchor,
  type WebAnnotation,
  type WebPageSummary,
} from "@tau/shared/browser-companion";
import { WEB_EXCERPT_SOURCE, type Excerpt } from "@/entity/excerpt/types";
import { normalizeWebPageUrl, parseWebPagePayload, WEB_PAGE_LIMITS } from "@/entity/excerpt/web";
import databaseModule from "../database";
import { broadcastDatabaseChange } from "../database-notifications";
import ExcerptTable, { WEB_EXCERPT_SYNCED_EVENT } from "../tables/excerpt";
import CardTable from "../tables/card";
import WebPageTable from "../tables/web-page";
import { contentExecutor } from "../../services/content-execution";
import { assertContentNodes } from "@tau/plugins/content-input";

/** 笔记节点序列化后的上限 */
const NOTE_MAX_BYTES = 2 * 1024 * 1024;

function currentDatabase(): Database.Database {
  const db = databaseModule.getCurrentDatabase();
  if (!db?.open) throw new Error("Tau 还没有打开知识库");
  return db;
}

/** 早期网页划线存的是别的色名与 XPath 锚点：颜色归到黄色，锚点置空（扩展按原文重新定位） */
const toHighlightColor = (color: string | null): HighlightColor =>
  (HIGHLIGHT_COLORS as readonly string[]).includes(color ?? "")
    ? (color as HighlightColor)
    : "yellow";

const toWebAnchor = (anchor: unknown): WebAnchor | null => {
  const value = anchor as Partial<WebAnchor> | null;
  return typeof value?.quote?.exact === "string" && typeof value.position?.start === "number"
    ? (value as WebAnchor)
    : null;
};

const toAnnotation = (row: Excerpt): WebAnnotation => ({
  id: row.externalId,
  color: toHighlightColor(row.color),
  text: row.quote,
  note: row.note,
  anchor: toWebAnchor(row.anchor),
  createdAt: row.sourceTime ?? row.createTime,
});

const requirePageUrl = (url: unknown): string => {
  const pageUrl = normalizeWebPageUrl(url as string);
  if (!pageUrl) throw new Error("url 必须是 http(s) 地址");
  return pageUrl;
};

export function listAnnotations(url: unknown): WebAnnotation[] {
  return ExcerptTable.listWebPage(currentDatabase(), requirePageUrl(url)).map(toAnnotation);
}

/** 写入时 source_title 用页面显示名：用户起过名就一直用它，网页标题只记进 web_page */
export function syncAnnotations(payload: unknown): { ok: true } {
  const db = currentDatabase();
  const { url, title, inputs } = parseWebPagePayload(payload);
  db.transaction(() => {
    ExcerptTable.syncSource(
      db,
      WEB_EXCERPT_SOURCE,
      url,
      WebPageTable.touch(db, url, title),
      inputs
    );
  })();
  databaseModule.notifyExternalWrite(WEB_EXCERPT_SYNCED_EVENT);
  return { ok: true };
}

// ———————— 伴读库 ————————

const record = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

const paging = (value: Record<string, unknown>) => ({
  offset:
    Number.isSafeInteger(value.offset) && (value.offset as number) > 0
      ? (value.offset as number)
      : 0,
  limit:
    Number.isSafeInteger(value.limit) && (value.limit as number) > 0
      ? Math.min(value.limit as number, LIBRARY_PAGE_LIMIT)
      : LIBRARY_PAGE_LIMIT,
});

const optionalText = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : undefined;

export function listLibraryPages(raw: unknown): LibraryList<WebPageSummary> {
  const value = record(raw);
  return WebPageTable.listPages(currentDatabase(), {
    ...paging(value),
    sort: (LIBRARY_SORTS as readonly unknown[]).includes(value.sort)
      ? (value.sort as LibrarySort)
      : "recent",
    query: optionalText(value.query),
    host: optionalText(value.host),
    url: value.url === undefined ? undefined : requirePageUrl(value.url),
    noted: value.noted === true,
  });
}

export function listLibrarySites(): LibrarySite[] {
  return WebPageTable.listSites(currentDatabase());
}

export function listLibraryFeed(raw: unknown): LibraryList<LibraryFeedItem> {
  const value = record(raw);
  const color = (HIGHLIGHT_COLORS as readonly unknown[]).includes(value.color)
    ? (value.color as HighlightColor)
    : undefined;
  const { items, total } = WebPageTable.listFeed(currentDatabase(), {
    ...paging(value),
    color,
    noted: value.noted === true,
    query: optionalText(value.query),
  });
  return {
    items: items.map(row => ({
      ...toAnnotation(row),
      url: row.sourceKey,
      title: row.sourceTitle,
    })),
    total,
  };
}

/** 给页面起名；空串恢复网页标题。改完补发摘录写事件，索引里的来源名随之刷新 */
export function renameLibraryPage(raw: unknown): WebPageSummary {
  const value = record(raw);
  const url = requirePageUrl(value.url);
  if (typeof value.title !== "string") throw new Error("title 必须是字符串");
  const title = value.title.trim().slice(0, WEB_PAGE_LIMITS.titleChars);
  const page = WebPageTable.rename(currentDatabase(), url, title || null);
  databaseModule.notifyExternalWrite(WEB_EXCERPT_SYNCED_EVENT);
  return page;
}

const text = (value: string) => ({ type: "formatted", text: value });

/** 来源行：「来源：<网页标题>」，标题是指向网页的链接 */
const sourceParagraph = (title: string, url: string) => ({
  type: "paragraph",
  children: [text("来源："), { type: "link", url, children: [text(title)] }, text("")],
});

const isBlankNode = (node: unknown): boolean => {
  const value = node as { text?: unknown; children?: unknown[] };
  if (typeof value.text === "string") return !value.text.trim();
  return Array.isArray(value.children) && value.children.every(isBlankNode);
};

export async function saveNote(raw: unknown): Promise<{ cardId: number }> {
  const params = raw as Partial<NoteSaveParams>;
  const url = normalizeWebPageUrl(params?.url as string);
  if (!url) throw new Error("url 必须是 http(s) 地址");
  const content: unknown = params.content;
  assertContentNodes(content);
  if (JSON.stringify(content).length > NOTE_MAX_BYTES) throw new Error("笔记太长了");
  // 只有全是空段落才算空（分割线、代码块等没有文字也是内容）
  if (content.every(node => (node as { type?: string }).type === "paragraph" && isBlankNode(node)))
    throw new Error("笔记是空的");
  const pageTitle =
    typeof params.title === "string" && params.title.trim()
      ? params.title.trim().slice(0, WEB_PAGE_LIMITS.titleChars)
      : url;
  // 用户给这个页面起过名时，来源段用起的名
  const title = WebPageTable.displayTitle(currentDatabase(), url) || pageTitle;

  const document = (await contentExecutor.execute({
    operation: "prepare-content",
    input: { nodes: [...structuredClone(content), sourceParagraph(title, url)] as never },
  })) as Pick<IContent, "content" | "contracts">;
  // 转换是异步的，回来后库可能已切换或关闭
  const db = currentDatabase();
  // 字数由正文写入时重算，这里的 count 只是占位
  const card = CardTable.createCard(db, { ...document, count: 0, tags: [], isTop: false });
  databaseModule.notifyExternalWrite("create-card");
  broadcastDatabaseChange("card:updated", basename(db.name), { cardId: card.id });
  return { cardId: card.id };
}
