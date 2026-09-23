import { describe, expect, it, vi } from "vitest";

import { createRootAudioStrategy } from "../useAudioHandlers";

vi.mock("antd", () => ({
  message: {
    error: vi.fn(),
  },
}));

describe("createRootAudioStrategy", () => {
  it("新增根音频条目后导航到新条目并使用条目标题", async () => {
    const navigateTo = vi.fn();
    const setProject = vi.fn();
    const newProject = { id: 2, title: "新项目" } as any;
    const projectItem = { id: 9, title: "播客标题" } as any;
    const strategy = createRootAudioStrategy({
      project: { id: 1, title: "旧项目" } as any,
      addRootProjectItem: vi.fn(async () => [newProject, projectItem] as [any, any]),
      setProject,
      navigateTo,
    });

    await strategy.addProjectItem({ title: "播客标题" } as any);

    expect(navigateTo).toHaveBeenCalledWith(
      "project-detail",
      { id: 2, itemId: 9 },
      "项目 - 播客标题"
    );
    expect(setProject).toHaveBeenCalledWith(newProject);
  });
});
