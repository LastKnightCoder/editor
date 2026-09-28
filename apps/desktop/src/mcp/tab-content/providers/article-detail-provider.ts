import { TabType } from "@/types/tab";
import { findOneArticle } from "@/commands/article";
import { getMarkdown } from "@/utils/markdown";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class ArticleDetailProvider extends BaseTabContentProvider<TabType.ArticleDetail> {
  readonly tabType = TabType.ArticleDetail;

  validateParams(params?: { id: number }): boolean {
    return !!(params?.id && typeof params.id === "number");
  }

  async getContent(
    tab: ITab<TabType.ArticleDetail>,
    options?: TabContentOptions
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    if (!tab.params?.id) {
      throw new Error("Article ID is required");
    }

    // 获取文章详情
    const article = await findOneArticle(tab.params.id);

    // 转换为 Markdown
    const markdown = getMarkdown(article.content);

    // 截断处理（支持范围）
    const { content, truncated, originalLength, totalLength, range } = this.truncateContent(
      markdown,
      options?.range
    );

    // 构建完整响应
    const fullContent = {
      markdown: content,
      metadata: {
        id: article.id,
        title: article.title,
        author: article.author,
        tags: article.tags,
        wordCount: article.count,
        bannerBg: article.bannerBg,
        createTime: article.create_time,
        updateTime: article.update_time,
        isTop: article.isTop,
      },
    };

    return {
      metadata,
      content: options?.includeMetadata !== false ? fullContent : content,
      contentType: "markdown",
      truncated,
      originalLength,
      totalLength,
      range,
    };
  }
}
