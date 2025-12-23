import { TabType } from "@/types/tab";
import { listPrompts } from "@/commands/prompt";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class PromptManagementProvider extends BaseTabContentProvider<TabType.PromptManagement> {
  readonly tabType = TabType.PromptManagement;

  async getContent(
    tab: ITab<TabType.PromptManagement>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    const prompts = await listPrompts();

    const content = {
      prompts: prompts.map((p) => ({
        id: p.id,
        name: p.name,
        content: p.content.slice(0, 200), // 截取前 200 字符
        tags: p.tags,
        createTime: p.createTime,
      })),
      statistics: {
        totalPrompts: prompts.length,
      },
      type: "functional-page",
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
