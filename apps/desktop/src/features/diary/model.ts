/**
 * 日记页纯函数（D-044）：条目归一、按天分组、筛选、那年今日、统计、标签色、正文构造。
 * 视图只做渲染，派生全部在这里（可单测）。
 *
 * 数据口径：一条碎碎念 = 一个 DiarySegment（富文本 + 段级标签 + createTime），归属某天的
 * DiaryEntry（date）。天气 / 心情是 entry 级旧字段，新页不展示（D-044 默认取舍）。
 */

import type { Descendant } from "slate";
import { TAG_COLORS, type TagColor } from "@tau/ui";
import type { DiarySegmentItem, DiaryTagSetting } from "@/types/diary";

export const DAY_MS = 86_400_000;

export interface DiaryMoment {
  id: number;
  diaryId: number;
  contentId: number;
  /** 归属日 YYYY-MM-DD（旧 weekly / monthly 键归一到首日） */
  day: string;
  createTime: number;
  updateTime: number;
  content: Descendant[];
  words: number;
  tags: string[];
}

export interface DiaryTag {
  name: string;
  color: TagColor;
  sort: number;
}

/* ───────── 日期 ───────── */

const pad = (n: number) => String(n).padStart(2, "0");

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function keyDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 按日历日加减（避开夏令时：落在当天正午再取 key） */
export function addDays(key: string, n: number): string {
  const d = keyDate(key);
  d.setDate(d.getDate() + n);
  return dayKey(d.getTime());
}

export function diffDays(a: string, b: string): number {
  return Math.round((keyDate(a).getTime() - keyDate(b).getTime()) / DAY_MS);
}

/** 旧格式 YYYY-Www / YYYY-MM 归一到首日；无效时回落到 createTime 当天 */
export function normalizeDay(entryDate: string, createTime: number): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return entryDate;
  const week = entryDate.match(/^(\d{4})-W(\d{2})$/);
  if (week) {
    // ISO 周：1 月 4 日所在周为第 1 周，周一起
    const jan4 = new Date(Number(week[1]), 0, 4);
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (Number(week[2]) - 1) * 7);
    return dayKey(monday.getTime());
  }
  const month = entryDate.match(/^(\d{4})-(\d{2})$/);
  if (month) return `${month[1]}-${month[2]}-01`;
  return dayKey(createTime);
}

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
export const weekdayOf = (key: string) => `周${WEEK[keyDate(key).getDay()]}`;

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 今天 / 昨天 / N 天前（一周内），其余为空——日期列的相对日标 */
export function relativeDay(key: string, today: string): string {
  const off = diffDays(today, key);
  if (off === 0) return "今天";
  if (off === 1) return "昨天";
  if (off > 1 && off < 7) return `${off} 天前`;
  return "";
}

/** 9月21日；跨年补年份 */
export function shortDate(key: string, today: string): string {
  const d = keyDate(key);
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return d.getFullYear() === keyDate(today).getFullYear() ? md : `${d.getFullYear()}年${md}`;
}

/** 按日期查看的快捷范围（日历浮层与工具栏范围标签共用） */
export function presetRanges(today: string): Array<{ label: string; range: [string, string] }> {
  return [
    { label: "近 7 天", range: [addDays(today, -6), today] },
    { label: "近 30 天", range: [addDays(today, -29), today] },
    { label: "本月", range: [`${today.slice(0, 8)}01`, today] },
    { label: "今年", range: [`${today.slice(0, 5)}01-01`, today] },
  ];
}

/* ───────── 正文 ───────── */

type SlateNode = { text?: string; type?: string; children?: SlateNode[] };

/** 纯文本（块间换行）：用于预告首句、字面匹配 */
export function plainText(content: Descendant[]): string {
  const lines: string[] = [];
  const walk = (node: SlateNode): string =>
    typeof node.text === "string" ? node.text : (node.children ?? []).map(walk).join("");
  const block = (node: SlateNode) => {
    const kids = node.children ?? [];
    // 容器块（引用 / 列表）按子块展开，叶子块取文本
    if (kids.length && kids.every(k => typeof k.text !== "string" && k.children))
      kids.forEach(block);
    else lines.push(walk(node));
  };
  (content as SlateNode[]).forEach(block);
  return lines
    .map(l => l.trim())
    .filter(Boolean)
    .join("\n");
}

