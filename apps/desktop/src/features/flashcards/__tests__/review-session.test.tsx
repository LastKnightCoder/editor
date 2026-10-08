import type { Flashcard } from "@/types";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReviewSession } from "../hooks/useReviewSession";
import { scheduleSnapshot } from "../model";

const { reset, toastError } = vi.hoisted(() => ({ reset: vi.fn(), toastError: vi.fn() }));
vi.mock("@/hooks/useAnswerJudgement", () => ({
  default: () => ({ status: "idle", result: null, reset, isConfigured: false }),
}));
vi.mock("@/page/PageProvider", () => ({ useOverlayDismiss: vi.fn() }));
vi.mock("@tau/ui", () => ({ toast: { error: toastError, info: vi.fn() } }));

const makeCard = (id: number): Flashcard => ({
  id,
  deckId: 1,
  type: "qa",
  prompt: [],
  detail: [],
  data: { answer: "答案" },
  tags: [],
  difficulty: "standard",
  dueTime: 0,
  lastReviewTime: null,
  reviewCount: 0,
  memoryStability: null,
  memoryDifficulty: null,
  status: "new",
  references: [],
  createTime: 0,
  updateTime: 0,
});
const first = makeCard(1);
const receipt = { cardId: 1, reviewId: 1, previous: scheduleSnapshot(first) };
let cards: Map<number, Flashcard>;
let root: Root;
let host: HTMLDivElement;
let session: ReturnType<typeof useReviewSession>;
const mutations = {
  submitReview: vi.fn().mockResolvedValue(receipt),
  undoReview: vi.fn().mockResolvedValue(first),
  setSuspended: vi.fn().mockResolvedValue(undefined),
};
const onExit = vi.fn();

function Probe() {
  session = useReviewSession({ queue: [1, 2], cardsById: cards, mutations, onExit });
  return null;
}

beforeEach(async () => {
  vi.clearAllMocks();
  cards = new Map([
    [1, first],
    [2, makeCard(2)],
  ]);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("复习会话边界", () => {
  it("评分提交期间拒绝重复提交、跳过、暂停与退出", async () => {
    let finish!: (value: typeof receipt) => void;
    mutations.submitReview.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    await act(async () => session.submit());
    let pending!: Promise<void>;
    await act(async () => {
      pending = session.rate("normal");
      void session.rate("easy");
      session.skip();
      void session.suspend();
      session.exit();
    });
    expect(mutations.submitReview).toHaveBeenCalledTimes(1);
    expect(mutations.setSuspended).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
    expect(session.card?.id).toBe(1);
    await act(async () => {
      finish(receipt);
      await pending;
    });
    expect(session.card?.id).toBe(2);
    expect(session.history).toHaveLength(1);
    expect(session.revealed).toBe(false);
  });

  it("暂停失败时保留当前卡与作答", async () => {
    mutations.setSuspended.mockRejectedValueOnce(new Error("写入失败"));
    await act(async () => session.submit({ qa: "回答" }));
    await act(async () => session.suspend());
    expect(session.card?.id).toBe(1);
    expect(session.answer.qa).toBe("回答");
    expect(session.revealed).toBe(true);
    expect(toastError).toHaveBeenCalledWith("暂停失败");
  });

  it("当前卡被外部删除后清空作答，不把翻面状态带到下一张", async () => {
    await act(async () => session.submit({ qa: "上一张的回答" }));
    cards = new Map([[2, makeCard(2)]]);
    await act(async () => root.render(<Probe />));
    expect(session.card?.id).toBe(2);
    expect(session.answer).toEqual({});
    expect(session.revealed).toBe(false);
  });

  it("撤销使用主进程返回的评分凭据并回到上一张", async () => {
    await act(async () => session.submit());
    await act(async () => session.rate("normal"));
    await act(async () => session.undo());
    expect(mutations.undoReview).toHaveBeenCalledWith(receipt);
    expect(session.card?.id).toBe(1);
    expect(session.history).toHaveLength(0);
  });
});
