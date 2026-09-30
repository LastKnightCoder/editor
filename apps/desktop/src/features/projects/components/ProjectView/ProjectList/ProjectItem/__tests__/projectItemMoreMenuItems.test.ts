import { describe, expect, it, vi } from "vitest";

import { EProjectItemType } from "@/types/project";

// 「窗口打开」为 Electron 专属入口，测试按 Web 环境断言其不展示
const electronMocks = vi.hoisted(() => ({
  isElectron: false,
  invoke: vi.fn(() => Promise.resolve({})),
  send: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  platform: "web",
}));
vi.mock("@/electron", () => electronMocks);

import { getProjectItemMoreMenuItems } from "../projectItemMoreMenuItems";

describe("getProjectItemMoreMenuItems", () => {
  const getKeys = (items: ReturnType<typeof getProjectItemMoreMenuItems>) =>
    (items || []).map(item => item?.key);

  it("为普通文档返回完整文档操作", () => {
    const items = getProjectItemMoreMenuItems({
      projectItemType: EProjectItemType.Document,
      refType: "",
    });

    expect(getKeys(items)).toEqual([
      "scene",
      "collaboration",
      "copy",
      "export",
      "generate",
      "remove-divider",
      "remove",
    ]);
    expect(getKeys(items.find(item => item.key === "scene")!.children!)).toEqual([
      "presentation-mode",
      "immersive-mode",
    ]);
    expect(getKeys(items.find(item => item.key === "generate")!.children!)).toEqual([
      "to-card",
      "ai-flashcard",
      "manual-flashcard",
      "generate-podcast",
    ]);
  });

  it("已关联卡片的文档不再显示建立卡片", () => {
    const items = getProjectItemMoreMenuItems({
      projectItemType: EProjectItemType.Document,
      refType: "card",
    });

    expect(getKeys(items.find(item => item.key === "generate")!.children!)).not.toContain(
      "to-card"
    );
  });

  it("白板根据关联状态返回对应菜单项", () => {
    expect(
      getKeys(
        getProjectItemMoreMenuItems({
          projectItemType: EProjectItemType.WhiteBoard,
          refType: "",
        })
      )
    ).toEqual(["to-white-board", "remove", "edit-title"]);

    expect(
      getKeys(
        getProjectItemMoreMenuItems({
          projectItemType: EProjectItemType.WhiteBoard,
          refType: "white-board",
        })
      )
    ).toEqual(["remove", "edit-title"]);
  });

  it("为视频、网页、表格和 PDF 返回各自菜单项", () => {
    expect(
      getKeys(
        getProjectItemMoreMenuItems({
          projectItemType: EProjectItemType.VideoNote,
        })
      )
    ).toEqual(["remove", "edit-title"]);

    expect(
      getKeys(
        getProjectItemMoreMenuItems({
          projectItemType: EProjectItemType.WebView,
        })
      )
    ).toEqual(["remove", "edit-title", "open-in-new-tab"]);

    expect(
      getKeys(
        getProjectItemMoreMenuItems({
          projectItemType: EProjectItemType.TableView,
        })
      )
    ).toEqual(["remove"]);

    expect(
      getKeys(
        getProjectItemMoreMenuItems({
          projectItemType: EProjectItemType.Pdf,
        })
      )
    ).toEqual(["remove", "edit-title"]);
  });
});
