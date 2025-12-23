import { TabType } from "@/types/tab";
import { getAllWhiteBoards } from "@/commands/white-board";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class WhiteBoardListProvider extends BaseTabContentProvider<TabType.WhiteBoardList> {
  readonly tabType = TabType.WhiteBoardList;

  async getContent(
    tab: ITab<TabType.WhiteBoardList>,
    options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    // 获取所有白板
    const allWhiteBoards = await getAllWhiteBoards();

    // 限制返回数量（支持范围）
    const {
      items: whiteBoards,
      truncated,
      originalCount,
      totalCount,
      range,
    } = this.limitItems(allWhiteBoards, options?.itemRange);

    // 转换为简化格式（不包含完整内容）
    const whiteBoardList = whiteBoards.map((whiteBoard) => ({
      id: whiteBoard.id,
      title: whiteBoard.title,
      description: whiteBoard.description,
      tags: whiteBoard.tags,
      contentCount: whiteBoard.whiteBoardContentList?.length || 0,
      createTime: whiteBoard.createTime,
      updateTime: whiteBoard.updateTime,
    }));

    return {
      metadata,
      content: whiteBoardList,
      contentType: "list",
      truncated,
      itemCount: originalCount,
      totalLength: totalCount,
      range,
    };
  }
}
