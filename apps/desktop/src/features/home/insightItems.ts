/**
 * 今日页「洞见」列表的内容（KL-060）：从主题与全局层的结果、项目回顾里挑还没处理的，每条带上理由与证据。
 * 顺序：刚结项的回顾 > 呼应 > 问了没写 > 生长回顾 > 主题层发现（每个主题一条），最多 5 条。纯函数。
 */

import type {
  AskedPrompt,
  KnowledgeEndpoint,
  KnowledgeInsightNode,
  KnowledgeInsightsPayload,
  KnowledgeMark,
  KnowledgeMarkKind,
} from "@/types/knowledge-insights";

export const TODAY_INSIGHT_LIMIT = 5;
/** 每条最多列几处证据 */
export const TODAY_EVIDENCE_LIMIT = 3;

export type TodayInsightKind = "bridge" | "asked" | "topic" | "review";

/** 证据：问过的原话（打开那次对话），或涉及的笔记（打开到命中位置；矛盾时附两边各自的说法） */
export type TodayInsightEvidence =
  | { type: "prompts"; prompts: AskedPrompt[] }
  | { type: "ends"; ends: KnowledgeEndpoint[]; claims?: [string, string] };

export interface TodayInsight {
  key: string;
  kind: TodayInsightKind;
  /** 类型名（呼应 / 问了没写 / 矛盾 / 结项回顾…） */
  label: string;
  /** 出处范围：全局 / 跨主题 / 主题名 / 项目 */
  scope: string;
  /** 结果生成时间，显示为相对日期 */
  time: number;
  /** 标题一句话：重点的几个字单独拿出来画线 */
  before: string;
  em: string;
  after: string;
  /** 标题下的描述：AI 给的理由，回顾为首句之后的部分；可空 */
  desc: string;
  evidence: TodayInsightEvidence;
  /** 「去看看」打开哪里：地图（带 insight 参数）或项目（展开回顾） */
  open: { page: "knowledge-map"; insight: string } | { page: "project-detail"; projectId: number };
  /** 「不相关」 / 「知道了」 */
  dismiss: { type: "status"; nodeId: number; itemId: string } | { type: "seen"; nodeId: number };
  action: string;
}

const FIRST_SENTENCE = /^[^。！？!?]+[。！？!?]?/;

const firstSentence = (text: string) =>
  (text.match(FIRST_SENTENCE)?.[0] ?? text).replace(/[。！？!?]$/, "");

/** 首句之后的部分（回顾的描述） */
const restSentences = (text: string) => text.replace(FIRST_SENTENCE, "").trim();

/** 主题层标记的类型名，与知识地图气泡同一套叫法 */
const TOPIC_LABEL: Partial<Record<KnowledgeMarkKind, string>> = {
  dup: "重复",
  conflict: "矛盾",
  chain: "缺一环",
  pattern: "同一思路",
  gap: "还缺",
};

const endsEvidence = (mark: KnowledgeMark): TodayInsightEvidence => ({
  type: "ends",
  ends: mark.ends.slice(0, TODAY_EVIDENCE_LIMIT),
  ...(mark.claims && mark.ends.length === 2 ? { claims: mark.claims } : {}),
});

const openMarks = (node: KnowledgeInsightNode | null) =>
  (node?.result.marks ?? []).filter(mark => mark.status === "open");

/** 回顾还没看过：从没看过，或看过之后又重新写了 */
export const reviewUnseen = (node: KnowledgeInsightNode) =>
  Boolean(node.result.lead) && !(node.result.seenAt && node.result.seenAt >= node.updateTime);

const titles = (mark: KnowledgeMark) => mark.ends.map(end => `《${end.title}》`);

/** 主题层一处发现的一句话 */
function describe(mark: KnowledgeMark): string {
  const [a, b] = titles(mark);
  switch (mark.kind) {
    case "dup":
      return `${a}和${b}说的是同一件事`;
    case "conflict":
      return `${a}和${b}的说法对不上`;
    case "chain":
      return `一条线上缺了「${mark.missing?.text ?? ""}」这一环`;
    case "pattern":
      return `你反复用「${mark.text ?? ""}」这种办法`;
    case "gap":
      return (mark.text ?? "").replace(/^还缺[:：]\s*/, "还缺：");
    default:
      return mark.why;
  }
}

