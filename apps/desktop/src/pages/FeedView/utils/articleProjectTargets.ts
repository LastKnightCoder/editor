import { EProjectItemType, type ProjectItem, type WebLink } from "@/types";
import type { UnifiedArticleItem } from "../types";

export interface ArticleProjectTarget {
  projectId: number;
  itemId: number;
  title: string;
}

const normalizeUrl = (url: string | null | undefined) => {
  const trimmed = url?.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/#.*$/, "").replace(/\/+$/, "");
  }
};

export const resolveArticleProjectTargets = (
  articles: UnifiedArticleItem[],
  projectItems: ProjectItem[],
  webLinks: WebLink[],
): Record<string, ArticleProjectTarget> => {
  const linkById = new Map(webLinks.map((link) => [link.id, link]));
  const targetByUrl = new Map<string, ArticleProjectTarget>();

  for (const item of projectItems) {
    if (
      item.projectItemType !== EProjectItemType.WebView ||
      item.refType !== "web-link" ||
      !item.refId ||
      item.projects.length === 0
    ) {
      continue;
    }

    const link = linkById.get(item.refId);
    const normalizedUrl = normalizeUrl(link?.url);
    if (!link || !normalizedUrl || targetByUrl.has(normalizedUrl)) {
      continue;
    }

    targetByUrl.set(normalizedUrl, {
      projectId: item.projects[0],
      itemId: item.id,
      title: item.title || link.title || `#${item.id}`,
    });
  }

  return articles.reduce<Record<string, ArticleProjectTarget>>(
    (targets, article) => {
      const normalizedUrl = normalizeUrl(article.url);
      const target = normalizedUrl ? targetByUrl.get(normalizedUrl) : null;
      if (target) {
        targets[article.id] = target;
      }
      return targets;
    },
    {},
  );
};
