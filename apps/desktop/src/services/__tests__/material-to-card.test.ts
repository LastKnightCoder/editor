import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createScopedCard: vi.fn(),
  recordLineage: vi.fn(),
  resolveMaterials: vi.fn(),
  publishCardEvent: vi.fn(),
}));
vi.mock("@/commands/card", () => ({ createScopedCard: mocks.createScopedCard }));
vi.mock("@/commands/lineage", () => ({ recordLineage: mocks.recordLineage }));
vi.mock("../open-material", () => ({ resolveMaterials: mocks.resolveMaterials }));
vi.mock("../open-content", () => ({ openEntity: vi.fn() }));
vi.mock("@/utils/event-bus/card-event-bus", () => ({
  defaultCardEventBus: { createEditor: () => ({ publishCardEvent: mocks.publishCardEvent }) },
}));
vi.mock("@/utils/markdown", () => ({ importFromMarkdown: (md: string) => [{ md }] }));
vi.mock("@/utils/helper", () => ({ getContentLength: () => 3 }));
vi.mock("@/stores/useSettingStore", () => ({
  default: { getState: () => ({ setting: { database: { active: "main" } } }) },
}));

import { createCardFromMaterial, materialCardMarkdown } from "../material-to-card";

beforeEach(() => vi.clearAllMocks());

describe("外部材料转为卡片（E4）", () => {
  it("引用块原文 + 想法 + 出处", () => {
    expect(
      materialCardMarkdown({
        quote: "第一段\n  第二段",
        note: "我的想法",
        meta: "PDF · 论文.pdf · 第 3 页",
      })
    ).toBe("> 第一段\n> 第二段\n\n我的想法\n\n—— PDF · 论文.pdf · 第 3 页");
    expect(materialCardMarkdown({ quote: "只有原文", note: "", meta: "网页 · a.com" })).toBe(
      "> 只有原文\n\n—— 网页 · a.com"
    );
  });

  it("建文献卡片并记谱系 excerpt_of", async () => {
    mocks.resolveMaterials.mockResolvedValue([{ quote: "原文", note: "", meta: "出处" }]);
    mocks.createScopedCard.mockResolvedValue({ id: 42 });
    await createCardFromMaterial({ kind: "pdf-annotation", id: 5 });

    expect(mocks.createScopedCard).toHaveBeenCalledWith(
      "main",
      expect.objectContaining({ category: "literature", content: [{ md: "> 原文\n\n—— 出处" }] })
    );
    expect(mocks.recordLineage).toHaveBeenCalledWith({
      src: { kind: "pdf-annotation", id: 5 },
      dst: { kind: "card", id: 42 },
      relation: "excerpt_of",
    });
    expect(mocks.publishCardEvent).toHaveBeenCalledWith("card:created", { id: 42 });
  });

  it("没有文字的材料（如无批注的区域截图）不建卡", async () => {
    mocks.resolveMaterials.mockResolvedValue([{ quote: "", note: "", meta: "出处" }]);
    await expect(createCardFromMaterial({ kind: "pdf-annotation", id: 6 })).rejects.toThrow();
    expect(mocks.createScopedCard).not.toHaveBeenCalled();
  });
});
