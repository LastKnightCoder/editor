import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Descendant } from "slate";

import FlashcardReviewDeckList, { buildFlashcardReviewDeckSummaries } from ".";
import type { Flashcard, FlashcardDeck } from "@/types";

const BASE_TIME = new Date("2026-06-21T08:00:00.000Z").getTime();

const createDeck = (
  id: number,
  name: string,
  overrides: Partial<FlashcardDeck> = {}
): FlashcardDeck => ({
  id,
  name,
  description: "",
  coverColor: "#14b8a6",
  emoji: "🧠",
  sortOrder: 0,
  meta: null,
  createTime: BASE_TIME,
  updateTime: BASE_TIME,
  ...overrides,
});

const createCard = (
  id: number,
  deckId: number,
  promptText: string,
  overrides: Partial<Flashcard> = {}
): Flashcard => ({
  id,
  deckId,
  type: "qa",
  prompt: [{ type: "paragraph", children: [{ text: promptText }] }] as Descendant[],
  detail: [{ type: "paragraph", children: [{ text: "" }] }] as Descendant[],
  data: {},
  tags: [],
  difficulty: "standard",
  reviewLevel: 0,
  dueTime: BASE_TIME,
  lastReviewTime: null,
  reviewCount: 0,
  easeFactor: 2.5,
  status: "review",
  references: [],
  createTime: BASE_TIME,
  updateTime: BASE_TIME,
  ...overrides,
});

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { root, container };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("FlashcardReviewDeckList", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("按待复习数量分组排序，并在找不到卡组时使用回退名称", () => {
    const decks = [createDeck(1, "算法"), createDeck(2, "英语")];
    const queue = [
      createCard(1, 2, "word"),
      createCard(2, 1, "graph"),
      createCard(3, 2, "phrase"),
      createCard(4, 99, "unknown"),
    ];

    const summaries = buildFlashcardReviewDeckSummaries(queue, decks);

    expect(summaries.map(item => item.deckName)).toEqual(["英语", "算法", "卡组 #99"]);
    expect(summaries.map(item => item.cards.length)).toEqual([2, 1, 1]);
  });

  it("空队列返回空摘要并展示空状态", async () => {
    expect(buildFlashcardReviewDeckSummaries([], [])).toEqual([]);

    const { root, container } = await mount(
      <FlashcardReviewDeckList reviewQueue={[]} decks={[]} onStartDeckReview={vi.fn()} />
    );

    expect(container.textContent).toContain("暂无待复习");
    expect(container.textContent).not.toContain("点击刷新检查复习队列");

    await unmount(root, container);
  });

  it("展示卡组摘要并在点击复习时传出 deckId", async () => {
    const onStartDeckReview = vi.fn();
    const decks = [createDeck(1, "算法"), createDeck(2, "英语")];
    const queue = [
      createCard(1, 2, "first word"),
      createCard(2, 2, "second word"),
      createCard(3, 1, "graph"),
    ];

    const { root, container } = await mount(
      <FlashcardReviewDeckList
        reviewQueue={queue}
        decks={decks}
        onStartDeckReview={onStartDeckReview}
      />
    );

    expect(container.textContent).not.toContain("3 张待复习，来自 2 个卡组");
    expect(container.textContent).not.toContain("下一张：first word");
    expect(container.textContent).toContain("英语");
    expect(container.textContent).toContain("算法");

    const reviewButton = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "复习"
    );
    expect(reviewButton).toBeTruthy();

    await act(async () => {
      reviewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onStartDeckReview).toHaveBeenCalledWith(2);

    await unmount(root, container);
  });
});
