import { TabType } from "@/types/tab";
import {
  listTodoGroups,
  getSystemGroups,
  getTodoGroupStats,
} from "@/commands/todo";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class TodoProvider extends BaseTabContentProvider<TabType.Todo> {
  readonly tabType = TabType.Todo;

  async getContent(
    tab: ITab<TabType.Todo>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    const [groups, systemGroups, stats] = await Promise.all([
      listTodoGroups(),
      getSystemGroups(),
      getTodoGroupStats(),
    ]);

    const content = {
      groups: groups.map((g) => ({
        id: g.id,
        name: g.title,
        color: g.color,
        sortIndex: g.sortIndex,
      })),
      systemGroups: systemGroups.map((g) => ({
        id: g.id,
        name: g.title,
        type: g.systemType,
      })),
      statistics: stats.map((s) => ({
        groupId: s.groupId,
        totalCount: s.total,
        completedCount: s.total - s.uncompleted,
        pendingCount: s.uncompleted,
      })),
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
