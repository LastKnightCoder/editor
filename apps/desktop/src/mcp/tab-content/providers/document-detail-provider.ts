import { TabType } from "@/types/tab";
import { getDocument, getDocumentItem } from "@/commands/document";
import { getMarkdown } from "@/utils/markdown-helper";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class DocumentDetailProvider extends BaseTabContentProvider<TabType.DocumentDetail> {
  readonly tabType = TabType.DocumentDetail;

  validateParams(params?: { id: number; itemId?: number }): boolean {
    return !!(params?.id && typeof params.id === "number");
  }

  async getContent(
    tab: ITab<TabType.DocumentDetail>,
    options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    if (!tab.params?.id) {
      throw new Error("Document ID is required");
    }

    const document = await getDocument(tab.params.id);

    let content: any;

    // 如果指定了 itemId，返回文档项内容
    if (tab.params.itemId) {
      const documentItem = await getDocumentItem(tab.params.itemId);

      if (!documentItem) {
        throw new Error(`Document item with ID ${tab.params.itemId} not found`);
      }

      const markdown = getMarkdown(documentItem.content);

      const {
        content: truncatedContent,
        truncated,
        originalLength,
        totalLength,
        range,
      } = this.truncateContent(markdown, options?.range);

      content = {
        type: "document-item",
        documentId: document.id,
        documentTitle: document.title,
        item: {
          id: documentItem.id,
          title: documentItem.title,
          markdown: truncatedContent,
          wordCount: documentItem.count,
          createTime: documentItem.createTime,
          updateTime: documentItem.updateTime,
        },
      };

      return {
        metadata,
        content,
        contentType: "markdown",
        truncated,
        originalLength,
        totalLength,
        range,
      };
    }

    // 否则返回知识库概览
    content = {
      type: "document-overview",
      document: {
        id: document.id,
        title: document.title,
        description: document.desc,
        isTop: document.isTop,
        itemCount: document.children.length,
        structure: document.children, // 树形结构
        createTime: document.createTime,
        updateTime: document.updateTime,
      },
    };

    return {
      metadata,
      content,
      contentType: "object",
      truncated: false,
      originalLength: 0,
      totalLength: 0,
    };
  }
}
