import { describe, expect, it } from "vitest";
import {
  buildGlobalPrompt,
  buildSubtopicPrompt,
  parseFinalReviewOutput,
  parseGlobalOutput,
  parseGrowthReviewOutput,
  parseSubtopicOutput,
  parseTopicOutput,
} from "../topic-insights-prompt";

const note = (no: number) => ({
  no,
  kindLabel: "卡片",
  title: `卡 ${no}`,
  month: "2026-09",
  summary: `要点 ${no}`,
  claims: no === 1 ? ["await 之后同步执行"] : [],
  concepts: ["事件循环"],
});

describe("topic-insights 提示词", () => {
  it("子主题提示词带笔记、笔记对与长文节原文；增量时带上一次的概述", () => {
    const prompt = buildSubtopicPrompt({
      topic: "JavaScript",
      subtopic: "事件循环",
      total: 40,
      notes: [note(1), note(2)],
      pairs: [{ no: 1, left: 1, right: 2, sections: { 2: { heading: "微任务", text: "原文" } } }],
      previous: {
        overview: "旧概述",
        shift: "",
        removed: ["被删的"],
        marks: ["[重复] 《A》 ↔ 《B》：x"],
      },
    });
    expect(prompt).toContain("JavaScript › 事件循环（共 40 份笔记）");
    expect(prompt).toContain("[1] 卡片《卡 1》 2026-09｜要点：要点 1｜主张：await 之后同步执行");
    expect(prompt).toContain("P1：[1] 与 [2]");
    expect(prompt).toContain("[2] 的那一节（微任务）：原文");
    expect(prompt).toContain("上一次的概述：旧概述");
    expect(prompt).toContain("《被删的》");
  });

  it("子主题输出：只认给出的编号，矛盾带双方主张，片段按编号收", () => {
    const parsed = parseSubtopicOutput(
      JSON.stringify({
        overview: "讲事件循环",
        shift: "",
        pattern: { text: "画时序表", notes: [1, 2, 99], why: "都画表" },
        chain: { notes: [1, 2, 3], missing: { before: 2, text: "渲染时机" }, why: "跳着" },
        pairs: [
          {
            pair: "P1",
            type: "conflict",
            why: "相反",
            claims: ["甲", "乙"],
            anchors: { "2": "原文片段" },
          },
          { pair: "P1", type: "dup", why: "重复项" },
          { pair: "P9", type: "dup", why: "不存在" },
          { pair: "P2", type: "related", why: "类型不对" },
        ],
      }),
      new Set([1, 2, 3]),
      new Set([1, 2])
    )!;
    expect(parsed.pattern).toEqual({ text: "画时序表", notes: [1, 2], why: "都画表" });
    expect(parsed.chain).toMatchObject({
      notes: [1, 2, 3],
      missingBefore: 2,
      missingText: "渲染时机",
    });
    expect(parsed.pairs).toEqual([
      { pair: 1, type: "conflict", why: "相反", claims: ["甲", "乙"], anchors: { 2: "原文片段" } },
    ]);
    expect(parseSubtopicOutput("不是 JSON", new Set(), new Set())).toBeNull();
    // 缺口不在链上、链太短都不要
    expect(
      parseSubtopicOutput(
        JSON.stringify({ chain: { notes: [1, 2], missing: { before: 3, text: "x" } } }),
        new Set([1, 2, 3]),
        new Set()
      )!.chain
    ).toBeNull();
  });

  it("主题输出：挑选与还缺合计不超过 6，挑选只认候选编号", () => {
    const parsed = parseTopicOutput(
      JSON.stringify({
        overview: "o",
        lead: "l",
        gaps: [
          { text: "还缺：模块加载", why: "w" },
          { text: "还缺：内存", why: "w" },
          { text: "多的" },
        ],
        asks: ["a", "b", "c"],
        pick: ["M1", "M2", "M3", "M4", "M5", "M9", "M2"],
      }),
      new Set([1, 2, 3, 4, 5])
    )!;
    expect(parsed.gaps).toHaveLength(2);
    expect(parsed.pick).toEqual([1, 2, 3, 4]);
    expect(parsed.asks).toEqual(["a", "b"]);
  });

  it("全局：提问组与呼应进提示词；输出去重、限量、只认编号", () => {
    const prompt = buildGlobalPrompt({
      totals: { notes: 100, topics: 3 },
      growth: [{ quarter: "2026Q3", count: 9 }],
      topics: [{ label: "学习方法", total: 20, recent: 3, overview: "概述", shift: "" }],
      notes: [note(1), note(2)],
      bridges: [{ no: 1, left: 1, right: 2, sections: {} }],
      noteTopics: { 1: "学习方法", 2: "LeetCode" },
      asked: [
        {
          no: 1,
          times: 3,
          last: "9 月 28 日",
          prompts: ["rAF 在微任务前后？"],
          near: "JavaScript",
        },
      ],
    });
    expect(prompt).toContain("B1：「学习方法」[1] 与 「LeetCode」[2]");
    expect(prompt).toContain(
      "A1（问过 3 次，最近 9 月 28 日，最接近的主题：JavaScript）：「rAF 在微任务前后？」"
    );
    const parsed = parseGlobalOutput(
      JSON.stringify({
        lead: "版图",
        bridges: [
          { candidate: "B1", why: "都是提取练习" },
          { candidate: "B1", why: "重复" },
          { candidate: "B2", why: "不存在" },
          { candidate: "B1x", why: "" },
        ],
        asked: [
          { group: "A1", question: "事件循环和渲染时机", why: "问了 3 次" },
          { group: "A7", question: "x" },
        ],
        asks: ["q1", "q2"],
      }),
      new Set([1]),
      new Set([1])
    )!;
    expect(parsed.bridges.map(item => item.candidate)).toEqual([1]);
    expect(parsed.asked).toEqual([{ group: 1, question: "事件循环和渲染时机", why: "问了 3 次" }]);
    expect(parsed.asks).toEqual(["q1"]);
  });

  it("项目回顾：可能属于这里与还薄只认编号、限量；结项回顾的归入项目可为空", () => {
    const growth = parseGrowthReviewOutput(
      JSON.stringify({
        lead: "长了 8 篇",
        belong: [
          { candidate: "C1", branch: "D1", why: "补上合成" },
          { candidate: "C1", branch: "D2", why: "重复" },
          { candidate: "C2", branch: "D9", why: "分支不存在" },
        ],
        thin: [{ branch: "D2", text: "这里还薄：只讲了工具", why: "w" }],
      }),
      new Set([1, 2]),
      new Set([1, 2])
    )!;
    expect(growth.belong).toEqual([{ candidate: 1, branch: 1, why: "补上合成" }]);
    expect(growth.thin[0]).toMatchObject({ branch: 2 });
    const final = parseFinalReviewOutput(
      JSON.stringify({
        lead: "留下 3 个观点",
        core: ["D1", "D3", "D9"],
        asks: ["为什么"],
        home: null,
      }),
      new Set([1, 2, 3]),
      new Set([1])
    )!;
    expect(final).toEqual({ lead: "留下 3 个观点", core: [1, 3], asks: ["为什么"], home: null });
  });
});
