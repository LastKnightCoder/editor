import type { IPublishInitData } from "@/types/publish";

type ContentLinkTargets = NonNullable<IPublishInitData["contentLinkTargets"]>;

type DocEntryTarget = {
  id: number;
  kind: "project" | "document";
  href: string;
  title: string;
};

function mergeTargets(
  base?: IPublishInitData["contentLinkTargets"],
): ContentLinkTargets {
  return base ? { ...base } : {};
}

export function buildSelectionContentLinkTargets(input: {
  cardIds: number[];
  articleIds: number[];
}): IPublishInitData["contentLinkTargets"] {
  const targets: ContentLinkTargets = {};

  for (const cardId of input.cardIds) {
    targets[`card:${cardId}`] = {
      contentType: "card",
      refId: cardId,
      href: `/cards/${cardId}.html`,
    };
  }

  for (const articleId of input.articleIds) {
    targets[`article:${articleId}`] = {
      contentType: "article",
      refId: articleId,
      href: `/articles/${articleId}.html`,
    };
  }

  return Object.keys(targets).length > 0 ? targets : undefined;
}

export function mergeDocEntryContentLinkTargets(
  baseTargets: IPublishInitData["contentLinkTargets"],
  docEntries: DocEntryTarget[],
): IPublishInitData["contentLinkTargets"] {
  const targets = mergeTargets(baseTargets);

  for (const entry of docEntries) {
    const contentType =
      entry.kind === "project" ? "project-item" : "document-item";
    targets[`${contentType}:${entry.id}`] = {
      contentType,
      refId: entry.id,
      href: entry.href,
      title: entry.title,
    };
  }

  return Object.keys(targets).length > 0 ? targets : undefined;
}
