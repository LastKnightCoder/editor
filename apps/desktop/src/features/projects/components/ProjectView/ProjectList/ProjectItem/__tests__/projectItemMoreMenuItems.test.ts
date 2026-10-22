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

import { getProjectItemMoreMenuItems, projectItemActionTarget } from "../projectItemMoreMenuItems";
import { insertPluginActionEntries } from "../../../shared/menuEntries";

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

describe("插件对象动作", () => {
  it("普通文档按项目文档、引用型条目按引用的卡片 / 文章，其余类型没有", () => {
    const doc = { id: 5, projectItemType: EProjectItemType.Document, refType: "", refId: 0 };
    expect(projectItemActionTarget(doc)).toEqual({ kind: "document", id: "5" });
    expect(projectItemActionTarget({ ...doc, refType: "card", refId: 9 })).toEqual({
      kind: "card",
      id: "9",
    });
    expect(projectItemActionTarget({ ...doc, refType: "article", refId: 3 })).toEqual({
      kind: "article",
      id: "3",
    });
    expect(projectItemActionTarget({ ...doc, refType: "white-board", refId: 3 })).toBeNull();
    expect(
      projectItemActionTarget({ ...doc, projectItemType: EProjectItemType.WhiteBoard })
    ).toBeNull();
    expect(projectItemActionTarget(null)).toBeNull();
  });

  it("排在删除之前，自带分隔线；没有动作时不变", () => {
    const items = getProjectItemMoreMenuItems({
      projectItemType: EProjectItemType.Document,
      refType: "",
    });
    expect(insertPluginActionEntries(items, [])).toBe(items);
    const keys = insertPluginActionEntries(items, [
      { id: "plugin:q:to-question", label: "转为问题" },
    ]).map(item => item.key);
    expect(keys.slice(-4)).toEqual([
      "plugin-action:divider",
      "plugin-action:plugin:q:to-question",
      "remove-divider",
      "remove",
    ]);
  });
});
