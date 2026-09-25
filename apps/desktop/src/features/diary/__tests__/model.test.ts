import { describe, expect, it } from "vitest";
import type { Descendant } from "slate";
import {
  buildContent,
  filterMoments,
  groupByDay,
  hashQueryAt,
  normalizeDay,
  onThisDay,
  parseScope,
  plainText,
  rankTags,
  scopeId,
  sortMoments,
  streak,
  toTagColor,
  type DiaryMoment,
} from "../model";

const p = (text: string) => ({ type: "paragraph", children: [{ text }] }) as unknown as Descendant;
const at = (day: string, hh = 9) =>
  new Date(`${day}T${String(hh).padStart(2, "0")}:00:00`).getTime();

let seq = 0;
function moment(day: string, text: string, extra: Partial<DiaryMoment> = {}): DiaryMoment {
  seq++;
  return {
    id: seq,
    diaryId: Number(day.replace(/-/g, "")),
    contentId: seq,
    day,
    createTime: at(day, 8 + (seq % 10)),
    updateTime: at(day),
    content: [p(text)],
    words: text.length,
    tags: [],
    ...extra,
  };
}

describe("diary model", () => {
  it("normalizeDay：日期原样、ISO 周与月归一到首日、无效回落到写下当天", () => {
    expect(normalizeDay("2026-09-25", 0)).toBe("2026-09-25");
    expect(normalizeDay("2026-W39", 0)).toBe("2026-09-21");
    expect(normalizeDay("2026-09", 0)).toBe("2026-09-01");
    expect(normalizeDay("", at("2026-09-24"))).toBe("2026-09-24");
  });

  it("sortMoments + groupByDay：归属日倒序、同日新在上，分组累计字数", () => {
    const a = moment("2026-09-24", "早", { createTime: at("2026-09-24", 8) });
    const b = moment("2026-09-25", "午", { createTime: at("2026-09-25", 12) });
    const c = moment("2026-09-25", "晚上", { createTime: at("2026-09-25", 21) });
    const groups = groupByDay(sortMoments([a, b, c]));
    expect(groups.map(g => g.day)).toEqual(["2026-09-25", "2026-09-24"]);
    expect(groups[0].moments.map(m => m.id)).toEqual([c.id, b.id]);
    expect(groups[0].words).toBe(3);
  });

  it("filterMoments：频道 / 无标签 / 时间闭区间", () => {
    const work = moment("2026-09-20", "a", { tags: ["工作"] });
    const none = moment("2026-09-22", "b");
    const life = moment("2026-09-25", "c", { tags: ["生活"] });
    const all = [work, none, life];
    const base = { scope: parseScope(undefined), range: null, hits: null, query: "" };
    expect(filterMoments(all, { ...base, scope: parseScope("tag:工作") })).toEqual([work]);
    expect(filterMoments(all, { ...base, scope: parseScope("untagged") })).toEqual([none]);
    expect(filterMoments(all, { ...base, range: ["2026-09-21", "2026-09-25"] })).toEqual([
      none,
      life,
    ]);
  });

  it("filterMoments 搜索：命中日内有字面匹配只留匹配条，纯语义命中整天保留", () => {
    const d1a = moment("2026-09-24", "读完置身事内");
    const d1b = moment("2026-09-24", "晚上跑步", { diaryId: d1a.diaryId });
    const d2 = moment("2026-09-23", "地方政府的土地财政");
    const miss = moment("2026-09-22", "置身事内开读");
    const hits = new Set([d1a.diaryId, d2.diaryId]);
    const out = filterMoments([d1a, d1b, d2, miss], {
      scope: parseScope(""),
      range: null,
      hits,
      query: "置身",
    });
    expect(out).toEqual([d1a, d2]);
  });

  it("onThisDay：只取往年同月同日，最近的一年在前，年内按时间正序", () => {
    const y1a = moment("2025-09-25", "x", { createTime: at("2025-09-25", 23) });
    const y1b = moment("2025-09-25", "y", { createTime: at("2025-09-25", 21) });
    const y2 = moment("2024-09-25", "z");
    const other = moment("2025-09-24", "w");
    const echoes = onThisDay([y2, y1a, y1b, other, moment("2026-09-25", "今天")], "2026-09-25");
    expect(echoes.map(e => [e.year, e.ago])).toEqual([
      [2025, 1],
      [2024, 2],
    ]);
    expect(echoes[0].moments.map(m => m.id)).toEqual([y1b.id, y1a.id]);
  });

  it("streak：今天没写从昨天数，断一天即止", () => {
    const days = ["2026-09-24", "2026-09-23", "2026-09-21"].map(d => moment(d, "x"));
    expect(streak(days, "2026-09-25")).toBe(2);
    expect(streak([...days, moment("2026-09-25", "x")], "2026-09-25")).toBe(3);
  });

  it("toTagColor：七色键直通，旧 antd hex 按色相就近，灰度归 gray", () => {
    expect(toTagColor("purple")).toBe("purple");
    expect(toTagColor("#1890ff")).toBe("blue");
    expect(toTagColor("#52c41a")).toBe("green");
    expect(toTagColor("#fa8c16")).toBe("orange");
    expect(toTagColor("#f5222d")).toBe("red");
    expect(toTagColor("#722ed1")).toBe("purple");
    expect(toTagColor("#8c8c8c")).toBe("gray");
    expect(toTagColor("oops")).toBe("gray");
  });

  it("rankTags：按使用次数倒序，库外出现过的名称以 gray 补上", () => {
    const tags = [
      { name: "工作", color: "blue" as const, sort: 0 },
      { name: "读书", color: "purple" as const, sort: 1 },
    ];
    const ranked = rankTags(
      tags,
      new Map([
        ["读书", 5],
        ["工作", 2],
        ["散步", 3],
      ])
    );
    expect(ranked.map(t => t.name)).toEqual(["读书", "散步", "工作"]);
    expect(ranked[1].color).toBe("gray");
  });

  it("scope 往返与 # 联想定位", () => {
    expect(scopeId(parseScope("tag:工作"))).toBe("tag:工作");
    expect(parseScope("tag:").kind).toBe("all");
    expect(hashQueryAt("今天 #工", 5)).toEqual({ start: 3, query: "工" });
    expect(hashQueryAt("a#b", 3)).toBeNull();
  });

  it("buildContent + plainText：按行分段", () => {
    const content = buildContent("第一行\n第二行");
    expect(content).toHaveLength(2);
    expect(plainText(content)).toBe("第一行\n第二行");
  });
});
