import type { Flashcard } from "@/types";
import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  HOUR_MS,
  deckStats,
  dueText,
  formatSpan,
  judgeAnswer,
  nextInterval,
  resumedStatus,
  reviewQueue,
  scoreToRating,
  sectionOf,
  suggestRating,
} from "../model";

const NOW = new Date(2026, 8, 24, 14, 20).getTime();

let seq = 0;
function card(patch: Partial<Flashcard> = {}): Flashcard {
  seq += 1;
  return {
    id: seq,
    deckId: 1,
    type: "qa",
    prompt: [{ type: "paragraph", children: [{ type: "formatted", text: "q" }] }] as never,
    detail: [],
    data: {},
    tags: [],
    difficulty: "standard",
    dueTime: NOW,
    lastReviewTime: null,
    reviewCount: 0,
    memoryStability: null,
    memoryDifficulty: null,
    status: "new",
    references: [],
    createTime: NOW,
    updateTime: NOW,
    ...patch,
  };
}

describe("排期预估（与主进程 calculateSchedule 同式，FSRS-6）", () => {
  // 期望值与 @tau/shared 的 fsrs-schedule.fixture.json 对拍（fsrs-rs 权威输出）。
  // ts-fsrs 为 f64、fsrs-rs 为 f32，毫秒值允许 ±0.001 天（86.4s）的浮点噪声。
  const expectIntervalDays = (ms: number, expectedDays: number) => {
    expect(ms).toBeGreaterThan((expectedDays - 0.001) * DAY_MS);
    expect(ms).toBeLessThan((expectedDays + 0.001) * DAY_MS);
  };

  it("新卡首评：初始稳定性取 FSRS 默认参数 w[0..3]，间隔即稳定性", () => {
    const c = card();
    expectIntervalDays(nextInterval(c, "hard", NOW), 0.212);
    expectIntervalDays(nextInterval(c, "struggle", NOW), 1.2931);
    expectIntervalDays(nextInterval(c, "normal", NOW), 2.3065);
    expectIntervalDays(nextInterval(c, "easy", NOW), 8.2956);
  });

  it("已学卡按记忆状态与经过天数推进（0.9 保留率下间隔 = 新稳定性）", () => {
    const c = card({
      memoryStability: 5,
      memoryDifficulty: 5,
      lastReviewTime: NOW - 3 * DAY_MS,
    });
    expectIntervalDays(nextInterval(c, "hard", NOW), 0.9057792592592593);
    expectIntervalDays(nextInterval(c, "normal", NOW), 13.404757037037037);
    expectIntervalDays(nextInterval(c, "easy", NOW), 20.74126962962963);
  });

  it("当天再评（elapsed=0）走 FSRS 短期分支：好评分不降低稳定性", () => {
    const c = card({ memoryStability: 5, memoryDifficulty: 5, lastReviewTime: NOW - HOUR_MS });
    expectIntervalDays(nextInterval(c, "normal", NOW), 5);
    expectIntervalDays(nextInterval(c, "hard", NOW), 1.5968177777777777);
  });

  it("间隔文案", () => {
    expect(formatSpan(6 * 60_000)).toBe("6 分钟");
    expect(formatSpan(15 * HOUR_MS)).toBe("15 小时");
    expect(formatSpan(5 * DAY_MS)).toBe("5 天");
    expect(formatSpan(78 * DAY_MS)).toBe("3 个月");
  });
});

