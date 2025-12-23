import { TabType } from "@/types/tab";
import { getAllDocuments } from "@/commands/document";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class DocumentListProvider extends BaseTabContentProvider<TabType.DocumentList> {
  readonly tabType = TabType.DocumentList;

  async getContent(
    tab: ITab<TabType.DocumentList>,
    options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    // 获取所有知识库
    const allDocuments = await getAllDocuments();

    // 限制返回数量（支持范围）
    const {
      items: documents,
      truncated,
      originalCount,
      totalCount,
      range,
    } = this.limitItems(allDocuments, options?.itemRange);

    // 转换为简化格式（不包含完整内容）
    const documentList = documents.map((document) => ({
      id: document.id,
      title: document.title,
      description: document.desc,
      isTop: document.isTop,
      itemCount: document.children.length,
      createTime: document.createTime,
      updateTime: document.updateTime,
    }));

    return {
      metadata,
      content: documentList,
      contentType: "list",
      truncated,
      itemCount: originalCount,
      totalLength: totalCount,
      range,
    };
  }
}
