import { invoke } from "@tauri-apps/api";
import {IArticle} from "@/types";

export async function createArticle(article: Omit<IArticle, 'id' | 'create_time' | 'update_time'>): Promise<number> {
  const { title, author, tags, links, content } = article;

  return await invoke('create_article', {
    title,
    author,
    tags,
    links,
    content: JSON.stringify(content),
  });
}

export async function updateArticle(article: Pick<IArticle, 'id' | 'title' | 'author' | 'tags' | 'links' | 'content'>): Promise<number> {
  const { id, title, author, tags, links, content } = article;

  return await invoke('update_article', {
    id,
    title,
    author,
    tags,
    links,
    content: JSON.stringify(content),
  });
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
  }
}

export async function getAllArticles(): Promise<IArticle[]> {
  const list: any[] =  await invoke('find_all_articles');

  return list.map((item) => {
    return {
      ...item,
      content: JSON.parse(item.content),
    }
  });
}