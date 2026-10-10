import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  KnowledgeInsightNode,
  KnowledgeInsightsPayload,
  KnowledgeMark,
} from "@/types/knowledge-insights";
import { reviewUnseen, todayInsights, type TodayInsight } from "../insightItems";

const end = (id: number, topic: string) => ({
  ref: { kind: "card" as const, id },
  contentId: id,
  title: `卡${id}`,
  topic,
  heading: "",
  block: 0,
  excerpt: "",
});
const node = (
  id: number,
  scope: KnowledgeInsightNode["scope"],
  marks: KnowledgeMark[],
  extra: Partial<KnowledgeInsightNode> = {}
): KnowledgeInsightNode => ({
  id,
  scope,
  parentId: null,
  projectId: null,
  label: "",
  topicId: null,
  model: "m",
  updateTime: 100,
  result: { lead: "", marks, asks: [], growth: [], candidates: 0, dismissed: [] },
  ...extra,
});
const mark = (id: string, kind: KnowledgeMark["kind"], extra: Partial<KnowledgeMark> = {}) => ({
  id,
  kind,
  why: "理由",
  ends: [],
  status: "open" as const,
  ...extra,
});
const review = (id: number, kind: "growth" | "final", seenAt?: number) =>
  node(id, "project", [], {
    projectId: id * 10,
    label: `项目${id}`,
    reviewKind: kind,
    result: {
      lead: "留下了三个观点。还有两个问题没解决。",
      marks: [],
      asks: [],
      growth: [],
      candidates: 0,
      dismissed: [],
      ...(seenAt ? { seenAt } : {}),
    },
  });

const payload = (): KnowledgeInsightsPayload => ({
  configured: true,
  running: false,
  coverage: 1,
  global: node(1, "global", [
    mark("a1", "asked", {
      text: "组播地址怎么分配",
      prompts: [{ sessionId: "s", messageId: "m", text: "x", time: 1 }],
    }),
    mark("b1", "bridge", {
      text: "主动回想比重读记得牢",
      ends: [end(1, "学习方法"), end(2, "LeetCode")],
    }),
    mark("b2", "bridge", { status: "dismissed", ends: [end(3, "A"), end(4, "B")] }),
  ]),
  topics: [
    node(
      2,
      "topic",
      [mark("t1", "chain", { missing: { index: 1, text: "渲染时机" } }), mark("t2", "gap")],
      {
        topicId: 5,
        label: "JavaScript",
      }
    ),
    node(3, "topic", [], { topicId: 6, label: "CSS" }),
  ],
  projects: [review(7, "growth"), review(8, "final"), review(9, "final", 200)],
});

