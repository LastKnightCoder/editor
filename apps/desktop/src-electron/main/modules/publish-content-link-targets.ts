import type { ContentRef } from "@tau/plugins/publish-data";

export function contentRef(type: ContentRef["type"], id?: number, projectId?: number): ContentRef {
  const key =
    type === "home" ? "home" : type === "doc" ? `doc:project:${projectId}:${id}` : `${type}:${id}`;
  return { key, type, ...(id === undefined ? {} : { id }) };
}

export function buildSelectionContentLinkTargets(input: {
  cardIds: number[];
  articleIds: number[];
}) {
  const targets: Record<string, ContentRef> = Object.create(null);
  for (const id of input.cardIds) targets[`card:${id}`] = contentRef("card", id);
  for (const id of input.articleIds) targets[`article:${id}`] = contentRef("article", id);
  return targets;
}

export function mergeDocEntryContentLinkTargets(
  base: Record<string, ContentRef> | undefined,
  entries: { id: number; target: ContentRef }[]
) {
  const targets = { ...base };
  for (const entry of entries) targets[`project-item:${entry.id}`] ??= entry.target;
  return targets;
}
