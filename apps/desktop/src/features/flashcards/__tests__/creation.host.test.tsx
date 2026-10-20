import { StrictMode, act, type ComponentProps } from "react";
import type { Flashcard, FlashcardDeck } from "@/types";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

type DeckSelectorProps = ComponentProps<typeof import("../components/DeckSelectorDialog").default>;
type CreateCardProps = ComponentProps<typeof import("../components/CreateFlashcardDialog").default>;
type GenerationProps = ComponentProps<
  typeof import("../components/FlashcardGenerationDialog").default
>;

vi.mock("@/stores/useSettingStore", async () => {
  const { create } = await import("zustand");
  return { default: create(() => ({ setting: { database: { active: "a" } } })) };
});
vi.mock("@/hooks/useLLMConfig", () => ({
  default: () => ({ provider: { id: "p" }, model: { id: "m" } }),
}));
vi.mock("@/services/piLLM", () => ({ piStreamText: vi.fn() }));
vi.mock("@/utils/markdown", () => ({
  importFromMarkdown: (text: string) => [{ type: "paragraph", children: [{ text }] }],
  getMarkdown: () => "原文",
}));
const mocks = vi.hoisted(() => ({ createCard: vi.fn(), start: vi.fn() }));
vi.mock("../queries", () => ({ useFlashcardMutations: () => ({ createCard: mocks.createCard }) }));
vi.mock("@/commands/flashcard", () => ({
  getFlashcardDeck: async () => ({ id: 7, name: "目标组" }),
}));
vi.mock("../hooks/useFlashcardGeneration", () => ({
  default: () => ({
    generatedCards: [
      { id: "draft", selected: true, type: "qa", prompt: [], data: { answer: "答案" } },
    ],
    startGeneration: mocks.start,
    stopGeneration: () => undefined,
    reset: () => undefined,
    removeCard: () => undefined,
    toggleCardSelection: () => undefined,
  }),
}));
vi.mock("../components/DeckSelectorDialog", () => ({
  default: ({ open, onSelect, onCancel }: DeckSelectorProps) =>
    open ? (
      <button
        onClick={() => {
          onSelect({ id: 7, name: "组" } as FlashcardDeck);
          onCancel();
        }}
      >
        选卡组
      </button>
    ) : null,
}));
vi.mock("../components/CreateFlashcardDialog", () => ({
  default: ({ open, activeDeckId, onCreated, onClose, initialReferences }: CreateCardProps) =>
    open ? (
      <button
        onClick={() => {
          onCreated?.({
            id: 9,
            deckId: activeDeckId,
            references: (initialReferences ?? []).map(reference => ({
              refType: reference.refType,
              title: reference.title,
              contentId: reference.contentId ?? 42,
              content: { content: reference.customContent },
            })),
          } as Flashcard);
          onClose();
        }}
      >
        保存手动卡
      </button>
    ) : null,
}));
vi.mock("../components/FlashcardGenerationDialog", () => ({
  default: ({ open, onConfirm, onCancel }: GenerationProps) =>
    open ? (
      <>
        <button onClick={onConfirm}>保存生成卡</button>
        <button onClick={onCancel}>取消生成</button>
      </>
    ) : null,
}));
vi.mock("../components/GeneratedFlashcardEditDialog", () => ({ default: () => null }));

import { FlashcardCreationHost } from "../FlashcardCreationHost";
import { flashcardCreationRequests, openFlashcardCreation } from "@/services/flashcard-creation";

let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = undefined;
  container?.remove();
  vi.clearAllMocks();
});
async function mount() {
  container = document.createElement("div");
  document.body.append(container);
  const mounted = createRoot(container);
  root = mounted;
  await act(async () => {
    mounted.render(
      <StrictMode>
        <FlashcardCreationHost />
      </StrictMode>
    );
  });
}
async function click(label: string, twice = false) {
  await act(async () => {
    const button = Array.from(container.querySelectorAll("button")).find(
      item => item.textContent === label
    );
    if (!button) throw new Error(`没有找到按钮：${label}`);
    button.click();
    if (twice) button.click();
  });
}

describe("全局制卡窗口行为", () => {
  it("StrictMode 下选择卡组不会提前结算，手动保存回传记录", async () => {
    await mount();
    let result!: ReturnType<typeof openFlashcardCreation>;
    await act(async () => {
      result = openFlashcardCreation({ content: "原文" });
    });
    await click("选卡组");
    expect(flashcardCreationRequests.getSnapshot()).not.toBeNull();
    await click("保存手动卡");
    expect(await result).toMatchObject({ status: "completed", cards: [{ id: 9, deckId: 7 }] });
    expect((await result).cards[0].references?.[0]).toMatchObject({
      refType: "custom",
      customContent: [{ type: "paragraph", children: [{ text: "原文" }] }],
    });
  });

  it("指定卡组的 AI 模式直接生成并阻止双击重复保存", async () => {
    mocks.createCard.mockResolvedValue({ id: 10, deckId: 7, references: [] });
    await mount();
    let result!: ReturnType<typeof openFlashcardCreation>;
    await act(async () => {
      result = openFlashcardCreation({ mode: "ai", content: "原文", deckId: 7 });
    });
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("保存手动卡");
    await click("保存生成卡", true);
    expect(mocks.createCard).toHaveBeenCalledTimes(1);
    expect(await result).toMatchObject({ status: "completed", cards: [{ id: 10 }] });
  });

  it("卸载承载时结算取消，不遗留占用", async () => {
    await mount();
    let result!: ReturnType<typeof openFlashcardCreation>;
    await act(async () => {
      result = openFlashcardCreation();
    });
    await act(async () => {
      root?.unmount();
      root = undefined;
    });
    expect(await result).toEqual({ status: "cancelled", cards: [] });
    expect(flashcardCreationRequests.getSnapshot()).toBeNull();
  });
});
