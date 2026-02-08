import { invoke } from "@/electron";
import { IArticle, ICreateArticle, IUpdateArticle } from "@/types";

export async function createArticle(
  article: ICreateArticle,
): Promise<IArticle> {
  return await invoke("create-article", article);
}

export async function createArticleFromProjectItem(
  projectItemId: number,
): Promise<IArticle> {
  return await invoke("create-article-from-project-item", projectItemId);
}

export async function updateArticle(
  article: IUpdateArticle,
): Promise<IArticle> {
  return await invoke("update-article", article);
}

export async function deleteArticle(id: number): Promise<number> {
  return await invoke("delete-article", id);
}

export async function findOneArticle(id: number): Promise<IArticle> {
  return await invoke("get-article-by-id", id);
}

export async function getAllArticles(): Promise<IArticle[]> {
  return await invoke("get-all-articles");
}

export async function updateArticleIsTop(
  id: number,
  isTop: boolean,
): Promise<IArticle> {
  return await invoke("update-article-is-top", id, isTop);
}

export async function updateArticleBannerBg(
  id: number,
  bannerBg: string,
): Promise<IArticle> {
  return await invoke("update-article-banner-bg", id, bannerBg);
}

export async function openArticleInNewWindow(
  databaseName: string,
  articleId: number,
): Promise<void> {
  return await invoke("open-article-in-new-window", databaseName, articleId, {
    showTitlebar: true,
    isDefaultTop: true,
  });
}

export async function getArticlesByDates(
  dates: string[],
): Promise<Record<string, IArticle[]>> {
  return invoke("get-articles-by-dates", dates);
}

export async function getArticlesByDateRange(
  startDate: string,
  endDate: string,
): Promise<Record<string, IArticle[]>> {
  return invoke("get-articles-by-date-range", startDate, endDate);
}

export async function getArticlesContentByIds(
  ids: number[],
  maxLength?: number,
): Promise<
  Array<{
    id: number;
    markdown: string;
    truncated: boolean;
    originalLength: number;
    metadata: Record<string, any>;
  }>
> {
  return invoke("get-articles-content-by-ids", ids, maxLength);
}

export async function isContentIsArticle(contentId: number): Promise<boolean> {
  return invoke("is-content-is-article", contentId);
}

export async function buildArticleFromContent(
  contentId: number,
  title = "",
): Promise<IArticle> {
  return invoke("build-article-from-content", contentId, title);
}
