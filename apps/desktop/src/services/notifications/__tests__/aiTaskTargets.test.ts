import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  databaseName: "work.db",
  locate: vi.fn(),
  projectItems: vi.fn(),
  openPage: vi.fn(),
  closeSettings: vi.fn(),
}));
vi.mock("@/stores/useSettingStore", () => ({
  default: { getState: () => ({ setting: { database: { active: mocks.databaseName } } }) },
}));
vi.mock("@/app/settingsStore", () => ({
  useSettingsStore: { getState: () => ({ closeSettings: mocks.closeSettings }) },
}));
vi.mock("@/commands/entity", () => ({ locateEntity: mocks.locate }));
vi.mock("@/commands/project", () => ({
  getProjectItemByRef: mocks.projectItems,
  getProjectItemById: vi.fn(),
}));
vi.mock("@/services/page-navigation", () => ({ openPage: mocks.openPage }));
vi.mock("../notify", () => ({ appNotify: vi.fn() }));

import { openChatTarget, openContentById } from "../aiTaskTargets";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.databaseName = "work.db";
});

describe("AI 通知目标定位", () => {
  it("定位正文期间切库后拒绝打开查询返回的旧库实体", async () => {
    let resolveLocation!: (location: { kind: string; id: number }) => void;
    mocks.locate.mockReturnValue(
      new Promise(resolve => {
        resolveLocation = resolve;
      })
    );
    const opening = openContentById(9, "work");
    mocks.databaseName = "other.db";
    resolveLocation({ kind: "card", id: 12 });
    await expect(opening).rejects.toThrow();
    expect(mocks.openPage).not.toHaveBeenCalled();
  });

  it("同库定位正文使用返回的实体身份，并在打开前关闭设置", async () => {
    mocks.locate.mockResolvedValue({ kind: "card", id: 12 });
    await openContentById(9, "work");
    expect(mocks.openPage).toHaveBeenCalledWith("card-detail", { id: 12 });
    expect(mocks.closeSettings.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.openPage.mock.invocationCallOrder[0]
    );
  });

  it("PDF 与视频通知携带原对话定位参数", async () => {
    await openChatTarget("pdf-chat:8", "pdf-session");
    expect(mocks.openPage).toHaveBeenLastCalledWith("pdf-detail", {
      pdfId: 8,
      chatId: "pdf-session",
    });
    mocks.projectItems.mockResolvedValue([{ id: 21, projects: [3] }]);
    await openChatTarget("video-note-chat:7", "video-session");
    expect(mocks.projectItems).toHaveBeenCalledWith("video-note", 7);
    expect(mocks.openPage).toHaveBeenLastCalledWith("project-detail", {
      id: 3,
      itemId: 21,
      chatId: "video-session",
    });
  });
});
