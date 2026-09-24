import { beforeEach, describe, expect, it, vi } from "vitest";
import { openContent } from "../open-content";

const mocks = vi.hoisted(() => ({
  openPage: vi.fn(),
  getProjectItemById: vi.fn(),
  database: "main",
}));
vi.mock("../page-navigation", () => ({
  openPage: mocks.openPage,
  getPageNavigation: () => ({
    navigator: { current: () => ({ key: "project-detail", params: { id: 7 } }) },
  }),
}));
vi.mock("@/commands/project", () => ({ getProjectItemById: mocks.getProjectItemById }));
vi.mock("@/stores/useSettingStore", () => ({
  default: { getState: () => ({ setting: { database: { active: mocks.database } } }) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.database = "main";
});

describe("内容打开入口", () => {
  it("卡片、文章、项目文档定位至对应 Page", async () => {
    await openContent("card", 3);
    expect(mocks.openPage).toHaveBeenLastCalledWith("card-detail", { id: 3 });
    await openContent("article", 4);
    expect(mocks.openPage).toHaveBeenLastCalledWith("article-detail", { id: 4 });
    mocks.getProjectItemById.mockResolvedValue({ projects: [8, 7] });
    await openContent("project-item", 5);
    expect(mocks.openPage).toHaveBeenLastCalledWith("project-detail", { id: 7, itemId: 5 });
  });
  it("退役类型明确拒绝打开", async () => {
    await expect(openContent("document-item", 6)).rejects.toThrow("暂不支持");
    expect(mocks.openPage).not.toHaveBeenCalled();
  });
  it("缺失条目与切库期间的迟到响应均不导航", async () => {
    mocks.getProjectItemById.mockResolvedValue(null);
    await expect(openContent("project-item", 5)).rejects.toThrow("不存在");
    mocks.getProjectItemById.mockImplementation(async () => {
      mocks.database = "other";
      return { projects: [7] };
    });
    await expect(openContent("project-item", 5)).rejects.toThrow("数据库已切换");
    expect(mocks.openPage).not.toHaveBeenCalled();
  });
  it("无效 ID 与未实现类型返回错误", async () => {
    await expect(openContent("card", 0)).rejects.toThrow("ID 无效");
    await expect(openContent("unknown", 1)).rejects.toThrow("暂不支持");
    expect(mocks.openPage).not.toHaveBeenCalled();
  });
});
