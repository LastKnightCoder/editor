import { TabType } from "@/types/tab";
import {
  listPomodoroPresets,
  getActivePomodoroSession,
} from "@/commands/pomodoro";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class PomodoroProvider extends BaseTabContentProvider<TabType.Pomodoro> {
  readonly tabType = TabType.Pomodoro;

  async getContent(
    tab: ITab<TabType.Pomodoro>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    const [presets, activeSession] = await Promise.all([
      listPomodoroPresets(),
      getActivePomodoroSession().catch(() => null),
    ]);

    const content = {
      presets: presets.map((p) => ({
        id: p.id,
        name: p.name,
        mode: p.mode,
        durationMin: p.durationMin,
        archived: p.archived,
      })),
      activeSession: activeSession
        ? {
            id: activeSession.id,
            presetId: activeSession.presetId,
            startTime: activeSession.startTime,
            expectedEndTime:
              activeSession.startTime + (activeSession.expectedMs ?? 0),
            status: activeSession.status,
          }
        : null,
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
