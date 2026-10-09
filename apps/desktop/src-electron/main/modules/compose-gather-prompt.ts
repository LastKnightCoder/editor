/**
 * 创作模式召集资料的提示词与输出解析（纯函数，KL-070 / 18 §4.1）。
 *
 * 模型从本地候选里挑 8–12 份、分 3–4 组、每份写一句为什么相关；这里核对候选编号存在且不重复，
 * 截断过长的组名与理由，丢掉空组。
 */

export const GATHER_MAX_ITEMS = 12;
export const GATHER_MAX_GROUPS = 4;
/** 提示词里要求的长度；模型常超出几个字，硬截断放宽到下面的上限，免得截在半个词上 */
const GROUP_NAME_PROMPT_CHARS = 8;
const WHY_PROMPT_CHARS = 20;
const GROUP_NAME_MAX_CHARS = 16;
const WHY_MAX_CHARS = 40;
const EXCERPT_MAX_CHARS = 300;
const OUTLINE_MAX_ITEMS = 20;

export interface GatherCandidate {
  /** 提示词里的编号（1 起） */
  no: number;
  kindLabel: string;
  title: string;
  heading: string;
  summary: string;
  claims: string[];
  excerpt: string;
}

export interface GatherPromptInput {
  intent: string;
  /** 正在写的这篇的标题与大纲（还没写时为空） */
  title: string;
  outline: string[];
  /** 再找一些：正文最近写的内容 */
  recent: string;
  candidates: GatherCandidate[];
}

export interface ParsedGather {
  groups: Array<{ name: string; items: Array<{ candidate: number; why: string }> }>;
}

export const COMPOSE_GATHER_SYSTEM_PROMPT = `你是用户的写作助手。用户要写一篇文章，告诉了你想写什么；给你从用户自己的笔记里粗筛出的候选。挑出写这篇时真正用得上的，按它们在文章里的用处分组。只输出一个 JSON 对象，不要解释或代码块。

要求：
- 只挑和写作意图直接相关、写的时候会翻开看的。只是「主题相近」不要；宁缺毋滥，没有就少给。
- 同一件事有多份时只留讲得最好的一份。
- 共挑 3–${GATHER_MAX_ITEMS} 份，分 1–${GATHER_MAX_GROUPS} 组。组名是这一组在文章里的用处（如「为什么有效」「反例」「我的实践」），不超过 ${GROUP_NAME_PROMPT_CHARS} 个字。
- 每份写一句为什么相关（不超过 ${WHY_PROMPT_CHARS} 个字），说它对这篇能起什么作用，不要复述它的内容。
- candidate 是候选编号。

输出格式：
{"groups":[{"name":"组名","items":[{"candidate":1,"why":"一句话"}]}]}`;

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) : flat;
};

export function buildGatherUserPrompt(input: GatherPromptInput): string {
  const lines: string[] = [`写作意图：${input.intent.trim() || "（没有写，按已有正文判断）"}`];
  if (input.title.trim()) lines.push(`文章标题：${input.title.trim()}`);
  if (input.outline.length) {
    lines.push(`已有大纲：${input.outline.slice(0, OUTLINE_MAX_ITEMS).join(" / ")}`);
  }
  if (input.recent.trim()) lines.push(`最近写的内容：\n${input.recent.trim()}`);
  lines.push("", "候选：");
  for (const candidate of input.candidates) {
    const head = [candidate.kindLabel, candidate.title, candidate.heading]
      .filter(Boolean)
      .join(" › ");
    lines.push(`[${candidate.no}] ${head}`);
    if (candidate.summary) lines.push(`  要点：${candidate.summary}`);
    if (candidate.claims.length) lines.push(`  主张：${candidate.claims.slice(0, 3).join("；")}`);
    if (candidate.excerpt) lines.push(`  片段：${clip(candidate.excerpt, EXCERPT_MAX_CHARS)}`);
  }
  return lines.join("\n");
}

/** 解析并核对；不是合法 JSON 时返回 null（调用方重试） */
export function parseGatherOutput(text: string, known: ReadonlySet<number>): ParsedGather | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let value: unknown;
  try {
    value = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const rawGroups = (value as { groups?: unknown })?.groups;
  if (!Array.isArray(rawGroups)) return null;
  const used = new Set<number>();
  const groups: ParsedGather["groups"] = [];
  for (const raw of rawGroups) {
    if (groups.length >= GATHER_MAX_GROUPS) break;
    const group = raw as { name?: unknown; items?: unknown };
    const items: Array<{ candidate: number; why: string }> = [];
    for (const rawItem of Array.isArray(group.items) ? group.items : []) {
      const item = rawItem as { candidate?: unknown; why?: unknown };
      const no = Number(item.candidate);
      if (!known.has(no) || used.has(no) || used.size >= GATHER_MAX_ITEMS) continue;
      used.add(no);
      items.push({
        candidate: no,
        why: clip(typeof item.why === "string" ? item.why : "", WHY_MAX_CHARS),
      });
    }
    if (!items.length) continue;
    const name = clip(typeof group.name === "string" ? group.name : "", GROUP_NAME_MAX_CHARS);
    groups.push({ name: name || "相关资料", items });
  }
  return { groups };
}
