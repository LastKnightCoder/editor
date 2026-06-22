import { describe, expect, it } from "vitest";

import { EProjectItemType } from "@/types/project";
import { getProjectItemMoreMenuItems } from "../projectItemMoreMenuItems";

describe("getProjectItemMoreMenuItems", () => {
  const getKeys = (items: ReturnType<typeof getProjectItemMoreMenuItems>) =>
    (items || []).map((item) => item?.key);

  it("为普通文档返回完整文档操作", () => {
    const items = getProjectItemMoreMenuItems({
      projectItemType: EProjectItemType.Document,
      refType: "",
    });

    expect(getKeys(items)).toEqual([
      "to-card",
      "create-flashcard",
      "generate-podcast",
      "presentation-mode",
      "copy",
      "export",
      "open-in-new-window",
      "remove",
    ]);
  });

  it("已关联卡片的文档不再显示建立卡片", () => {
    const items = getProjectItemMoreMenuItems({
      projectItemType: EProjectItemType.Document,
      refType: "card",
    });

    expect(getKeys(items)).not.toContain("to-card");
  });

  it("白板根据关联状态返回对应菜单项", () => {
    expect(
      getKeys(
        getProjectItemMoreMenuItems({
          projectItemType: EProjectItemType.WhiteBoard,
          refType: "",
        }),
      ),
    ).toEqual(["to-white-board", "remove", "edit-title"]);

    expect(
      getKeys(
        getProjectItemMoreMenuItems({
          projectItemType: EProjectItemType.WhiteBoard,
          refType: "white-board",
        }),
      ),
    ).toEqual(["remove", "edit-title"]);
  });

  it("为音频笔记返回有效的 more 菜单项", () => {
    expect(
      getProjectItemMoreMenuItems({
        projectItemType: EProjectItemType.AudioNote,
      }),
    ).toEqual([
      { key: "remove", label: "删除音频" },
      { key: "edit-title", label: "编辑标题" },
    ]);
  });

  it("为视频、网页、表格、PDF 和 EPUB 返回各自菜单项", () => {
    expect(
      getKeys(
        getProjectItemMoreMenuItems({
          projectItemType: EProjectItemType.VideoNote,
        }),
      ),
    ).toEqual(["remove", "edit-title"]);

    expect(
      getKeys(
        getProjectItemMoreMenuItems({
          projectItemType: EProjectItemType.WebView,
        }),
      ),
    ).toEqual(["remove", "edit-title", "open-in-new-tab"]);

    expect(
      getKeys(
        getProjectItemMoreMenuItems({
          projectItemType: EProjectItemType.TableView,
        }),
      ),
    ).toEqual(["remove"]);

    expect(
      getKeys(
        getProjectItemMoreMenuItems({
          projectItemType: EProjectItemType.Pdf,
        }),
      ),
    ).toEqual(["remove", "edit-title"]);

    expect(
      getKeys(
        getProjectItemMoreMenuItems({
          projectItemType: EProjectItemType.Epub,
        }),
      ),
    ).toEqual(["remove", "edit-title"]);
  });
});
