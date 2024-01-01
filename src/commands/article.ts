import { invoke } from "@tauri-apps/api";
import { IArticle } from "@/types";

export async function createArticle(article: Omit<IArticle, 'id' | 'create_time' | 'update_time' | 'isDelete'>): Promise<IArticle> {
  const res:any = await invoke('create_article', {
    ...article,
    content: JSON.stringify(article.content),
  });
  return {
    ...res,
    content: JSON.parse(res.content),
    bannerBg: res.banner_bg,
    isTop: res.is_top,
    isDelete: res.is_delete,
  }
}

export async function updateArticle(article: Omit<IArticle, 'create_time' | 'update_time' | 'isDelete'>): Promise<IArticle> {
  const res: any = await invoke('update_article', {
    ...article,
    content: JSON.stringify(article.content),
  });
  return {
    ...res,
    content: JSON.parse(res.content),
    bannerBg: res.banner_bg,
    isTop: res.is_top,
    isDelete: res.is_delete,
  }
}

export async function deleteArticle(id: number): Promise<number> {
  return await invoke('delete_article', {
    id,
  });
}

export async function findOneArticle(id: number): Promise<IArticle> {
  const res: any =  await invoke('find_article', {
    id
  });
  return {
    ...res,
    content: JSON.parse(res.content),
    bannerBg: res.banner_bg,
    isTop: res.is_top,
    isDelete: res.is_delete,
  }
}

export async function getAllArticles(): Promise<IArticle[]> {
  const list: any[] =  await invoke('find_all_articles');

  return list.map((item) => {
    return {
      ...item,
      content: JSON.parse(item.content),
      bannerBg: item.banner_bg,
      isTop: item.is_top,
      isDelete: item.is_delete,
    }
  });
}

export async function updateArticleIsTop(id: number, isTop: boolean): Promise<number> {
  return await invoke('update_article_is_top', {
    id,
    isTop,
  });
}

export async function updateArticleBannerBg(id: number, bannerBg: string): Promise<number> {
  return await invoke('update_article_banner_bg', {
    id,
    bannerBg,
  });
}