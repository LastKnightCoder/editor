import { TabType } from "@/types/tab";
import { getAllResources } from "@/commands/resource";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class ResourceManagementProvider extends BaseTabContentProvider<TabType.ResourceManagement> {
  readonly tabType = TabType.ResourceManagement;

  async getContent(
    tab: ITab<TabType.ResourceManagement>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    const resources = await getAllResources();

    const content = {
      resources: resources.slice(0, 50).map((r) => ({
        id: r.id,
        name: r.name,
        path: r.path,
        type: r.type,
        refCount: r.refCount,
      })),
      statistics: {
        totalResources: resources.length,
        byType: resources.reduce(
          (acc, r) => {
            acc[r.type] = (acc[r.type] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
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