describe("今日洞见卡的内容", () => {
  it("顺序：刚结项 > 呼应 > 问了没写 > 生长回顾 > 主题；处理过 / 看过的不出现", () => {
    const items = todayInsights(payload());
    expect(items.map(item => item.key)).toEqual([
      "review:8",
      "global:b1",
      "global:a1",
      "review:7",
      "topic:2:t1",
    ]);
    expect(items[0]).toMatchObject({
      label: "结项回顾",
      scope: "项目",
      before: "「项目8」已结项：",
      em: "留下了三个观点",
      desc: "还有两个问题没解决。",
      evidence: { type: "ends", ends: [] },
      open: { page: "project-detail", projectId: 80 },
      dismiss: { type: "seen", nodeId: 8 },
    });
    expect(items[1]).toMatchObject({
      before: "「学习方法」和「LeetCode」其实在说同一件事：",
      em: "主动回想比重读记得牢",
      desc: "理由",
      scope: "跨主题",
      time: 100,
      open: { page: "knowledge-map", insight: "global:b1" },
    });
    expect(items[1].evidence).toMatchObject({
      type: "ends",
      ends: [{ title: "卡1" }, { title: "卡2" }],
    });
    expect(items[2]).toMatchObject({
      before: "你在对话里问过 1 次",
      em: "组播地址怎么分配",
      after: "，笔记里还没写",
      scope: "全局",
      evidence: { type: "prompts", prompts: [{ sessionId: "s", messageId: "m" }] },
    });
    expect(items[4]).toMatchObject({
      label: "缺一环",
      scope: "JavaScript · 2 处发现",
      before: "",
      em: "一条线上缺了「渲染时机」这一环",
      open: { page: "knowledge-map", insight: "topic:5:t1" },
      dismiss: { type: "status", nodeId: 2, itemId: "t1" },
    });
  });

  it("矛盾附两边说法；证据最多 3 处；问句结尾不再接逗号", () => {
    const data = payload();
    data.topics = [
      node(
        4,
        "topic",
        [
          mark("c1", "conflict", {
            ends: [end(1, "A"), end(2, "A")],
            claims: ["总在绘制之后", "有时在绘制之前"],
          }),
        ],
        { topicId: 9, label: "React" }
      ),
      node(
        5,
        "topic",
        [mark("p1", "pattern", { text: "倒推", ends: [1, 2, 3, 4].map(i => end(i, "B")) })],
        { topicId: 10, label: "算法" }
      ),
    ];
    data.global!.result.marks = [mark("a2", "asked", { text: "为什么会这样？", prompts: [] })];
    data.projects = [];
    const [asked, conflict, pattern] = todayInsights(data);
    expect(asked.after).toBe(" 笔记里还没写");
    expect(conflict).toMatchObject({
      label: "矛盾",
      evidence: { type: "ends", claims: ["总在绘制之后", "有时在绘制之前"] },
    });
    expect(pattern.evidence.type === "ends" && pattern.evidence.ends).toHaveLength(3);
  });

  it("回顾看过之后又重新写了，算没看过；最多 5 条", () => {
    expect(reviewUnseen(review(1, "growth", 50))).toBe(true);
    expect(reviewUnseen(review(1, "growth", 100))).toBe(false);
    const data = payload();
    data.topics = Array.from({ length: 8 }, (_, i) =>
      node(20 + i, "topic", [mark(`x${i}`, "gap", { text: "还缺：x" })], {
        topicId: i,
        label: `T${i}`,
      })
    );
    expect(todayInsights(data)).toHaveLength(5);
    expect(todayInsights(null)).toEqual([]);
  });
});

const mocks = vi.hoisted(() => ({
  items: [] as TodayInsight[],
  dismiss: vi.fn(),
  push: vi.fn(),
  openEntity: vi.fn(() => Promise.resolve()),
}));
vi.mock("../insightQueries", () => ({
  useTodayInsights: () => ({ items: mocks.items, dismiss: mocks.dismiss }),
}));
vi.mock("@/page/PageProvider", () => ({ usePage: () => ({ navigator: { push: mocks.push } }) }));
vi.mock("@/services/open-content", () => ({ openEntity: mocks.openEntity }));

import { InsightCard } from "../views/InsightCard";

describe("今日洞见卡", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const button = (text: string) =>
    [...host.querySelectorAll("button")].find(
      b => b.textContent?.includes(text) || b.getAttribute("aria-label") === text
    );

  it("没有内容时整块不出现；默认露两条，其余展开可见", () => {
    act(() => root.render(<InsightCard />));
    expect(host.querySelector("[data-today-insight]")).toBeNull();

    mocks.items = todayInsights(payload());
    act(() => root.render(<InsightCard />));
    expect(host.textContent).toContain("5 条新发现");
    expect(host.querySelectorAll("li")).toHaveLength(2);
    expect(host.querySelector("em")?.textContent).toBe("留下了三个观点");
    act(() => button("还有 3 条")!.click());
    expect(host.querySelectorAll("li")).toHaveLength(5);
    act(() => button("收起")!.click());
    expect(host.querySelectorAll("li")).toHaveLength(2);
  });

  it("去看看、不相关、证据跳转", () => {
    mocks.items = todayInsights(payload());
    act(() => root.render(<InsightCard />));
    act(() => button("打开回顾")!.click());
    expect(mocks.push).toHaveBeenCalledWith("project-detail", { id: 80, review: "1" });
    act(() => button("知道了")!.click());
    expect(mocks.dismiss).toHaveBeenCalledWith(mocks.items[0]);

    act(() => button("在地图上看")!.click());
    expect(mocks.push).toHaveBeenLastCalledWith("knowledge-map", { insight: "global:b1" });
    act(() => button("《卡2》")!.click());
    expect(mocks.openEntity).toHaveBeenCalledWith({ kind: "card", id: 2 }, { at: { block: 0 } });

    act(() => button("还有 3 条")!.click());
    act(() => button("x")!.click());
    expect(mocks.push).toHaveBeenLastCalledWith("chat", { id: "s" });
  });
});
