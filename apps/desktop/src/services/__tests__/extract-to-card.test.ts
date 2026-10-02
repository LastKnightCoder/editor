import { createEditor, type Descendant } from "slate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copyExtractedBlocks, extractToCard, extractToCardWithFeedback } from "../extract-to-card";

const mocks = vi.hoisted(() => ({
  createScopedCard: vi.fn(),
  publishCardEvent: vi.fn(),
  database: "test",
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  openEntity: vi.fn(async () => undefined),
}));
vi.mock("@/commands/card", () => ({ createScopedCard: mocks.createScopedCard }));
vi.mock("@tau/ui", () => ({
  toast: { success: mocks.success, info: mocks.info, error: mocks.error },
}));
vi.mock("../open-content", () => ({ openEntity: mocks.openEntity }));
vi.mock("@/utils/event-bus/card-event-bus", () => ({
  defaultCardEventBus: { createEditor: () => ({ publishCardEvent: mocks.publishCardEvent }) },
}));
vi.mock("@/stores/useSettingStore", () => ({
  default: { getState: () => ({ setting: { database: { active: mocks.database } } }) },
}));

describe("抽成卡片", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.database = "test";
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
      }),
      expect.objectContaining({
        src: { kind: "article", id: 1 },
        relation: "derived",
        srcAnchor: {
          quote: expect.objectContaining({ exact: "选中文字", prefix: "前文", suffix: "后文" }),
        },
      })
    );
    expect(editor.children[0]).toMatchObject({ children: [{ text: "前文选中文字后文" }] });
  });
  const run = () => {
    const editor = createEditor();
    editor.children = [{ type: "paragraph", children: [{ type: "formatted", text: "引文" }] }];
    return extractToCardWithFeedback(
      editor,
      { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 2 } },
      { kind: "article", id: 1 }
    );
  };
  it("通知出现后切库，打开动作不使用新库同号卡片", async () => {
    await run();
    const action = mocks.success.mock.calls[0][1].action;
    mocks.database = "other";
    action.onClick();
    expect(mocks.openEntity).not.toHaveBeenCalled();
    mocks.database = "test";
    action.onClick();
    expect(mocks.openEntity).toHaveBeenCalledWith({ kind: "card", id: 42 });
  });
  it("创建期间切库不发布成功通知，事务失败也不会伪报成功", async () => {
    mocks.createScopedCard.mockImplementationOnce(async () => {
      mocks.database = "other";
      return { id: 42 };
    });
    await run();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.publishCardEvent).not.toHaveBeenCalled();
    mocks.createScopedCard.mockRejectedValueOnce(new Error("谱系写入失败"));
    await run();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("谱系写入失败");
  });
});
