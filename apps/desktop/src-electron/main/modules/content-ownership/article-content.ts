import type { IArticle } from "@/types";

type ReleaseMode = "immediate" | "deferred";

interface ArticleContentStore {
  transaction<T>(apply: () => T): T;
  findActiveOwner(contentId: number): IArticle | null;
  insertOwner(contentId: number, title: string, tags: string[]): IArticle;
  readOwner(articleId: number): IArticle;
  removeOwner(articleId: number): number;
  addReference(contentId: number): void;
  assertLocal(contentId: number): void;
  releaseReference(contentId: number, mode: ReleaseMode): void;
}

export class ArticleContentOwnership {
  constructor(private readonly store: ArticleContentStore) {}

  createFromExisting(contentId: number, title: string, tags: string[]): IArticle {
    return this.store.transaction(() => {
      const existing = this.store.findActiveOwner(contentId);
      if (existing) return existing;
      this.store.addReference(contentId);
      return this.store.insertOwner(contentId, title, tags);
    });
  }

  deleteOwner(articleId: number, mode: ReleaseMode): number {
    return this.store.transaction(() => {
      const article = this.store.readOwner(articleId);
      if (article) this.store.assertLocal(article.contentId);
      const removed = this.store.removeOwner(articleId);
      if (removed && article?.contentId) this.store.releaseReference(article.contentId, mode);
      return removed;
    });
  }
}
