import { describe, expect, it } from "vitest";
import type { WalkItem } from "@/types";
import { formatStaleDays, formatWalkWhy } from "../model";
import type { WalkStep } from "../trail";

const item = (reason: WalkItem["reason"]): WalkItem => ({
  ref: { kind: "card", id: 1 },
  title: "标题",
  contentId: 101,
  content: [],
  excerpt: null,
  note: null,
  source: null,
  tags: [],
  createTime: 0,
  updateTime: 0,
  lastSeenTime: null,
  reason,
});

describe("formatStaleDays", () => {
  it("0 天刚见过；1–29 天按天；30–364 按月", () => {
    expect(formatStaleDays(0)).toBe("最近刚见过");
    expect(formatStaleDays(1)).toBe("1 天没见过它了");
    expect(formatStaleDays(29)).toBe("29 天没见过它了");
    expect(formatStaleDays(30)).toBe("1 个月没见过它了");
    expect(formatStaleDays(364)).toBe("12 个月没见过它了");
  });

  it("≥365 按年，零头月为 0 时省略", () => {
    expect(formatStaleDays(365)).toBe("1 年没见过它了");
    expect(formatStaleDays(395)).toBe("1 年零 1 个月没见过它了");
    expect(formatStaleDays(730)).toBe("2 年没见过它了");
    expect(formatStaleDays(760)).toBe("2 年零 1 个月没见过它了");
    expect(formatStaleDays(1156)).toBe("3 年零 2 个月没见过它了");
  });
});

describe("formatWalkWhy", () => {
  it("via relation：经双链 / 语义相近 / 标签走来，fromTitle 超 16 字截断", () => {
    const step: WalkStep = {
      item: item({ type: "random" }),
      via: { type: "relation", relation: "link", sharedTag: null, fromTitle: "短标题" },
    };
    expect(formatWalkWhy(step)).toMatchObject({
      text: "从「短标题」经双链走来",
    });

    const long = "一二三四五六七八九十一二三四五六七八九十";
    expect(
      formatWalkWhy({
        item: step.item,
        via: { type: "relation", relation: "semantic", sharedTag: null, fromTitle: long },
      }).text
    ).toBe("从「一二三四五六七八九十一二三四五六…」经语义相近走来");

    expect(
      formatWalkWhy({
        item: step.item,
        via: { type: "relation", relation: "tag", sharedTag: "思维", fromTitle: "短标题" },
      }).text
    ).toBe("从「短标题」经标签 #思维走来");
  });

  it("via start/jump 按 reason：stale / on-this-day / random", () => {
    expect(
      formatWalkWhy({ item: item({ type: "stale", days: 45 }), via: { type: "start" } }).text
    ).toBe("1 个月没见过它了");
    expect(
      formatWalkWhy({
        item: item({ type: "on-this-day", years: 3 }),
        via: { type: "jump" },
      }).text
    ).toBe("那年今日 · 3 年前的今天");
    expect(formatWalkWhy({ item: item({ type: "random" }), via: { type: "jump" } }).text).toBe(
      "随手抽到的"
    );
  });
});
