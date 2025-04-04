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
