import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveContentTarget } from "../resolver";

const mocks = vi.hoisted(() => ({
  active: vi.fn(),
  card: vi.fn(),
  article: vi.fn(),
  project: vi.fn(),
}));
vi.mock("@/mcp/tab-content/utils", () => ({ getActiveTab: mocks.active }));
vi.mock("@/commands/card", () => ({ getCardById: mocks.card }));
vi.mock("@/commands/article", () => ({ findOneArticle: mocks.article }));
vi.mock("@/commands/project", () => ({ getProjectItemById: mocks.project }));
vi.mock("@/commands/content", () => ({ getContentById: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("Page 编辑目标解析", () => {
  it("显式 contentId 不依赖当前页面", async () => {
    expect(await resolveContentTarget({ contentId: 8 })).toEqual({
      contentId: 8,
      source: "explicit",
    });
    expect(mocks.active).not.toHaveBeenCalled();
  });
  it("使用当前项目页的 itemId，不使用项目 ID 读取正文", async () => {
    mocks.active.mockReturnValue({
      paneId: "page-stack",
      tab: { id: "entry", type: "project-detail", params: { id: 7, itemId: 12 } },
    });
    mocks.project.mockResolvedValue({ id: 12, contentId: 101 });
    expect(await resolveContentTarget()).toMatchObject({
      contentId: 101,
      entityId: 12,
      entityType: "project-item",
    });
    expect(mocks.project).toHaveBeenCalledWith(12);
  });
  it("项目概览和非编辑页面拒绝推测编辑目标", async () => {
    mocks.active.mockReturnValue({
      paneId: "page-stack",
      tab: { type: "project-detail", params: { id: 7 } },
    });
    await expect(resolveContentTarget()).rejects.toThrow("项目总览");
    mocks.active.mockReturnValue({ paneId: "page-stack", tab: { type: "home", params: {} } });
    await expect(resolveContentTarget()).rejects.toThrow("暂不支持编辑");
    expect(mocks.project).not.toHaveBeenCalled();
  });
});
