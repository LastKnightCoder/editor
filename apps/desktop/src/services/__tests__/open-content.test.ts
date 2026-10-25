import { beforeEach, describe, expect, it, vi } from "vitest";
import { openContent, openEntity } from "../open-content";
import { registerPluginEntityKind } from "../plugin-entity-kinds";

const mocks = vi.hoisted(() => ({
  openPage: vi.fn(),
  getProjectItemById: vi.fn(),
  getDiaryMoment: vi.fn(),
  locatePluginEntity: vi.fn(),
  database: "main",
}));
vi.mock("@/commands/plugin-entities", () => ({ locatePluginEntity: mocks.locatePluginEntity }));
vi.mock("../page-navigation", () => ({
  openPage: mocks.openPage,
  getPageNavigation: () => ({
    navigator: { current: () => ({ key: "project-detail", params: { id: 7 } }) },
  }),
}));
vi.mock("@/commands/project", () => ({ getProjectItemById: mocks.getProjectItemById }));
vi.mock("@/commands/diary", () => ({ getDiaryMoment: mocks.getDiaryMoment }));
vi.mock("@/stores/useSettingStore", () => ({
  default: { getState: () => ({ setting: { database: { active: mocks.database } } }) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.database = "main";
});

describe("内容打开入口", () => {
  it("定位参数序列化后传入详情页", async () => {
    await openEntity({ kind: "article", id: 1 }, { at: { block: 5 } });
    expect(mocks.openPage).toHaveBeenLastCalledWith("article-detail", { id: 1, at: '{"block":5}' });
    await openEntity({ kind: "card", id: 2 }, { at: { block: 9 } });
    expect(mocks.openPage).toHaveBeenLastCalledWith("card-detail", { id: 2, at: '{"block":9}' });
  });
  it("卡片、文章、项目文档定位至对应 Page", async () => {
    await openContent("card", 3);
    expect(mocks.openPage).toHaveBeenLastCalledWith("card-detail", { id: 3 });
    await openContent("article", 4);
    expect(mocks.openPage).toHaveBeenLastCalledWith("article-detail", { id: 4 });
    mocks.getProjectItemById.mockResolvedValue({ id: 5, projects: [8, 7] });
    await openContent("project-item", 5);
    expect(mocks.openPage).toHaveBeenLastCalledWith("project-detail", { id: 7, itemId: 5 });
  });
  it("日记精确打开到命中的碎碎念，定位参数与片段 id 一起传入", async () => {
    mocks.getDiaryMoment.mockResolvedValue({ id: 12, entryDate: "2026-09-18" });
    await openEntity({ kind: "diary-moment", id: 12 }, { at: { block: 2 } });
    expect(mocks.openPage).toHaveBeenLastCalledWith("diary", {
      date: "2026-09-18",
      moment: "12",
      at: '{"block":2}',
    });
    await openContent("diary-moment", 12);
    expect(mocks.getDiaryMoment).toHaveBeenLastCalledWith(12);
    mocks.getProjectItemById.mockResolvedValue({ id: 5, projects: [7] });
    await openContent("project_item", 5);
    expect(mocks.openPage).toHaveBeenLastCalledWith("project-detail", { id: 7, itemId: 5 });
  });
  it("旧周记条目按归属日（该周周一）打开", async () => {
    mocks.getDiaryMoment.mockResolvedValue({ id: 3, entryDate: "2025-W46", createTime: 0 });
    await openEntity({ kind: "diary-moment", id: 3 });
    expect(mocks.openPage).toHaveBeenLastCalledWith("diary", { date: "2025-11-10", moment: "3" });
  });
  it("日记查询期间切库不导航", async () => {
    mocks.getDiaryMoment.mockImplementation(async () => {
      mocks.database = "other";
      return { id: 2, entryDate: "2026-09-18" };
    });
    await expect(openEntity({ kind: "diary-moment", id: 2 })).rejects.toThrow("数据库已切换");
    expect(mocks.openPage).not.toHaveBeenCalled();
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
      return { id: 5, projects: [7] };
    });
    await expect(openContent("project-item", 5)).rejects.toThrow("数据库已切换");
    expect(mocks.openPage).not.toHaveBeenCalled();
  });
  it("无效 ID 与未实现类型返回错误", async () => {
    await expect(openContent("card", 0)).rejects.toThrow("ID 无效");
    await expect(openContent("unknown", 1)).rejects.toThrow("暂不支持");
    expect(mocks.openPage).not.toHaveBeenCalled();
  });

  it("插件内容：插件在运行时进入插件页面并带定位，停用后打开只读页", async () => {
    const entity = { id: 6, pluginId: "tau.weekly-review", kind: "note", contentId: 9 };
    mocks.locatePluginEntity.mockResolvedValue(entity);
    const open = vi.fn();
    const dispose = registerPluginEntityKind({
      pluginId: "tau.weekly-review",
      kind: "note",
      label: "周记",
      mentionable: true,
      open,
    });
    await openContent("plugin-entity", 6);
    await openEntity({ kind: "plugin-entity", id: 6 }, { at: { block: 2 } });
    expect(mocks.locatePluginEntity).toHaveBeenLastCalledWith("main", 6);
    expect(open.mock.calls).toEqual([
      [entity, undefined],
      [entity, '{"block":2}'],
    ]);
    expect(mocks.openPage).not.toHaveBeenCalled();

    dispose();
    await openEntity({ kind: "plugin-entity", id: 6 }, { at: { block: 2 } });
    expect(mocks.openPage).toHaveBeenLastCalledWith("plugin-entity", { id: 6, at: '{"block":2}' });

    mocks.locatePluginEntity.mockResolvedValue(null);
    await expect(openEntity({ kind: "plugin-entity", id: 7 })).rejects.toThrow("内容不存在");
  });
});
