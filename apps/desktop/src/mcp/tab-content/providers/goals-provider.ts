import { TabType } from "@/types/tab";
import { getAllGoals } from "@/commands/goal";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";
import { EGoalStatus } from "@/types/goal";

export class GoalsProvider extends BaseTabContentProvider<TabType.Goals> {
  readonly tabType = TabType.Goals;

  async getContent(
    tab: ITab<TabType.Goals>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    const goals = await getAllGoals();

    const content = {
      goals: goals.map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description,
        status: g.status,
        startDate: g.start_date,
        endDate: g.end_date,
        createTime: g.create_time,
        updateTime: g.update_time,
      })),
      statistics: {
        totalGoals: goals.length,
        activeGoals: goals.filter((g) => g.status === EGoalStatus.InProgress)
          .length,
        completedGoals: goals.filter((g) => g.status === EGoalStatus.Completed)
          .length,
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