export const firstLine = (content: Descendant[]) => plainText(content).split("\n")[0] ?? "";

const paragraph = (text: string): Descendant =>
  ({ type: "paragraph", children: [{ type: "formatted", text }] }) as unknown as Descendant;

/** 输入条纯文本 → Slate 正文：每行一段 */
export const buildContent = (text: string): Descendant[] =>
  text.split("\n").map(line => paragraph(line));

/* ───────── 条目 ───────── */

export function toMoment(item: DiarySegmentItem): DiaryMoment {
  return {
    id: item.id,
    diaryId: item.diaryId,
    contentId: item.contentId,
    day: normalizeDay(item.entryDate, item.createTime),
    createTime: item.createTime,
    updateTime: item.updateTime,
    content: item.content,
    words: item.wordCount,
    tags: item.tags,
  };
}

/** 补记：写下的那天与归属日不同 */
export const isBackfill = (m: DiaryMoment) => dayKey(m.createTime) !== m.day;

/** 流的顺序：归属日倒序，同日内写下时间倒序（最新在上） */
export function sortMoments(list: DiaryMoment[]): DiaryMoment[] {
  return [...list].sort((a, b) =>
    a.day === b.day ? b.createTime - a.createTime || b.id - a.id : a.day < b.day ? 1 : -1
  );
}

export interface DayGroup {
  day: string;
  moments: DiaryMoment[];
  words: number;
}

/** 按天分组（输入须已排序） */
export function groupByDay(sorted: DiaryMoment[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const m of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.day === m.day) {
      last.moments.push(m);
      last.words += m.words;
    } else groups.push({ day: m.day, moments: [m], words: m.words });
  }
  return groups;
}

/* ───────── 视图（侧栏子项） ───────── */

/** 侧栏子项 id：`tag:<名称>` 只看该标签；`untagged` 只看无标签；空 = 全部 */
export type DiaryScope = { kind: "all" } | { kind: "tag"; tag: string } | { kind: "untagged" };

export function parseScope(id: string | undefined): DiaryScope {
  if (id?.startsWith("tag:") && id.length > 4) return { kind: "tag", tag: id.slice(4) };
  if (id === "untagged") return { kind: "untagged" };
  return { kind: "all" };
}

export const scopeId = (scope: DiaryScope) =>
  scope.kind === "tag" ? `tag:${scope.tag}` : scope.kind === "untagged" ? "untagged" : "";

/* ───────── 筛选 ───────── */

export interface DiaryFilter {
  scope: DiaryScope;
  /** 闭区间 [from, to]，YYYY-MM-DD */
  range: [string, string] | null;
  /** 搜索命中的 diaryId（混合召回，日粒度）；null = 未在搜索 */
  hits: ReadonlySet<number> | null;
  query: string;
}

/**
 * 筛选：频道 → 时间 → 搜索。搜索召回是日粒度（FTS / 向量按 entry 建索引），命中日内有
 * 字面匹配的条目时只留这些；整天都没有字面匹配（语义召回）则整天保留。
 */
export function filterMoments(list: DiaryMoment[], f: DiaryFilter): DiaryMoment[] {
  let out = list;
  if (f.scope.kind === "tag") {
    const tag = f.scope.tag;
    out = out.filter(m => m.tags.includes(tag));
  } else if (f.scope.kind === "untagged") out = out.filter(m => !m.tags.length);
  if (f.range) {
    const [from, to] = f.range;
    out = out.filter(m => m.day >= from && m.day <= to);
  }
  if (f.hits) {
    const hits = f.hits;
    const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
    const literal = (m: DiaryMoment) => {
      const text = plainText(m.content).toLowerCase();
      return words.length > 0 && words.every(w => text.includes(w));
    };
    const inHitDays = out.filter(m => hits.has(m.diaryId));
    const literalDays = new Set(inHitDays.filter(literal).map(m => m.diaryId));
    out = inHitDays.filter(m => !literalDays.has(m.diaryId) || literal(m));
  }
  return out;
}

/* ───────── 那年今日 / 统计 ───────── */

export interface YearEcho {
  year: number;
  /** 距今年数 */
  ago: number;
  day: string;
  moments: DiaryMoment[];
}

