/**
 * 主题与全局层 AI 洞见、项目回顾的提示词与输出解析（纯函数，KL-060 / KL-062 / KL-065）。
 *
 * 分层阅读（ai-insights §5）：子主题读成员的 7a 元信息（不读原文），主题读子主题概述，全局读主题概述；
 * 项目回顾读项目文档的元信息。本地只给宽候选（相近的笔记对、跨主题的笔记对、问了没写的提问组、
 * 项目外可能属于这里的笔记），是不是重复 / 矛盾 / 呼应、缺了什么，全交给模型判断。
 * 模型只能引用给它的编号；长文一端的原文片段由调用方逐字核对，对不上的丢弃。
 */

export const SUBTOPIC_MAX_PAIRS = 3;
export const TOPIC_MAX_MARKS = 6;
export const TOPIC_MAX_GAPS = 2;
export const TOPIC_MAX_ASKS = 2;
export const GLOBAL_MAX_BRIDGES = 3;
export const GLOBAL_MAX_ASKED = 2;
export const PROJECT_MAX_BELONG = 3;
export const PROJECT_MAX_THIN = 2;
const OVERVIEW_MAX_CHARS = 200;
const SHIFT_MAX_CHARS = 80;
const LEAD_MAX_CHARS = 200;
const WHY_MAX_CHARS = 100;
const LABEL_MAX_CHARS = 30;
const ANCHOR_MAX_CHARS = 40;
const SECTION_MAX_CHARS = 300;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
const str = (value: unknown, max: number) =>
  typeof value === "string" ? clip(value.replace(/\s+/g, " ").trim(), max) : "";

/** 一份笔记在提示词里的样子：只有元信息，不含原文 */
export interface PromptNote {
  no: number;
  kindLabel: string;
  title: string;
  /** 写作月份，如「2024-05」 */
  month: string;
  summary: string;
  claims: string[];
  concepts: string[];
}

/** 长文一端的命中节原文（模型要从里面摘原文片段） */
export interface PromptSectionText {
  heading: string;
  text: string;
}

export interface PromptPair {
  no: number;
  left: number;
  right: number;
  /** 笔记编号 → 命中节原文（只有长文一端有） */
  sections: Record<number, PromptSectionText>;
}

const noteLine = (note: PromptNote) =>
  [
    `[${note.no}] ${note.kindLabel}《${clip(note.title, 40)}》${note.month ? ` ${note.month}` : ""}`,
    note.summary ? `要点：${note.summary}` : "",
    note.claims.length ? `主张：${note.claims.join("；")}` : "",
    note.concepts.length ? `概念：${note.concepts.join("、")}` : "",
  ]
    .filter(Boolean)
    .join("｜");

const sectionLines = (sections: Record<number, PromptSectionText>) =>
  Object.entries(sections).map(
    ([no, section]) =>
      `  [${no}] 的那一节${section.heading ? `（${section.heading}）` : ""}：${clip(
        section.text.replace(/\s+/g, " ").trim(),
        SECTION_MAX_CHARS
      )}`
  );

/** 宽松地取出模型输出里的 JSON 对象；无法解析返回 null */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

const numbers = (value: unknown): number[] =>
  Array.isArray(value) ? value.map(Number).filter(Number.isSafeInteger) : [];

/** 「P3」「B2」「3」都认 */
const refNo = (value: unknown): number => {
  if (typeof value === "number") return value;
  const match = typeof value === "string" ? value.match(/\d+/) : null;
  return match ? Number(match[0]) : NaN;
};

function anchorsOf(value: unknown): Record<number, string> {
  const result: Record<number, string> = {};
  if (!value || typeof value !== "object") return result;
  for (const [key, anchor] of Object.entries(value as Record<string, unknown>)) {
    const no = refNo(key);
    const text = typeof anchor === "string" ? anchor.trim() : "";
    if (Number.isSafeInteger(no) && text && text.length <= ANCHOR_MAX_CHARS) result[no] = text;
  }
  return result;
}

const COMMON_RULES = `- 宁缺毋滥：只给用户会觉得「这个提醒有用」的，没有就给空数组或 null。
- why 用一两句话说清理由（不超过 70 字），要具体到笔记里的内容，不说空话。
- 只能引用给你的编号；anchors 里的原文片段必须逐字摘自给出的那一节原文（2–30 字），不能改写；没给节原文的笔记不要给 anchor。
- 用笔记本身的语言输出。只输出一个 JSON 对象，不要解释或代码块。`;

