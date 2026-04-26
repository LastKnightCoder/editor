import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/commands", () => ({
  getProjectById: vi.fn(),
  getProjectItemsByIds: vi.fn(),
  getProjectItemsByDates: vi.fn(),
  getProjectItemsByDateRange: vi.fn(),
  getProjectItemsContentByIds: vi.fn(),
  getProjectItemById: vi.fn(),
}));

vi.mock("@/commands/operation", () => ({
  analyzeOperations: vi.fn(),
}));

vi.mock("@/utils/markdown-helper", () => ({
  getMarkdown: vi.fn((content) => content),
}));

vi.mock("@/commands/video-notes", () => ({
  getVideoNoteById: vi.fn(),
}));

vi.mock("@/commands/web-note", () => ({
  listWebNotesByProjectItemId: vi.fn(),
}));

vi.mock("@/commands/pdf", () => ({
  getPdfById: vi.fn(),
  getPdfAnnotations: vi.fn(),
  getPdfBookmarks: vi.fn(),
}));

vi.mock("@/commands/epub", () => ({
  getEpubById: vi.fn(),
  getEpubAnnotations: vi.fn(),
  getEpubBookmarks: vi.fn(),
}));

vi.mock("@/commands/white-board", () => ({
  getWhiteBoardById: vi.fn(),
}));

vi.mock("@/commands/data-table", () => ({
  getDataTableDetail: vi.fn(),
}));

vi.mock("@/commands/notion-sync", () => ({
  getNotionSync: vi.fn(),
}));

import {
  getProjectById,
  getProjectItemsByIds,
  getProjectItemById,
} from "@/commands";
import { EProjectItemType, type ProjectItem } from "@/types";
import { projectToolsProvider } from "../project-tools";

const createProjectItem = (
  id: number,
  title: string,
  children: number[],
  projectId: number,
): ProjectItem => ({
  id,
  title,
  children,
  createTime: 1,
  updateTime: 1,
  content: [],
  parents: [],
  projects: [projectId],
  refType: "",
  refId: 0,
  projectItemType: EProjectItemType.Document,
  count: 0,
  contentId: 0,
  whiteBoardContentId: 0,
});

const findTool = (name: string) => {
  const tool = projectToolsProvider.tools().find((item) => item.name === name);
  expect(tool).toBeTruthy();
  return tool!;
};

describe("project tools provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("get_project_document_tree 应返回整个项目的 tree 风格文档树", async () => {
    vi.mocked(getProjectById).mockResolvedValue({
      id: 7,
      title: "研发项目",
      children: [101, 102],
      createTime: 1,
      updateTime: 1,
      desc: [],
      archived: false,
      pinned: false,
      projectType: "document-tree",
    } as any);

    vi.mocked(getProjectItemsByIds).mockImplementation(async (ids) => {
      const itemMap = new Map([
        [101, createProjectItem(101, "总览", [201], 7)],
        [102, createProjectItem(102, "实施计划", [], 7)],
        [201, createProjectItem(201, "接口设计", [], 7)],
      ]);

      return ids.map((id) => itemMap.get(id)).filter(Boolean) as ReturnType<
        typeof createProjectItem
      >[];
    });

    const tool = findTool("get_project_document_tree");
    const result = await tool.executor({ projectId: 7 });
    const payload = JSON.parse((result as { content: string }).content);

    expect(payload.success).toBe(true);
    expect(payload.itemCount).toBe(3);
    expect(payload.tree).toContain("研发项目 (projectId: 7)");
    expect(payload.tree).toContain("├── 总览 (projectItemId: 101)");
    expect(payload.tree).toContain("│   └── 接口设计 (projectItemId: 201)");
    expect(payload.tree).toContain("└── 实施计划 (projectItemId: 102)");
  });

  it("get_project_document_tree 传入 projectItemId 时应只返回对应子树", async () => {
    vi.mocked(getProjectById).mockResolvedValue({
      id: 9,
      title: "知识整理",
      children: [301],
      createTime: 1,
      updateTime: 1,
      desc: [],
      archived: false,
      pinned: false,
      projectType: "document-tree",
    } as any);

    vi.mocked(getProjectItemsByIds).mockImplementation(async (ids) => {
      const itemMap = new Map([
        [301, createProjectItem(301, "根节点", [302, 303], 9)],
        [302, createProjectItem(302, "子节点 A", [304], 9)],
        [303, createProjectItem(303, "子节点 B", [], 9)],
        [304, createProjectItem(304, "孙节点", [], 9)],
      ]);

      return ids.map((id) => itemMap.get(id)).filter(Boolean) as ReturnType<
        typeof createProjectItem
      >[];
    });

    const tool = findTool("get_project_document_tree");
    const result = await tool.executor({ projectId: 9, projectItemId: 302 });
    const payload = JSON.parse((result as { content: string }).content);

    expect(payload.success).toBe(true);
    expect(payload.rootProjectItemId).toBe(302);
    expect(payload.itemCount).toBe(2);
    expect(payload.tree).toContain("知识整理 (projectId: 9)");
    expect(payload.tree).toContain("└── 子节点 A (projectItemId: 302)");
    expect(payload.tree).toContain("    └── 孙节点 (projectItemId: 304)");
    expect(payload.tree).not.toContain("根节点 (projectItemId: 301)");
    expect(payload.tree).not.toContain("子节点 B (projectItemId: 303)");
  });

  it("get_project_document_tree 在 projectItemId 不属于项目时应返回错误", async () => {
    vi.mocked(getProjectById).mockResolvedValue({
      id: 11,
      title: "测试项目",
      children: [401],
      createTime: 1,
      updateTime: 1,
      desc: [],
      archived: false,
      pinned: false,
      projectType: "document-tree",
    } as any);
    vi.mocked(getProjectItemsByIds).mockResolvedValue([
      createProjectItem(401, "仅有节点", [], 11),
    ] as any);
    vi.mocked(getProjectItemById).mockResolvedValue({
      id: 999,
      title: "外部节点",
    } as any);

    const tool = findTool("get_project_document_tree");
    const result = await tool.executor({ projectId: 11, projectItemId: 999 });
    const payload = JSON.parse((result as { content: string }).content);

    expect(payload.success).toBe(false);
    expect(payload.error).toContain("不属于 projectId 11 的文档树");
  });
});