describe("队列与分段", () => {
  it("暂停的卡不入队，按到期时间与稳定性排序（低稳定优先），可限定卡组", () => {
    const a = card({ dueTime: NOW - 2 * HOUR_MS, memoryStability: 3, status: "review" });
    const b = card({ dueTime: NOW - 2 * HOUR_MS, memoryStability: 1, status: "learning" });
    const c = card({ dueTime: NOW - DAY_MS, status: "suspended" });
    const d = card({ dueTime: NOW + HOUR_MS, status: "review" });
    const e = card({ dueTime: NOW - 10 * 60_000, deckId: 2 });
    expect(reviewQueue([a, b, c, d, e], NOW).map(x => x.id)).toEqual([b.id, a.id, e.id]);
    expect(reviewQueue([a, b, c, d, e], NOW, 2).map(x => x.id)).toEqual([e.id]);
  });

  it("到期文案与分段", () => {
    expect(dueText(card({ dueTime: NOW - 2 * DAY_MS, status: "review" }), NOW)).toEqual({
      text: "逾期 2 天",
      tone: "late",
    });
    expect(dueText(card({ dueTime: NOW - HOUR_MS, status: "review" }), NOW).text).toBe("现在");
    expect(dueText(card({ dueTime: NOW + 2 * HOUR_MS, status: "review" }), NOW).text).toBe(
      "今天 16:20"
    );
    expect(sectionOf(card({ dueTime: NOW + 2 * HOUR_MS, status: "review" }), NOW)).toBe("today");
    expect(sectionOf(card({ dueTime: NOW + 3 * DAY_MS, status: "review" }), NOW)).toBe("week");
    expect(sectionOf(card({ dueTime: NOW + 9 * DAY_MS, status: "review" }), NOW)).toBe("later");
    expect(sectionOf(card({ status: "suspended" }), NOW)).toBe("suspended");
  });

  it("卡组统计：到期含新卡，预报不含新卡与暂停", () => {
    const stats = deckStats(
      [
        card({ status: "new" }),
        card({ status: "review", dueTime: NOW - HOUR_MS }),
        card({ status: "learning", dueTime: NOW + HOUR_MS }),
        card({ status: "review", dueTime: NOW + DAY_MS }),
        card({ status: "suspended", dueTime: NOW - HOUR_MS }),
      ],
      NOW
    );
    expect(stats).toMatchObject({
      total: 5,
      due: 2,
      fresh: 1,
      learning: 1,
      review: 2,
      suspended: 1,
      laterToday: 1,
    });
    expect(stats.forecast).toEqual([2, 1, 0, 0, 0, 0, 0]);
  });

  it("暂停恢复按稳定性还原状态", () => {
    expect(resumedStatus(card({ reviewCount: 0 }))).toBe("new");
    expect(resumedStatus(card({ reviewCount: 2, memoryStability: 0.5 }))).toBe("learning");
    expect(resumedStatus(card({ reviewCount: 5, memoryStability: 5 }))).toBe("review");
  });
});

describe("作答判定与推荐评分", () => {
  const options = [
    { id: "a", label: "A", isCorrect: true },
    { id: "b", label: "B", isCorrect: true },
    { id: "c", label: "C", isCorrect: false },
  ];

  it("多选需完全一致", () => {
    const c = card({ type: "multiple-choice", data: { options } });
    expect(judgeAnswer(c, { multi: ["b", "a"] })).toBe(true);
    expect(judgeAnswer(c, { multi: ["a"] })).toBe(false);
  });

  it("填空忽略大小写与首尾空白，接受备选答案", () => {
    const prompt = [
      {
        type: "paragraph",
        children: [
          { type: "formatted", text: "由 " },
          {
            type: "flashcard-blank",
            blankId: "x",
            answer: "MMU",
            alternativeAnswers: ["内存管理单元"],
            children: [],
          },
          { type: "formatted", text: " 完成" },
        ],
      },
    ] as never;
    const c = card({ type: "cloze", prompt });
    expect(judgeAnswer(c, { cloze: { x: " mmu " } })).toBe(true);
    expect(judgeAnswer(c, { cloze: { x: "内存管理单元" } })).toBe(true);
    expect(judgeAnswer(c, { cloze: { x: "TLB" } })).toBe(false);
  });

  it("客观题按对错推荐，问答题按 AI 分数推荐，未评判不推荐", () => {
    const single = card({ type: "single-choice", data: { options } });
    expect(suggestRating(single, true, null)).toBe("normal");
    expect(suggestRating(single, false, null)).toBe("hard");
    const qa = card({ type: "qa" });
    expect(suggestRating(qa, null, null)).toBeNull();
    expect(suggestRating(qa, null, 5)).toBe("struggle");
    expect([9, 6, 4, 3].map(scoreToRating)).toEqual(["easy", "normal", "struggle", "hard"]);
  });
});