// ───────────────────────── 子主题 ─────────────────────────

export const SUBTOPIC_SYSTEM_PROMPT = `你是用户个人知识库的阅读助手。给你用户知识地图里一个子主题下的笔记（每份是事先提炼的要点、主张、概念，按写作时间排列）和一些语义相近的笔记对，读完后输出：

- overview：这个子主题在讲什么、写到了什么程度（不超过 150 字），给上一层阅读用。
- shift：用户关注点随时间的变化（不超过 60 字），例如「早期写语法细节，最近转向运行时机制」；看不出变化给空串。
- pattern：用户在几份不同的笔记里反复使用同一种思路或分析办法（是「同一种办法」，不是「同一个话题」）。{"text":"这种思路的名字","notes":[3–5 个笔记编号],"why":"…"}，没有给 null。
- chain：几份笔记构成一条论证或学习线（有先后依赖），中间明显缺了一环，读起来是跳着的。{"notes":[按顺序 3–5 个编号],"missing":{"before":缺口后面那份的编号,"text":"缺的是什么（不超过 20 字）"},"why":"…"}，没有给 null。
- pairs：从给出的笔记对里挑出真正「重复」（说的是同一件事）或「矛盾」（主张互相冲突，或一处说总是、另一处给了例外；侧重点不同不算）的，最多 ${SUBTOPIC_MAX_PAIRS} 对。{"pair":"P1","type":"dup"|"conflict","why":"…","claims":["一方一句","另一方一句"],"anchors":{"笔记编号":"原文片段"}}。只是相关不算。

规则：
${COMMON_RULES}

输出格式：
{"overview":"…","shift":"…","pattern":null,"chain":null,"pairs":[]}`;

export interface SubtopicPromptInput {
  topic: string;
  subtopic: string;
  /** 成员总数（给模型的可能只是一部分） */
  total: number;
  notes: PromptNote[];
  pairs: PromptPair[];
  /** 增量改写：上一次的概述与还开着的发现，以及这次变了哪些成员 */
  previous?: {
    overview: string;
    shift: string;
    removed: string[];
    marks: string[];
  };
}

