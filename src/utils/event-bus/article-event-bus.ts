import { EventBus } from "./event-bus";
import { IArticle } from "../../types/article";
import { v4 as uuidv4 } from "uuid";

export interface ArticleEventData {
  article: IArticle;
  sourceUuid: string;
}

export interface ArticleEventMap {
  "article:created": ArticleEventData;
  "article:updated": ArticleEventData;
  "article:deleted": ArticleEventData;
  "article:content-changed": ArticleEventData;
  "article:tags-changed": ArticleEventData;
  "article:links-changed": ArticleEventData;
  "article:title-changed": ArticleEventData;
  "article:top-changed": ArticleEventData;
  [key: string]: ArticleEventData;
}

export class ArticleEditor {
  private uuid: string;
  private articleEventBus: ArticleEventBus;

  constructor(articleEventBus: ArticleEventBus) {
    this.uuid = uuidv4();
    this.articleEventBus = articleEventBus;
  }

  getUuid(): string {
    return this.uuid;
  }

  publishArticleEvent<K extends keyof ArticleEventMap>(
    event: K,
    article: IArticle,
  ): void {
    this.articleEventBus.publish(event, {
      article,
      sourceUuid: this.uuid,
    });
  }

  subscribeToOtherEditors<K extends keyof ArticleEventMap>(
    event: K,
    callback: (data: ArticleEventMap[K]) => void,
  ): () => void {
    return this.articleEventBus.subscribe(event, (data) => {
      if (data.sourceUuid !== this.uuid) {
        callback(data);
      }
    });
  }

  subscribeToArticleWithId<K extends keyof ArticleEventMap>(
    event: K,
    articleId: number,
    callback: (data: ArticleEventMap[K]) => void,
  ): () => void {
    return this.articleEventBus.subscribe(event, (data) => {
      if (data.sourceUuid !== this.uuid && data.article.id === articleId) {
        callback(data);
      }
    });
  }
}

export class ArticleEventBus extends EventBus<ArticleEventMap> {
  createEditor(): ArticleEditor {
    return new ArticleEditor(this);
  }

  subscribeToArticle<K extends keyof ArticleEventMap>(
    event: K,
    articleId: number,
    callback: (data: ArticleEventMap[K]) => void,
    ignoreUuid?: string,
  ): () => void {
    return this.subscribe(event, (data) => {
      if (
        data.article.id === articleId &&
        (!ignoreUuid || data.sourceUuid !== ignoreUuid)
      ) {
        callback(data);
      }
    });
  }
}

const defaultArticleEventBus = new ArticleEventBus();

export { defaultArticleEventBus };