export function todayInsights(data: KnowledgeInsightsPayload | null): TodayInsight[] {
  if (!data) return [];
  const finals: TodayInsight[] = [];
  const growths: TodayInsight[] = [];
  for (const node of data.projects) {
    if (node.projectId === null || !reviewUnseen(node)) continue;
    const final = node.reviewKind === "final";
    (final ? finals : growths).push({
      key: `review:${node.id}`,
      kind: "review",
      label: final ? "结项回顾" : "生长回顾",
      scope: "项目",
      time: node.updateTime,
      before: final ? `「${node.label}」已结项：` : `「${node.label}」最近在长：`,
      em: firstSentence(node.result.lead),
      after: "",
      desc: restSentences(node.result.lead),
      evidence: { type: "ends", ends: (node.result.refs ?? []).slice(0, TODAY_EVIDENCE_LIMIT) },
      open: { page: "project-detail", projectId: node.projectId },
      dismiss: { type: "seen", nodeId: node.id },
      action: "打开回顾",
    });
  }
  const bridges: TodayInsight[] = [];
  const asked: TodayInsight[] = [];
  for (const mark of openMarks(data.global)) {
    const { id: nodeId, updateTime: time } = data.global!;
    if (mark.kind === "bridge" && mark.ends.length === 2) {
      const [a, b] = mark.ends;
      bridges.push({
        key: `global:${mark.id}`,
        kind: "bridge",
        label: "呼应",
        scope: "跨主题",
        time,
        before:
          a.topic && b.topic && a.topic !== b.topic
            ? `「${a.topic}」和「${b.topic}」其实在说同一件事：`
            : `《${a.title}》和《${b.title}》其实在说同一件事：`,
        em: mark.text || mark.why,
        after: "",
        desc: mark.text ? mark.why : "",
        evidence: endsEvidence(mark),
        open: { page: "knowledge-map", insight: `global:${mark.id}` },
        dismiss: { type: "status", nodeId, itemId: mark.id },
        action: "在地图上看",
      });
    }
    if (mark.kind === "asked") {
      asked.push({
        key: `global:${mark.id}`,
        kind: "asked",
        label: "问了没写",
        scope: mark.topicLabel || "全局",
        time,
        before: `你在对话里问过 ${mark.prompts?.length ?? 0} 次`,
        em: mark.text ?? "",
        after: /[？?]$/.test(mark.text ?? "") ? " 笔记里还没写" : "，笔记里还没写",
        desc: mark.why,
        evidence: { type: "prompts", prompts: (mark.prompts ?? []).slice(0, TODAY_EVIDENCE_LIMIT) },
        open: { page: "knowledge-map", insight: `global:${mark.id}` },
        dismiss: { type: "status", nodeId, itemId: mark.id },
        action: "在地图上看",
      });
    }
  }
  const topics: TodayInsight[] = [];
  for (const node of data.topics) {
    const marks = openMarks(node);
    if (!marks.length || node.topicId === null) continue;
    const first = marks[0];
    topics.push({
      key: `topic:${node.id}:${first.id}`,
      kind: "topic",
      label: TOPIC_LABEL[first.kind] ?? "主题",
      scope: marks.length > 1 ? `${node.label} · ${marks.length} 处发现` : node.label,
      time: node.updateTime,
      before: "",
      em: describe(first),
      after: "",
      desc: first.kind === "gap" ? "" : first.why,
      evidence: endsEvidence(first),
      open: { page: "knowledge-map", insight: `topic:${node.topicId}:${first.id}` },
      dismiss: { type: "status", nodeId: node.id, itemId: first.id },
      action: "在地图上看",
    });
  }
  return [...finals, ...bridges, ...asked, ...growths, ...topics].slice(0, TODAY_INSIGHT_LIMIT);
}