export function buildSubtopicPrompt(input: SubtopicPromptInput): string {
  const pairs = input.pairs.flatMap(pair => [
    `P${pair.no}：[${pair.left}] 与 [${pair.right}]`,
    ...sectionLines(pair.sections),
  ]);
  const previous = input.previous
    ? [
        `上一次的概述：${input.previous.overview || "（无）"}`,
        `上一次的关注点变化：${input.previous.shift || "（无）"}`,
        input.previous.marks.length
          ? `上一次还开着的发现：\n${input.previous.marks.join("\n")}`
          : "",
        input.previous.removed.length
          ? `之后移除的笔记：${input.previous.removed.map(t => `《${clip(t, 30)}》`).join("、")}`
          : "",
        "下面只列出新增或改过的笔记。在上一次的基础上改写 overview 与 shift，发现只针对下面的笔记给（仍然可以引用上一次发现里的笔记）。",
      ]
        .filter(Boolean)
        .join("\n")
    : "";
  return [
    `主题：${input.topic} › ${input.subtopic}（共 ${input.total} 份笔记）`,
    previous,
    `笔记：\n${input.notes.map(noteLine).join("\n")}`,
    pairs.length ? `相近的笔记对：\n${pairs.join("\n")}` : "相近的笔记对：无",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface ParsedSubtopic {
  overview: string;
  shift: string;
  pattern: { text: string; notes: number[]; why: string } | null;
  chain: { notes: number[]; missingBefore: number; missingText: string; why: string } | null;
  pairs: Array<{
    pair: number;
    type: "dup" | "conflict";
    why: string;
    claims: [string, string] | null;
    anchors: Record<number, string>;
  }>;
}

export function parseSubtopicOutput(
  text: string,
  noteNos: ReadonlySet<number>,
  pairNos: ReadonlySet<number>
): ParsedSubtopic | null {
  const value = parseJsonObject(text);
  if (!value) return null;
  const rawPattern = value.pattern as { text?: unknown; notes?: unknown; why?: unknown } | null;
  const patternNotes = [...new Set(numbers(rawPattern?.notes).filter(no => noteNos.has(no)))];
  const pattern =
    rawPattern && patternNotes.length >= 2 && str(rawPattern.text, LABEL_MAX_CHARS)
      ? {
          text: str(rawPattern.text, LABEL_MAX_CHARS),
          notes: patternNotes.slice(0, 5),
          why: str(rawPattern.why, WHY_MAX_CHARS),
        }
      : null;
  const rawChain = value.chain as {
    notes?: unknown;
    missing?: { before?: unknown; text?: unknown };
    why?: unknown;
  } | null;
  const chainNotes = [...new Set(numbers(rawChain?.notes).filter(no => noteNos.has(no)))].slice(
    0,
    5
  );
  const before = refNo(rawChain?.missing?.before);
  const missingText = str(rawChain?.missing?.text, LABEL_MAX_CHARS);
  const chain =
    rawChain && chainNotes.length >= 2 && chainNotes.includes(before) && missingText
      ? {
          notes: chainNotes,
          missingBefore: before,
          missingText,
          why: str(rawChain.why, WHY_MAX_CHARS),
        }
      : null;
  const seen = new Set<number>();
  const pairs: ParsedSubtopic["pairs"] = [];
  for (const raw of (Array.isArray(value.pairs) ? value.pairs : []) as Array<
    Record<string, unknown>
  >) {
    if (pairs.length >= SUBTOPIC_MAX_PAIRS) break;
    const pair = refNo(raw?.pair);
    const type = raw?.type === "dup" || raw?.type === "conflict" ? raw.type : null;
    if (!type || !pairNos.has(pair) || seen.has(pair)) continue;
    seen.add(pair);
    const claims = Array.isArray(raw.claims)
      ? (raw.claims.map(claim => str(claim, WHY_MAX_CHARS)) as string[])
      : [];
    pairs.push({
      pair,
      type,
      why: str(raw.why, WHY_MAX_CHARS),
      claims: type === "conflict" && claims[0] && claims[1] ? [claims[0], claims[1]] : null,
      anchors: anchorsOf(raw.anchors),
    });
  }
  return {
    overview: str(value.overview, OVERVIEW_MAX_CHARS),
    shift: str(value.shift, SHIFT_MAX_CHARS),
    pattern,
    chain,
    pairs,
  };
}

// ───────────────────────── 主题 ─────────────────────────

export const TOPIC_SYSTEM_PROMPT = `你是用户个人知识库的阅读助手。给你用户知识地图里一个主题的子主题概述、主题里出现的关键概念、每季度新写的笔记数，以及在子主题里已经找到的发现（候选），读完后输出：

- overview：这个主题在讲什么、写到了什么程度（不超过 150 字），给上一层阅读用。
- shift：用户在这个主题上关注点的变化（不超过 60 字），看不出给空串。
- lead：给用户看的两三句话（不超过 150 字）：这个主题多大、怎样在长或停了多久、关注点怎么变、AI 看到了几处什么。主题很大、却很少有笔记在项目里时，可以提一句它还没有被系统整理过。不复述概述。
- gaps：这个主题反复提到、却没有一份笔记展开的概念或问题（「还缺」），最多 ${TOPIC_MAX_GAPS} 条。{"text":"还缺：…（不超过 20 字）","why":"…"}。可以用你自己的知识判断「讲这个主题通常绕不开什么」。
- asks：0 到 ${TOPIC_MAX_ASKS} 个值得继续想的问题，一句话。
- pick：从候选里挑最值得告诉用户的编号（如 "M2"），连同 gaps 一共不超过 ${TOPIC_MAX_MARKS} 条；不值得的不要挑。

规则：
${COMMON_RULES}

输出格式：
{"overview":"…","shift":"…","lead":"…","gaps":[],"asks":[],"pick":[]}`;

export interface TopicPromptInput {
  topic: string;
  total: number;
  /** 主题里有几份在项目里 */
  inProjects: number;
  growth: Array<{ quarter: string; count: number }>;
  subtopics: Array<{ label: string; total: number; overview: string; shift: string }>;
  concepts: string[];
  candidates: Array<{ no: number; line: string }>;
}

export function buildTopicPrompt(input: TopicPromptInput): string {
  return [
    `主题：${input.topic}（共 ${input.total} 份笔记，其中 ${input.inProjects} 份在项目里）`,
    `每季度新写：${input.growth.map(item => `${item.quarter} ${item.count}`).join("，") || "无"}`,
    `子主题：\n${input.subtopics
      .map(
        (sub, index) =>
          `S${index + 1} ${sub.label}（${sub.total} 份）：${sub.overview || "（还没有概述）"}${
            sub.shift ? `｜变化：${sub.shift}` : ""
          }`
      )
      .join("\n")}`,
    input.concepts.length ? `关键概念：${input.concepts.join("、")}` : "",
    input.candidates.length
      ? `候选：\n${input.candidates.map(item => `M${item.no} ${item.line}`).join("\n")}`
      : "候选：无",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface ParsedTopic {
  overview: string;
  shift: string;
  lead: string;
  gaps: Array<{ text: string; why: string }>;
  asks: string[];
  pick: number[];
}

export function parseTopicOutput(
  text: string,
  candidateNos: ReadonlySet<number>
): ParsedTopic | null {
  const value = parseJsonObject(text);
  if (!value) return null;
  const gaps = (Array.isArray(value.gaps) ? value.gaps : [])
    .map(raw => {
      const item = raw as { text?: unknown; why?: unknown };
      return { text: str(item?.text, LABEL_MAX_CHARS), why: str(item?.why, WHY_MAX_CHARS) };
    })
    .filter(item => item.text)
    .slice(0, TOPIC_MAX_GAPS);
  const pick = [
    ...new Set(
      (Array.isArray(value.pick) ? value.pick : []).map(refNo).filter(no => candidateNos.has(no))
    ),
  ].slice(0, TOPIC_MAX_MARKS - gaps.length);
  return {
    overview: str(value.overview, OVERVIEW_MAX_CHARS),
    shift: str(value.shift, SHIFT_MAX_CHARS),
    lead: str(value.lead, LEAD_MAX_CHARS),
    gaps,
    asks: (Array.isArray(value.asks) ? value.asks : [])
      .map(ask => str(ask, 80))
      .filter(Boolean)
      .slice(0, TOPIC_MAX_ASKS),
    pick,
  };
}

// ───────────────────────── 全局 ─────────────────────────

export const GLOBAL_SYSTEM_PROMPT = `你是用户个人知识库的阅读助手。给你用户知识地图上各主题的概述、每季度新写的笔记数、跨主题的笔记对（候选呼应），以及用户在 AI 对话里问过、但笔记里离得都不近的提问组，读完后输出：

- lead：给用户看的两三句话（不超过 150 字）：版图多大、最近长在哪、哪里停了、你看到了几处呼应和几个问了没写的问题。
- bridges：两份笔记分属看似无关的主题，其实在说同一个道理或用同一个机制（「呼应」），最多 ${GLOBAL_MAX_BRIDGES} 条。只是都提到同一个词、或都属于某一大类不算；说不出「同一个道理是什么」就不要给。{"candidate":"B1","why":"先点明那个共同的道理，再说两边各是怎么体现的","anchors":{"笔记编号":"原文片段"}}。
- asked：用户反复问过、笔记里确实还没写、而且值得写下来的问题，最多 ${GLOBAL_MAX_ASKED} 条。{"group":"A1","question":"把这组提问整理成一个问题（不超过 40 字）","why":"…"}。一次性的事务性提问（翻译、改格式、查命令）不要给。
- asks：0 到 1 个关于整个知识版图值得想的问题。

规则：
${COMMON_RULES}

输出格式：
{"lead":"…","bridges":[],"asked":[],"asks":[]}`;

export interface GlobalPromptInput {
  totals: { notes: number; topics: number };
  growth: Array<{ quarter: string; count: number }>;
  topics: Array<{ label: string; total: number; recent: number; overview: string; shift: string }>;
  notes: PromptNote[];
  bridges: PromptPair[];
  /** 笔记编号 → 所属主题（候选呼应两端） */
  noteTopics: Record<number, string>;
  asked: Array<{ no: number; times: number; last: string; prompts: string[]; near: string }>;
}

export function buildGlobalPrompt(input: GlobalPromptInput): string {
  const bridges = input.bridges.flatMap(pair => [
    `B${pair.no}：「${input.noteTopics[pair.left] ?? ""}」[${pair.left}] 与 「${input.noteTopics[pair.right] ?? ""}」[${pair.right}]`,
    ...sectionLines(pair.sections),
  ]);
  return [
    `版图：${input.totals.notes} 份笔记、${input.totals.topics} 个主题`,
    `每季度新写：${input.growth.map(item => `${item.quarter} ${item.count}`).join("，") || "无"}`,
    `主题：\n${input.topics
      .map(
        (topic, index) =>
          `T${index + 1} ${topic.label}（${topic.total} 份，最近一年新写 ${topic.recent}）：${
            topic.overview || "（还没有概述）"
          }${topic.shift ? `｜变化：${topic.shift}` : ""}`
      )
      .join("\n")}`,
    input.notes.length ? `候选里的笔记：\n${input.notes.map(noteLine).join("\n")}` : "",
    bridges.length ? `候选呼应：\n${bridges.join("\n")}` : "候选呼应：无",
    input.asked.length
      ? `问了但离笔记都不近的提问组：\n${input.asked
          .map(
            group =>
              `A${group.no}（问过 ${group.times} 次，最近 ${group.last}${group.near ? `，最接近的主题：${group.near}` : ""}）：${group.prompts
                .map(prompt => `「${clip(prompt, 80)}」`)
                .join(" ")}`
          )
          .join("\n")}`
      : "提问组：无",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface ParsedGlobal {
  lead: string;
  bridges: Array<{ candidate: number; why: string; anchors: Record<number, string> }>;
  asked: Array<{ group: number; question: string; why: string }>;
  asks: string[];
}

export function parseGlobalOutput(
  text: string,
  bridgeNos: ReadonlySet<number>,
  askedNos: ReadonlySet<number>
): ParsedGlobal | null {
  const value = parseJsonObject(text);
  if (!value) return null;
  const bridges: ParsedGlobal["bridges"] = [];
  for (const raw of (Array.isArray(value.bridges) ? value.bridges : []) as Array<
    Record<string, unknown>
  >) {
    const candidate = refNo(raw?.candidate);
    if (!bridgeNos.has(candidate) || bridges.some(item => item.candidate === candidate)) continue;
    const why = str(raw.why, WHY_MAX_CHARS);
    if (!why) continue;
    bridges.push({ candidate, why, anchors: anchorsOf(raw.anchors) });
    if (bridges.length >= GLOBAL_MAX_BRIDGES) break;
  }
  const asked: ParsedGlobal["asked"] = [];
  for (const raw of (Array.isArray(value.asked) ? value.asked : []) as Array<
    Record<string, unknown>
  >) {
    const group = refNo(raw?.group);
    const question = str(raw?.question, 60);
    if (!askedNos.has(group) || !question || asked.some(item => item.group === group)) continue;
    asked.push({ group, question, why: str(raw.why, WHY_MAX_CHARS) });
    if (asked.length >= GLOBAL_MAX_ASKED) break;
  }
  return {
    lead: str(value.lead, LEAD_MAX_CHARS),
    bridges,
    asked,
    asks: (Array.isArray(value.asks) ? value.asks : [])
      .map(ask => str(ask, 80))
      .filter(Boolean)
      .slice(0, 1),
  };
}

// ───────────────────────── 项目回顾 ─────────────────────────

export const GROWTH_REVIEW_SYSTEM_PROMPT = `你是用户个人知识库的阅读助手。给你用户一个项目（持续生长的知识体系）的文档树、各文档的要点（标出上次回顾之后新增或改过的）、项目和项目外笔记已有的连接，以及项目外可能属于这里的笔记（候选），写一次「生长回顾」：

- lead：两三句话（不超过 150 字）：自上次回顾以来长了什么、新连上了哪里、结构里哪一支还薄。第一次回顾时说这个项目现在的样子。
- belong：候选里确实属于这个项目某一支、却散在外面的笔记，最多 ${PROJECT_MAX_BELONG} 条。{"candidate":"C1","branch":"D2","why":"…"}，branch 是它该挂在下面的那一支（文档树里的编号）。只是话题相近不算，要说得出它补上了那一支的什么。
- thin：结构里明显还薄的一支，最多 ${PROJECT_MAX_THIN} 条。{"branch":"D3","text":"这里还薄：…（不超过 24 字）","why":"…"}。
- asks：0 到 2 个值得继续想的问题。

规则：
${COMMON_RULES}

输出格式：
{"lead":"…","belong":[],"thin":[],"asks":[]}`;

export const FINAL_REVIEW_SYSTEM_PROMPT = `你是用户个人知识库的阅读助手。用户刚把一个项目（一次探索课题）归档了。给你项目的文档树与各文档的要点、项目和项目外笔记的连接，以及内容和它最接近的几个还在进行的项目，写一次「结项回顾」：

- lead：三四句话（不超过 180 字）：这个课题留下了哪几个核心观点、和已有的知识连上了哪里、还有什么没解决；如果它的结论适合归进某个还在进行的项目，点明是哪一个。
- core：最能代表核心观点的文档编号（如 "D2"），最多 3 个。
- asks：还没解决、值得记下来的问题，最多 3 个，一句话。
- home：最适合归入的那个进行中的项目编号（如 "P1"），没有合适的给 null。

规则：
${COMMON_RULES}

输出格式：
{"lead":"…","core":[],"asks":[],"home":null}`;

export interface ProjectPromptInput {
  title: string;
  lastReview: string;
  /** 文档树：编号、层级、标题、要点；fresh = 上次回顾之后新增或改过 */
  docs: Array<{ no: number; depth: number; title: string; summary: string; fresh: boolean }>;
  outside: string[];
  candidates: Array<{ note: PromptNote; branch: string }>;
  homes: Array<{ no: number; title: string; overlap: number }>;
}

export function buildProjectPrompt(input: ProjectPromptInput): string {
  return [
    `项目：${input.title}`,
    input.lastReview ? `上次回顾：${input.lastReview}` : "",
    `文档树：\n${input.docs
      .map(
        doc =>
          `${"  ".repeat(doc.depth)}D${doc.no} ${clip(doc.title, 40)}${doc.fresh ? "（新）" : ""}${
            doc.summary ? `：${doc.summary}` : ""
          }`
      )
      .join("\n")}`,
    input.outside.length
      ? `和项目外已有的连接：${input.outside.map(t => `《${clip(t, 30)}》`).join("、")}`
      : "和项目外已有的连接：无",
    input.candidates.length
      ? `项目外的候选：\n${input.candidates
          .map(
            item =>
              `C${item.note.no} ${noteLine(item.note).replace(/^\[\d+\] /, "")}｜最接近：${item.branch}`
          )
          .join("\n")}`
      : "",
    input.homes.length
      ? `进行中、内容最接近的项目：\n${input.homes
          .map(home => `P${home.no} ${home.title}（重合 ${Math.round(home.overlap * 100)}%）`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface ParsedGrowthReview {
  lead: string;
  belong: Array<{ candidate: number; branch: number; why: string }>;
  thin: Array<{ branch: number; text: string; why: string }>;
  asks: string[];
}

export function parseGrowthReviewOutput(
  text: string,
  candidateNos: ReadonlySet<number>,
  docNos: ReadonlySet<number>
): ParsedGrowthReview | null {
  const value = parseJsonObject(text);
  if (!value) return null;
  const belong: ParsedGrowthReview["belong"] = [];
  for (const raw of (Array.isArray(value.belong) ? value.belong : []) as Array<
    Record<string, unknown>
  >) {
    const candidate = refNo(raw?.candidate);
    const branch = refNo(raw?.branch);
    if (!candidateNos.has(candidate) || !docNos.has(branch)) continue;
    if (belong.some(item => item.candidate === candidate)) continue;
    belong.push({ candidate, branch, why: str(raw.why, WHY_MAX_CHARS) });
    if (belong.length >= PROJECT_MAX_BELONG) break;
  }
  const thin: ParsedGrowthReview["thin"] = [];
  for (const raw of (Array.isArray(value.thin) ? value.thin : []) as Array<
    Record<string, unknown>
  >) {
    const branch = refNo(raw?.branch);
    const note = str(raw?.text, LABEL_MAX_CHARS);
    if (!docNos.has(branch) || !note || thin.some(item => item.branch === branch)) continue;
    thin.push({ branch, text: note, why: str(raw.why, WHY_MAX_CHARS) });
    if (thin.length >= PROJECT_MAX_THIN) break;
  }
  return {
    lead: str(value.lead, LEAD_MAX_CHARS),
    belong,
    thin,
    asks: (Array.isArray(value.asks) ? value.asks : [])
      .map(ask => str(ask, 80))
      .filter(Boolean)
      .slice(0, 2),
  };
}

export interface ParsedFinalReview {
  lead: string;
  core: number[];
  asks: string[];
  home: number | null;
}

export function parseFinalReviewOutput(
  text: string,
  docNos: ReadonlySet<number>,
  homeNos: ReadonlySet<number>
): ParsedFinalReview | null {
  const value = parseJsonObject(text);
  if (!value) return null;
  const home = refNo(value.home);
  return {
    lead: str(value.lead, 240),
    core: [
      ...new Set(
        (Array.isArray(value.core) ? value.core : []).map(refNo).filter(no => docNos.has(no))
      ),
    ].slice(0, 3),
    asks: (Array.isArray(value.asks) ? value.asks : [])
      .map(ask => str(ask, 80))
      .filter(Boolean)
      .slice(0, 3),
    home: homeNos.has(home) ? home : null,
  };
}
