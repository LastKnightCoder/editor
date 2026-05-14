import { describe, expect, it } from "vitest";

import { EProjectItemType } from "@/types/project";
import { getProjectItemMoreMenuItems } from "../projectItemMoreMenuItems";

describe("getProjectItemMoreMenuItems", () => {
  it("为音频笔记返回有效的 more 菜单项", () => {
    const items = getProjectItemMoreMenuItems({
      projectItemType: EProjectItemType.AudioNote,
    });

    expect(items).toEqual([
      { key: "remove", label: "删除音频" },
      { key: "edit-title", label: "编辑标题" },
    ]);
  });
});
