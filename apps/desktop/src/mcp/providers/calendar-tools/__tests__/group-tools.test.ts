import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/commands", () => ({
  getAllCalendarGroups: vi.fn(),
  getCalendarGroupById: vi.fn(),
  updateCalendarGroup: vi.fn(),
  createCalendarGroup: vi.fn(),
  deleteCalendarGroup: vi.fn(),
}));

import { getCalendarGroupById, updateCalendarGroup } from "@/commands";
import { buildCalendarGroupTools } from "../group-tools";

describe("calendar group tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("update_calendar_group 允许显式传 null 清空 parentGroupId", async () => {
    vi.mocked(getCalendarGroupById).mockResolvedValue({
      id: 10,
      name: "工作",
      isSystem: false,
      parentGroupId: 3,
      orderIndex: 1,
      createTime: 1,
      updateTime: 1,
    });
    vi.mocked(updateCalendarGroup).mockImplementation(async (payload) => ({
      ...payload,
      createTime: 1,
      updateTime: 2,
    }));

    const tool = buildCalendarGroupTools().find(
      (item) => item.name === "update_calendar_group",
    );
    if (!tool) {
      throw new Error("tool not found");
    }

    await tool.executor({
      id: 10,
      parentGroupId: null,
    });

    expect(updateCalendarGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 10,
        parentGroupId: null,
      }),
    );
  });
});
