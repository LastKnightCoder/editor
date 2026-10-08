/**
 * 从 Slate 正文（contents.content 的 JSON）抽取文档待办：每个 check-list-item 一条。
 *
 * 纯函数，主进程索引与渲染端共用；只按节点 JSON 形状判断，不依赖编辑器扩展模块。
 * 项目与日期写在勾选项首段文字里（与待办快速添加同一套语法）：`#项目名` 按进行中项目的
 * 完整标题匹配（多个命中取最长），日期词交给 quickDateTime。未命中的 `#词` 保留在标题里。
 */

import { dayStart, extractDateTime } from "@/utils/quickDateTime";

export interface DocTaskGroup {
  id: number;
  title: string;
}

export interface DocTask {
  taskId: string;
  /** 去掉 `#项目` 与日期词后的标题 */
  title: string;
  /** 首段原文（含 `#项目` 与日期词） */
  text: string;
  checked: boolean;
  /** 嵌套深度，顶层为 0 */
  depth: number;
  parentTaskId: string | null;
  /** 文档序 */
  order: number;
  groupId: number | null;
  /** 命中的项目原文（含 #），改名同步时按它替换 */
  groupToken: string | null;
  /** 命中的日期原文；null = 没写日期 */
  dateHint: string | null;
}

interface JsonNode {
  type?: unknown;
  text?: unknown;
  children?: unknown;
  checked?: unknown;
  taskId?: unknown;
}

const asNode = (value: unknown): JsonNode | null =>
  value && typeof value === "object" ? (value as JsonNode) : null;

const childrenOf = (node: JsonNode): unknown[] =>
  Array.isArray(node.children) ? node.children : [];

function plainText(node: JsonNode): string {
  if (typeof node.text === "string") return node.text;
  return childrenOf(node)
    .map(child => {
      const c = asNode(child);
      return c ? plainText(c) : "";
    })
    .join("");
}

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/** `#项目名`：按完整标题匹配，长标题优先（「笔记软件开发」不被「笔记」截胡） */
export function matchGroupToken(
  text: string,
  groups: DocTaskGroup[]
): { group: DocTaskGroup; token: string } | null {
  const sorted = [...groups].sort((a, b) => b.title.length - a.title.length);
  for (const match of text.matchAll(/[#＃]/g)) {
    const after = text.slice(match.index! + 1);
    const group = sorted.find(g => g.title && after.startsWith(g.title));
    if (group) return { group, token: `${match[0]}${group.title}` };
  }
  return null;
}

/** 带年份的绝对日期（正文规范写法 `2026年10月10日`，兼容 `2026-10-10` / `2026/10/10`） */
const ABSOLUTE_DATE = /(\d{4})(?:年|[-/.])(\d{1,2})(?:月|[-/.])(\d{1,2})[日号]?/;

function absoluteDate(text: string): { date: number } | null {
  const m = text.match(ABSOLUTE_DATE);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(year, month - 1, day);
  // 拒绝 2 月 30 日这类会被 Date 进位的日期
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { date: date.getTime() };
}

/** 正文里的规范日期写法 */
export const formatDocTaskDate = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

export function parseDocTaskText(
  text: string,
  groups: DocTaskGroup[],
  now: Date = new Date()
): Pick<DocTask, "title" | "groupId" | "groupToken" | "dateHint"> {
  let rest = text;
  const group = matchGroupToken(rest, groups);
  if (group) rest = rest.replace(group.token, " ");
  const dateHint = rest.match(ABSOLUTE_DATE)?.[0] ?? extractDateTime(rest, now).hints.date ?? null;
  if (dateHint) rest = rest.replace(dateHint, " ");
  return {
    title: collapse(rest),
    groupId: group?.group.id ?? null,
    groupToken: group?.token ?? null,
    dateHint,
  };
}

/** 日期原文是否带年份（不依赖锚点） */
export const isAbsoluteDateHint = (dateHint: string | null): boolean =>
  !!dateHint && ABSOLUTE_DATE.test(dateHint);

export interface DocTaskTokenSpan {
  kind: "group" | "date";
  start: number;
  end: number;
  /** 项目 id（kind = group） */
  groupId?: number;
  /** 日期原文（kind = date） */
  hint?: string;
}

/**
 * 勾选项一行文字里的 `#项目` 与日期的位置（编辑器画胶囊用）。与 parseDocTaskText 同一套规则：
 * 只认第一个命中的项目与第一个日期。
 */
export function docTaskTokenSpans(
  text: string,
  groups: DocTaskGroup[],
  now: Date = new Date()
): DocTaskTokenSpan[] {
  const spans: DocTaskTokenSpan[] = [];
  const group = matchGroupToken(text, groups);
  let masked = text;
  if (group) {
    const start = text.indexOf(group.token);
    spans.push({ kind: "group", start, end: start + group.token.length, groupId: group.group.id });
    // 遮住项目词再找日期，避免「#5月发布」里的「5月」被当成日期
    masked =
      text.slice(0, start) +
      " ".repeat(group.token.length) +
      text.slice(start + group.token.length);
  }
  const hint = masked.match(ABSOLUTE_DATE)?.[0] ?? extractDateTime(masked, now).hints.date;
  if (hint) {
    const start = masked.indexOf(hint);
    if (start >= 0) spans.push({ kind: "date", start, end: start + hint.length, hint });
  }
  return spans.sort((a, b) => a.start - b.start);
}

/**
 * 日期原文换算成本地 0 点时间戳。带年份的直接换算；「周五」「明天」这类相对词
 * 按锚点时刻换算，锚点取该项首次被收集（或日期原文改变）的时刻，避免日期随时间漂移。
 */
export function resolveDocTaskDue(dateHint: string | null, anchor: number): number | null {
  if (!dateHint) return null;
  // 写了年份就按绝对日期处理，非法（2 月 30 日）也不再退回相对词规则
  if (ABSOLUTE_DATE.test(dateHint)) return absoluteDate(dateHint)?.date ?? null;
  const { date } = extractDateTime(dateHint, new Date(anchor));
  return date === null ? null : dayStart(new Date(date));
}

/** 正文里的全部勾选项（文档序）；没有 taskId 的项跳过，由调用方补 id 后重算 */
export function extractDocTasks(
  content: unknown,
  groups: DocTaskGroup[],
  now: Date = new Date()
): { tasks: DocTask[]; missingIds: number } {
  const tasks: DocTask[] = [];
  let missingIds = 0;
  const walk = (value: unknown, depth: number, parentTaskId: string | null) => {
    const node = asNode(value);
    if (!node) return;
    if (node.type !== "check-list-item") {
      childrenOf(node).forEach(child => walk(child, depth, parentTaskId));
      return;
    }
    const [first, ...nested] = childrenOf(node).map(asNode);
    const taskId = typeof node.taskId === "string" && node.taskId ? node.taskId : null;
    if (!taskId) missingIds += 1;
    else {
      const text = first ? collapse(plainText(first)) : "";
      tasks.push({
        taskId,
        text,
        checked: node.checked === true,
        depth,
        parentTaskId,
        order: tasks.length,
        ...parseDocTaskText(text, groups, now),
      });
    }
    nested.forEach(child => child && walk(child, depth + 1, taskId ?? parentTaskId));
  };
  if (Array.isArray(content)) content.forEach(value => walk(value, 0, null));
  return { tasks, missingIds };
}
