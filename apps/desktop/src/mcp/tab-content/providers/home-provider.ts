import { TabType } from "@/types/tab";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class HomeProvider extends BaseTabContentProvider<TabType.Home> {
  readonly tabType = TabType.Home;

  async getContent(
    tab: ITab<TabType.Home>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    const content = {
      description: "首页 - 快速访问和模块入口",
      features: [
        "快速输入框 - 快速创建各类内容",
        "模块网格 - 可自定义布局的功能模块",
        "快捷创建 - 卡片/文章/项目/日记等",
      ],
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
