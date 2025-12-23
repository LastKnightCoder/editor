import { TabType } from "@/types/tab";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class DataViewProvider extends BaseTabContentProvider<TabType.DataView> {
  readonly tabType = TabType.DataView;

  async getContent(
    tab: ITab<TabType.DataView>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    const content = {
      description: "数据视图 - 用于展示和管理结构化数据表格",
      features: [
        "多视图切换（表格、看板、日历等）",
        "数据筛选和排序",
        "自定义列显示",
        "数据导入导出",
        "公式和聚合计算",
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
