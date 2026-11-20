import type { Descendant } from "slate";
import type { IArticle } from "@/types/article";
import type { ICard } from "@/types/card";
import type { ContentRef, SearchDocument, SearchFile } from "@tau/plugins/publish-data";
import { contentRef } from "./publish-content-link-targets";
import { getMarkdown } from "@/utils/markdown";
import { unified } from "unified";
import remarkParse from "remark-parse";

export interface IPublishSearchDocEntry {
  id: number;
  entityId: number;
  title: string;
  summary: string;
  target: ContentRef;
  createTime: number;
  updateTime: number;
  tags: string[];
  kind: "project";
  content: Descendant[];
}
export interface BuildPublishSearchIndexInput {
  cards: ICard[];
  articles: IArticle[];
  docs: IPublishSearchDocEntry[];
}
const parser = unified().use(remarkParse);
/** mdast 节点的最小递归形状：只取 walk 用到的 value/type/children */
type PlainTextNode = { type: string; value?: string; children?: PlainTextNode[] };
function plain(value: unknown): string {
  if (!Array.isArray(value) || !value.length) return "";
  const tree = parser.parse(getMarkdown(value as Descendant[]));
  const walk = (node: PlainTextNode): string =>
    typeof node.value === "string"
      ? node.type === "html"
        ? node.value.replace(/<[^>]*>/g, " ")
        : node.value
      : (node.children ?? []).map(walk).join(" ");
  return walk(tree as PlainTextNode)
    .replace(/\s+/g, " ")
    .trim();
}

const compact = (text: string) => text.replace(/\s+/g, " ").trim();
const summary = (text: string) => (text.length > 120 ? text.slice(0, 120) + "..." : text);
function document(
  ref: ContentRef,
  title: string,
  content: string,
  tags: string[],
  excerpt?: string
): SearchDocument {
  if (ref.type === "home" || ref.type === "list") throw new Error("聚合数据不进入全文索引");
  return {
    ...ref,
    type: ref.type,
    title: compact(title),
    summary: compact(excerpt || summary(content)),
    content: compact(content),
    tags: tags.map(compact).filter(Boolean),
  };
}
export function buildPublishSearchItems(input: BuildPublishSearchIndexInput): SearchDocument[] {
  return [
    ...input.cards.map(card => {
      const content = plain(card.content);
      return document(
        contentRef("card", card.id),
        card.aiTitle || plain(card.content.slice(0, 1)) || summary(content) || `卡片 #${card.id}`,
        content,
        card.tags || []
      );
    }),
    ...input.articles.map(article =>
      document(
        contentRef("article", article.id),
        article.title || `文章 #${article.id}`,
        plain(article.content),
        article.tags || []
      )
    ),
    ...input.docs.map(doc =>
      document(doc.target, doc.title, plain(doc.content), doc.tags, doc.summary)
    ),
  ].sort((a, b) => a.key.localeCompare(b.key));
}
export function buildPublishSearchIndexPayload(input: BuildPublishSearchIndexInput): SearchFile {
  return { version: 1, documents: buildPublishSearchItems(input) };
}
