import { TabType } from "@/types/tab";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class BlockPreviewProvider extends BaseTabContentProvider<TabType.BlockPreview> {
  readonly tabType = TabType.BlockPreview;

  validateParams(params?: { block: any }): boolean {
    return !!params?.block;
  }

  async getContent(
    tab: ITab<TabType.BlockPreview>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    if (!tab.params?.block) {
      throw new Error("Block data is required for BlockPreview");
    }

    const content = {
      block: tab.params.block,
      type: "block-preview",
      description: "块预览 - 用于预览编辑器中的内容块",
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
