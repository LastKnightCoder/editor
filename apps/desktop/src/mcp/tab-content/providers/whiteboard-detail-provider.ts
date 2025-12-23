import { TabType } from "@/types/tab";
import {
  getWhiteBoardById,
  getWhiteBoardContentById,
} from "@/commands/white-board";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class WhiteBoardDetailProvider extends BaseTabContentProvider<TabType.WhiteBoardDetail> {
  readonly tabType = TabType.WhiteBoardDetail;

  validateParams(
    params?:
      | { type: "whiteboard"; id: number }
      | { type: "content"; whiteBoardContentId: number; breadcrumb?: number[] },
  ): boolean {
    if (!params) return false;
    if (params.type === "whiteboard") {
      return !!(params.id && typeof params.id === "number");
    }
    if (params.type === "content") {
      return !!(
        params.whiteBoardContentId &&
        typeof params.whiteBoardContentId === "number"
      );
    }
    return false;
  }

  async getContent(
    tab: ITab<TabType.WhiteBoardDetail>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    if (!tab.params) {
      throw new Error("WhiteBoard params are required");
    }

    if (tab.params.type === "whiteboard") {
      const whiteBoard = await getWhiteBoardById(tab.params.id);

      return {
        metadata,
        content: {
          type: "whiteboard",
          id: whiteBoard.id,
          title: whiteBoard.title,
          description: whiteBoard.description,
          tags: whiteBoard.tags,
          contentList: whiteBoard.whiteBoardContentList.map((c) => ({
            id: c.id,
            name: c.name,
            elementCount: c.data.children.length,
          })),
        },
        contentType: "object",
        truncated: false,
        originalLength: 0,
        totalLength: 0,
      };
    } else {
      const content = await getWhiteBoardContentById(
        tab.params.whiteBoardContentId,
      );

      return {
        metadata,
        content: {
          type: "whiteboard-content",
          id: content.id,
          name: content.name,
          data: content.data, // 包含 children, viewPort, selection 等
          breadcrumb: tab.params.breadcrumb,
        },
        contentType: "object",
        truncated: false,
        originalLength: 0,
        totalLength: 0,
      };
    }
  }
}
