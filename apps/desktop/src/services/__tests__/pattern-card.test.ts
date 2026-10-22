import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeMark } from "@/types/knowledge-insights";

const mocks = vi.hoisted(() => ({
  write: vi.fn(),
  discard: vi.fn(),
  openEntity: vi.fn(),
  publishCardEvent: vi.fn(),
  error: vi.fn(),
  active: "main",
}));
vi.mock("@/commands/knowledge-insights", () => ({
  writePatternCard: mocks.write,
  discardPatternCard: mocks.discard,
}));
vi.mock("../open-content", () => ({ openEntity: mocks.openEntity }));
vi.mock("@/utils/event-bus/card-event-bus", () => ({
  defaultCardEventBus: { createEditor: () => ({ publishCardEvent: mocks.publishCardEvent }) },
}));
vi.mock("@tau/ui", () => ({ toast: { error: mocks.error } }));
vi.mock("@/stores/useSettingStore", () => ({
  default: { getState: () => ({ setting: { database: { active: mocks.active } } }) },
}));

import {
  patternCardPlaceholder,
  patternCardPlaceholderOf,
  settlePatternCard,
  startPatternCard,
  watchPatternCard,
} from "../pattern-card";
import { isBlankCardContent } from "@/utils/card";

const mark = { id: "p1", text: "用 dpr 桥接", why: "五篇都用到了" } as KnowledgeMark;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

let nextId = 40;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.active = "main";
  const card = { id: ++nextId };
  mocks.write.mockResolvedValue(card);
  mocks.discard.mockResolvedValue(card);
  mocks.openEntity.mockResolvedValue(undefined);
});

describe("同一思路写成卡片（渲染端）", () => {
  it("占位提示：思路名 + AI 的理由，不写进正文", () => {
    expect(patternCardPlaceholder(mark)).toBe(
      "用自己的话写下「用 dpr 桥接」这个思路。五篇都用到了"
    );
    expect(patternCardPlaceholder({ kind: "pattern", text: "x", why: "" })).toBe(
      "用自己的话写下「x」这个思路"
    );
  });

  it("建卡后登记草稿并打开；离开时还空着就撤回", async () => {
    await startPatternCard(2, mark);
    const id = nextId;
    expect(mocks.write).toHaveBeenCalledWith(2, "p1");
    expect(mocks.publishCardEvent).toHaveBeenCalledWith("card:created", { id });
    expect(mocks.openEntity).toHaveBeenCalledWith({ kind: "card", id });
    expect(patternCardPlaceholderOf(id)).toContain("用 dpr 桥接");

    watchPatternCard(id, () => true);
    settlePatternCard(id);
    await flush();
    expect(mocks.discard).toHaveBeenCalledWith(2, "p1", id);
    expect(mocks.publishCardEvent).toHaveBeenCalledWith("card:deleted", { id });
    expect(patternCardPlaceholderOf(id)).toBeNull();
  });

  it("写了内容就转正，不撤回、不再是草稿", async () => {
    await startPatternCard(2, mark);
    watchPatternCard(nextId, () => false);
    settlePatternCard(nextId);
    expect(mocks.discard).not.toHaveBeenCalled();
    expect(patternCardPlaceholderOf(nextId)).toBeNull();
    settlePatternCard(nextId);
    expect(mocks.discard).not.toHaveBeenCalled();
  });

  it("打开失败时撤回；切了库不跨库删", async () => {
    mocks.openEntity.mockRejectedValueOnce(new Error("打不开"));
    await expect(startPatternCard(2, mark)).rejects.toThrow("打不开");
    expect(mocks.discard).toHaveBeenCalledWith(2, "p1", nextId);

    mocks.discard.mockClear();
    await startPatternCard(2, mark);
    mocks.active = "other";
    settlePatternCard(nextId);
    expect(mocks.discard).not.toHaveBeenCalled();
  });
});

describe("isBlankCardContent", () => {
  const paragraph = (...children: object[]) => ({ type: "paragraph", children });
  it("只有新建时那个空段落才算空", () => {
    expect(isBlankCardContent([])).toBe(true);
    expect(isBlankCardContent([paragraph({ type: "formatted", text: "" })] as never)).toBe(true);
    expect(isBlankCardContent([paragraph({ type: "formatted", text: "字" })] as never)).toBe(false);
    expect(isBlankCardContent([{ type: "image", children: [{ text: "" }] }] as never)).toBe(false);
    expect(
      isBlankCardContent([paragraph({ type: "inline-math", children: [{ text: "" }] })] as never)
    ).toBe(false);
    expect(
      isBlankCardContent([
        paragraph({ type: "formatted", text: "" }),
        paragraph({ type: "formatted", text: "" }),
      ] as never)
    ).toBe(false);
  });
});
