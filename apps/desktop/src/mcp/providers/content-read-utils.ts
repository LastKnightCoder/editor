import { getArticleByContentId } from "@/commands/article";
import { getContentById } from "@/commands/content";
import { loadSnapshotForContent } from "@/services/content-editing/resolver";
import {
  getAnswerContentStatus,
  getAnswerPrimaryContentType,
} from "@/utils/answer-content";
import { getEditorText } from "@/utils/editor";

export type ContentRange = [number, number] | undefined;

type ResolvedRange = {
  start: number;
  end: number;
};

type ContentMarkdownBase = {
  contentId: number;
  markdown: string;
  hash: string;
  snapshotId: string;
  source: string;
  totalLength: number;
};

type ReferencedContentBase = {
  contentId: number;
  contentType: string | null;
  title: string;
  markdown: string;
  hash: string;
  snapshotId: string;
  totalLength: number;
  updateTime: number | null;
};

const resolveMarkdownRange = (
  totalLength: number,
  range?: ContentRange,
): ResolvedRange | undefined => {
  if (!range) {
    return undefined;
  }

  const rawStart = Number.isFinite(range[0]) ? range[0] : 0;
  const rawEnd = Number.isFinite(range[1]) ? range[1] : totalLength;
  const start = Math.max(0, Math.min(rawStart, totalLength));
  const end = Math.max(start, Math.min(rawEnd, totalLength));

  return { start, end };
};

const applyMarkdownRange = (markdown: string, range?: ContentRange) => {
  const totalLength = markdown.length;
  const resolvedRange = resolveMarkdownRange(totalLength, range);
  const rangedMarkdown = resolvedRange
    ? markdown.slice(resolvedRange.start, resolvedRange.end)
    : markdown;

  return {
    markdown: rangedMarkdown,
    totalLength,
    returnedLength: rangedMarkdown.length,
    truncated: resolvedRange
      ? resolvedRange.start > 0 || resolvedRange.end < totalLength
      : false,
    range: resolvedRange,
  };
};

export const loadContentMarkdownBase = async (
  contentId: number,
): Promise<ContentMarkdownBase> => {
  const { snapshot, source } = await loadSnapshotForContent(contentId);

  return {
    contentId,
    markdown: snapshot.markdown,
    hash: snapshot.hash,
    snapshotId: snapshot.id,
    source,
    totalLength: snapshot.markdown.length,
  };
};

export const loadContentMarkdownPayload = async (
  contentId: number,
  range?: ContentRange,
) => {
  const payload = await loadContentMarkdownBase(contentId);
  const rangePayload = applyMarkdownRange(payload.markdown, range);

  return {
    contentId: payload.contentId,
    markdown: rangePayload.markdown,
    hash: payload.hash,
    snapshotId: payload.snapshotId,
    source: payload.source,
    totalLength: payload.totalLength,
    returnedLength: rangePayload.returnedLength,
    truncated: rangePayload.truncated,
    range: rangePayload.range,
  };
};

export const loadReferencedContentBase = async (
  contentId: number,
): Promise<ReferencedContentBase> => {
  const [markdownPayload, content, status] = await Promise.all([
    loadContentMarkdownBase(contentId),
    getContentById(contentId),
    getAnswerContentStatus(contentId),
  ]);
  const contentType = getAnswerPrimaryContentType(status);
  const article =
    contentType === "article" ? await getArticleByContentId(contentId) : null;
  const title =
    article?.title?.trim() ||
    getEditorText(content?.content || [], 20).trim() ||
    `内容 #${contentId}`;

  return {
    contentId,
    contentType,
    title,
    markdown: markdownPayload.markdown,
    hash: markdownPayload.hash,
    snapshotId: markdownPayload.snapshotId,
    totalLength: markdownPayload.totalLength,
    updateTime: content?.updateTime ?? null,
  };
};

export const loadReferencedContentPayload = async (
  contentId: number,
  range?: ContentRange,
) => {
  const payload = await loadReferencedContentBase(contentId);
  const rangePayload = applyMarkdownRange(payload.markdown, range);

  return {
    contentId: payload.contentId,
    contentType: payload.contentType,
    title: payload.title,
    markdown: rangePayload.markdown,
    hash: payload.hash,
    snapshotId: payload.snapshotId,
    totalLength: payload.totalLength,
    updateTime: payload.updateTime,
    returnedLength: rangePayload.returnedLength,
    truncated: rangePayload.truncated,
    range: rangePayload.range,
  };
};
