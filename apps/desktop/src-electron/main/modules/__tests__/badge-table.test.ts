import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp",
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("../video-note-index-queue", () => ({
  default: {
    enqueueTask: vi.fn(),
    cleanupVideoNoteArtifacts: vi.fn(),
  },
}));

import { BADGE_SYSTEM_DEFINITIONS } from "../tables/badge";

describe("BadgeTable", () => {
  it("每日输出连续坚持系统徽章覆盖多个里程碑", () => {
    const definitions = BADGE_SYSTEM_DEFINITIONS.filter(
      (definition) => definition.systemKey === "output-daily-streak",
    );

    expect(definitions).toHaveLength(1);
    const [definition] = definitions;
    expect(definition.rule).toMatchObject({
      type: "event_count",
      eventType: "output.created",
      comparator: ">=",
      target: 1,
    });
    expect(definition.schedule).toEqual({ type: "daily" });
    expect(definition.awardPolicy).toMatchObject({
      type: "streak",
      target: 2000,
      failureEnabled: false,
      graceDays: 1,
    });
    expect(
      definition.milestones?.map((milestone) => milestone.targetValue),
    ).toEqual([7, 30, 180, 365, 1000, 2000]);
  });

  it("系统徽章包含卡片总数目标", () => {
    const definitions = BADGE_SYSTEM_DEFINITIONS;
    expect(
      definitions.some((definition) =>
        definition.systemKey?.startsWith("card-total-"),
      ),
    ).toBe(true);
  });

  it("文章总数系统徽章使用目标数量作为徽章内文字", () => {
    const definitions = BADGE_SYSTEM_DEFINITIONS.filter((definition) =>
      definition.systemKey?.startsWith("article-total-"),
    );

    expect(definitions.length).toBeGreaterThan(0);
    definitions.forEach((definition) => {
      expect(definition.successDesign.icon).toBe(
        String(definition.awardPolicy.target),
      );
    });
  });
});
