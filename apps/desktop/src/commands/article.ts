import { articleCommands } from "@/commands/contracts/article";
import type { ArticleContentResult } from "@/commands/contracts/article";
import {
  IArticle,
  ICreateArticle,
  IUpdateArticle,
  ArticlePageItem,
  ArticleTagCount,
} from "@/types";

export type { ArticleContentResult };

export async function createArticle(article: ICreateArticle): Promise<IArticle> {
  return articleCommands.create.call(article);
}

export async function createArticleFromProjectItem(
  projectItemId: number
): Promise<IArticle | null> {
  return articleCommands.createFromProjectItem.call(projectItemId);
}

export async function updateArticle(article: IUpdateArticle): Promise<IArticle> {
  return articleCommands.update.call(article);
}

export async function deleteArticle(id: number): Promise<number> {
  return articleCommands.remove.call(id);
}

export async function findOneArticle(id: number): Promise<IArticle> {
  return articleCommands.getById.call(id);
}

export async function getAllArticles(): Promise<IArticle[]> {
  return articleCommands.getAll.call();
}

export async function getArticlePage(
  offset: number,
  limit: number,
  tag?: string,
  query?: string
): Promise<{ items: ArticlePageItem[]; total: number; totalWords: number }> {
  return articleCommands.listPage.call(offset, limit, tag, query);
}

export async function getArticleTagCounts(): Promise<ArticleTagCount[]> {
  return articleCommands.tagCounts.call();
}

export async function updateArticleIsTop(id: number, isTop: boolean): Promise<IArticle> {
  return articleCommands.updateIsTop.call(id, isTop);
}

export async function updateArticleBannerBg(id: number, bannerBg: string): Promise<IArticle> {
  return articleCommands.updateBannerBg.call(id, bannerBg);
}

export async function openArticleInNewWindow(
  databaseName: string,
  articleId: number
): Promise<void> {
  return articleCommands.openInNewWindow.call(databaseName, articleId, {
    showTitlebar: true,
    isDefaultTop: true,
  });
}

export async function closeArticleWindow(databaseName: string, articleId: number): Promise<void> {
  return articleCommands.closeWindow.call(databaseName, articleId);
}

export async function getArticlesByDates(dates: string[]): Promise<Record<string, IArticle[]>> {
  return articleCommands.getArticlesByDates.call(dates);
}

export async function getArticlesByDateRange(
  startDate: string,
  endDate: string
): Promise<Record<string, IArticle[]>> {
  return articleCommands.getArticlesByDateRange.call(startDate, endDate);
}

export async function getArticlesContentByIds(
  ids: number[],
  maxLength?: number
): Promise<ArticleContentResult[]> {
  return articleCommands.getContentByIds.call(ids, maxLength);
}

export async function isContentIsArticle(contentId: number): Promise<boolean> {
  return articleCommands.isContentIsArticle.call(contentId);
}

export async function getArticleByContentId(contentId: number): Promise<IArticle | null> {
  return articleCommands.getByContentId.call(contentId);
}

export async function buildArticleFromContent(contentId: number, title = ""): Promise<IArticle> {
  return articleCommands.buildFromContent.call(contentId, title);
}