/** 往年同月同日的条目，按年份倒序（最近的一年在前），年内按时间正序 */
export function onThisDay(list: DiaryMoment[], today: string): YearEcho[] {
  const md = today.slice(5);
  const year = Number(today.slice(0, 4));
  const byYear = new Map<number, DiaryMoment[]>();
  for (const m of list) {
    const y = Number(m.day.slice(0, 4));
    if (m.day.slice(5) !== md || y >= year) continue;
    byYear.set(y, [...(byYear.get(y) ?? []), m]);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, moments]) => ({
      year: y,
      ago: year - y,
      day: moments[0].day,
      moments: [...moments].sort((a, b) => a.createTime - b.createTime),
    }));
}

/** 连续记录天数：今天写了从今天数，没写从昨天数（今天还没到晚上不算断） */
export function streak(list: DiaryMoment[], today: string): number {
  const days = new Set(list.map(m => m.day));
  let key = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(key)) {
    n++;
    key = addDays(key, -1);
  }
  return n;
}

export interface DayStat {
  count: number;
  words: number;
}

export function dayStats(list: DiaryMoment[]): Map<string, DayStat> {
  const map = new Map<string, DayStat>();
  for (const m of list) {
    const s = map.get(m.day) ?? { count: 0, words: 0 };
    s.count++;
    s.words += m.words;
    map.set(m.day, s);
  }
  return map;
}

/** 时间刻度：流中出现的年月（YYYY-MM，与流同序） */
export function monthsOf(groups: DayGroup[]): string[] {
  const out: string[] = [];
  for (const g of groups) {
    const ym = g.day.slice(0, 7);
    if (out[out.length - 1] !== ym) out.push(ym);
  }
  return out;
}

/* ───────── 标签 ───────── */

const isTagColor = (c: string): c is TagColor => (TAG_COLORS as readonly string[]).includes(c);

/**
 * 标签色 → Tag 七色板（D-021）。新写入存七色键；旧库存的是 antd 预设 hex，读时按色相就近
 * 映射（灰度 / 低饱和归 gray），改色后即写回七色键。
 */
export function toTagColor(color: string | undefined): TagColor {
  if (!color) return "gray";
  if (isTagColor(color)) return color;
  const m = color.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return "gray";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 0.12) return "gray";
  const d = max - min;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 330) return "red";
  if (h < 40) return "orange";
  if (h < 70) return "yellow";
  if (h < 165) return "green";
  if (h < 255) return "blue";
  return "purple";
}

export function toTags(settings: DiaryTagSetting[]): DiaryTag[] {
  return settings.map(s => ({ name: s.name, color: toTagColor(s.color), sort: s.sort }));
}

export const COLOR_LABEL: Record<TagColor, string> = {
  red: "红",
  orange: "橙",
  yellow: "黄",
  green: "绿",
  gray: "灰",
  blue: "蓝",
  purple: "紫",
};

/** 新标签取色：按已有标签数在六色（不含 gray）中轮转，与 legacy 预设轮转同口径 */
export function nextTagColor(existing: number): TagColor {
  const palette = TAG_COLORS.filter(c => c !== "gray");
  return palette[existing % palette.length];
}

export function tagCounts(list: DiaryMoment[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of list) for (const t of m.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return counts;
}

/**
 * 标签列表（侧栏 / 选择器 / # 联想共用）：标签库 ∪ 条目上出现过但库里没有的名称，
 * 按使用次数倒序、同数按库内顺序。
 */
export function rankTags(tags: DiaryTag[], counts: Map<string, number>): DiaryTag[] {
  const known = new Set(tags.map(t => t.name));
  const orphans: DiaryTag[] = [...counts.keys()]
    .filter(name => !known.has(name))
    .map((name, i) => ({ name, color: "gray", sort: tags.length + i }));
  return [...tags, ...orphans].sort(
    (a, b) => (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0) || a.sort - b.sort
  );
}

/** 输入框里光标前的 `#词`（行首或空白后），用于标签联想 */
export function hashQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const m = text.slice(0, caret).match(/(^|\s)#([^\s#]*)$/);
  if (!m) return null;
  return { start: caret - m[2].length - 1, query: m[2] };
}
