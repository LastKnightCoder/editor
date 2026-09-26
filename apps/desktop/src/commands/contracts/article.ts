import { command } from "@tau/rpc";
import type {
  IArticle,
  ICreateArticle,
  IUpdateArticle,
  ArticlePageItem,
  ArticleTagCount,
} from "@/types";

/** 文章内容按 id 批量取回的条目（供 AI 等消费方的受控摘要） */
export interface ArticleContentResult {
  id: number;
  markdown: string;
  truncated: boolean;
  originalLength: number;
  metadata: Record<string, any>;
}

/**
 * 文章域命令契约。注意：主进程侧注册在 database.ts 的通用包装层
 * （tables 模式，handler 形态为 (db, ...args, win)），本契约当前仅约束
 * 渲染侧调用的 channel 与类型；主进程注册点契约化随 tables 批次推进。
 */
export const articleCommands = {
  create: command<[ICreateArticle], IArticle>("create-article"),
  createFromProjectItem: command<[number], IArticle | null>("create-article-from-project-item"),
  update: command<[IUpdateArticle], IArticle>("update-article"),
  remove: command<[number], number>("delete-article"),
  getById: command<[number], IArticle>("get-article-by-id"),
  getAll: command<[], IArticle[]>("get-all-articles"),
  listPage: command<
    [number, number, (string | undefined)?, (string | undefined)?],
    { items: ArticlePageItem[]; total: number; totalWords: number }
  >("get-article-page"),
  tagCounts: command<[], ArticleTagCount[]>("get-article-tag-counts"),
  updateIsTop: command<[number, boolean], IArticle>("update-article-is-top"),
  updateBannerBg: command<[number, string], IArticle>("update-article-banner-bg"),
  getArticlesByDates: command<[string[]], Record<string, IArticle[]>>("get-articles-by-dates"),
  getArticlesByDateRange: command<[string, string], Record<string, IArticle[]>>(
    "get-articles-by-date-range"
  ),
  getContentByIds: command<[number[], (number | undefined)?], ArticleContentResult[]>(
    "get-articles-content-by-ids"
  ),
  isContentIsArticle: command<[number], boolean>("is-content-is-article"),
  getByContentId: command<[number], IArticle | null>("get-article-by-content-id"),
  buildFromContent: command<[number, (string | undefined)?], IArticle>(
    "build-article-from-content"
  ),
  attachPodcast: command<[number, number], IArticle | null>("attach-podcast-to-article"),
  detachPodcast: command<[number], IArticle | null>("detach-podcast-from-article"),
  openInNewWindow: command<
    [string, number, ({ showTitlebar?: boolean; isDefaultTop?: boolean } | undefined)?],
    void
  >("open-article-in-new-window"),
  closeWindow: command<[string, number], void>("close-article-window"),
};
