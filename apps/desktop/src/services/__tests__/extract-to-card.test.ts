import { createEditor, type Descendant } from "slate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copyExtractedBlocks, extractToCard } from "../extract-to-card";

const mocks = vi.hoisted(() => ({
  createScopedCard: vi.fn(),
  recordLineage: vi.fn(),
  publishCardEvent: vi.fn(),
}));
vi.mock("@/commands/card", () => ({ createScopedCard: mocks.createScopedCard }));
vi.mock("@/commands/lineage", () => ({ recordLineage: mocks.recordLineage }));
vi.mock("../open-content", () => ({ openEntity: vi.fn() }));
vi.mock("@/utils/event-bus/card-event-bus", () => ({
  defaultCardEventBus: { createEditor: () => ({ publishCardEvent: mocks.publishCardEvent }) },
}));
vi.mock("@/stores/useSettingStore", () => ({
  default: { getState: () => ({ setting: { database: { active: "test" } } }) },
}));

describe("抽成卡片", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createScopedCard.mockResolvedValue({ id: 42 });
  });
  it("深拷贝去掉所有 collabId，保留格式与引用", () => {
    const source = [
      {
        type: "paragraph",
        collabId: "block",
        children: [{ type: "formatted", text: "引文", bold: true, collabId: "leaf" }],
      },
    ] as unknown as Descendant[];
    const copied = copyExtractedBlocks(source);
    expect(JSON.stringify(copied)).not.toContain("collabId");
    expect(JSON.stringify(copied)).toContain('"bold":true');
    expect(copied[0]).not.toBe(source[0]);
    expect(JSON.stringify(source)).toContain("collabId");
  });
  it("复制选区为永久卡片并记录 derived 与引述锚点", async () => {
    const editor = createEditor();
    editor.children = [
      { type: "paragraph", children: [{ type: "formatted", text: "前文选中文字后文" }] },
    ];
    await extractToCard(
      editor,
      { anchor: { path: [0, 0], offset: 2 }, focus: { path: [0, 0], offset: 6 } },
      { kind: "article", id: 1 }
    );
    expect(mocks.createScopedCard).toHaveBeenCalledWith(
      "test",
      expect.objectContaining({
        category: "permanent",
        content: [{ type: "paragraph", children: [{ type: "formatted", text: "选中文字" }] }],
      })
    );
    expect(mocks.recordLineage).toHaveBeenCalledWith(
      expect.objectContaining({
        src: { kind: "article", id: 1 },
        dst: { kind: "card", id: 42 },
        relation: "derived",
        srcAnchor: {
          quote: expect.objectContaining({ exact: "选中文字", prefix: "前文", suffix: "后文" }),
        },
      })
    );
    expect(editor.children[0]).toMatchObject({ children: [{ text: "前文选中文字后文" }] });
  });
});
