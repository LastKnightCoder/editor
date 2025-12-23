import { TabType } from "@/types/tab";
import { getAllArticles } from "@/commands/article";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class ArticleListProvider extends BaseTabContentProvider<TabType.ArticleList> {
  readonly tabType = TabType.ArticleList;

  async getContent(
    tab: ITab<TabType.ArticleList>,
    options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    // 获取所有文章
    const allArticles = await getAllArticles();

    // 限制返回数量（支持范围）
    const {
      items: articles,
      truncated,
      originalCount,
      totalCount,
      range,
    } = this.limitItems(allArticles, options?.itemRange);

    // 转换为简化格式（不包含完整内容）
    const articleList = articles.map((article) => ({
      id: article.id,
      title: article.title,
      author: article.author,
      tags: article.tags,
      wordCount: article.count,
      createTime: article.create_time,
      updateTime: article.update_time,
      isTop: article.isTop,
      bannerBg: article.bannerBg,
    }));

    return {
      metadata,
      content: articleList,
      contentType: "list",
      truncated,
      itemCount: originalCount,
      totalLength: totalCount,
      range,
    };
  }
}
