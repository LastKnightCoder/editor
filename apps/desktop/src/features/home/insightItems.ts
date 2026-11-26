/**
 * 今日页「洞见」列表的内容（KL-060）：从主题与全局层的结果、项目回顾里挑还没处理的，每条带上理由与证据。
 * 顺序：刚结项的回顾 > 呼应 > 问了没写 > 生长回顾 > 主题层发现（每个主题一条），最多 5 条。纯函数。
 */

import type { TranslationValues } from "@tau/i18n";
import type { HomeMessageKey } from "./i18n";
import type {
  AskedPrompt,
  KnowledgeEndpoint,
  KnowledgeInsightNode,
  KnowledgeInsightsPayload,
  KnowledgeMark,
  KnowledgeMarkKind,
} from "@/types/knowledge-insights";

interface InsightLocale {
  locale: string;
  t(key: HomeMessageKey, values?: TranslationValues): string;
}

const TODAY_INSIGHT_LIMIT = 5;
/** 每条最多列几处证据 */
const TODAY_EVIDENCE_LIMIT = 3;

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
const TOPIC_LABEL: Partial<Record<KnowledgeMarkKind, HomeMessageKey>> = {
  dup: "insight.dup",
  conflict: "insight.conflict",
  chain: "insight.chain",
  pattern: "insight.pattern",
  gap: "insight.gap",
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

const titles = (mark: KnowledgeMark) => mark.ends.map(end => end.title);

/** 主题层一处发现的一句话 */
function describe(mark: KnowledgeMark, t: InsightLocale["t"]): string {
  const [a, b] = titles(mark);
  switch (mark.kind) {
    case "dup":
      return t("insight.describeDup", { a, b });
    case "conflict":
      return t("insight.describeConflict", { a, b });
    case "chain":
      return t("insight.describeChain", { missing: mark.missing?.text ?? "" });
    case "pattern":
      return t("insight.describePattern", { text: mark.text ?? "" });
    case "gap":
      return (mark.text ?? "").replace(/^还缺[:：]\s*/, "还缺：");
    default:
      return mark.why;
  }
}

export function todayInsights(
  data: KnowledgeInsightsPayload | null,
  { t, locale }: InsightLocale
): TodayInsight[] {
  const number = new Intl.NumberFormat(locale);
  const headline = (key: HomeMessageKey, em: string, values: TranslationValues = {}) => {
    let marker = String.fromCharCode(0xfffc);
    while (Object.values(values).some(value => String(value).includes(marker)))
      marker += String.fromCharCode(0xfffc);
    const [before, ...after] = t(key, { ...values, value: marker }).split(marker);
    return { before, em, after: after.join(marker) };
  };
  if (!data) return [];
  const finals: TodayInsight[] = [];
  const growths: TodayInsight[] = [];
  for (const node of data.projects) {
    if (node.projectId === null || !reviewUnseen(node)) continue;
    const final = node.reviewKind === "final";
    (final ? finals : growths).push({
      key: `review:${node.id}`,
      kind: "review",
      label: t(final ? "insight.final" : "insight.growth"),
      scope: t("kind.project"),
      time: node.updateTime,
      ...headline(
        final ? "insight.reviewFinal" : "insight.reviewGrowth",
        firstSentence(node.result.lead),
        { name: node.label }
      ),
      desc: restSentences(node.result.lead),
      evidence: { type: "ends", ends: (node.result.refs ?? []).slice(0, TODAY_EVIDENCE_LIMIT) },
      open: { page: "project-detail", projectId: node.projectId },
      dismiss: { type: "seen", nodeId: node.id },
      action: t("insight.openReview"),
    });
  }
  const bridges: TodayInsight[] = [];
  const asked: TodayInsight[] = [];
  const global = data.global;
  for (const mark of openMarks(global)) {
    if (global === null) break;
    const { id: nodeId, updateTime: time } = global;
    if (mark.kind === "bridge" && mark.ends.length === 2) {
      const [a, b] = mark.ends;
      bridges.push({
        key: `global:${mark.id}`,
        kind: "bridge",
        label: t("insight.bridge"),
        scope: t("insight.crossTopic"),
        time,
        ...headline(
          a.topic && b.topic && a.topic !== b.topic
            ? "insight.bridgeTopics"
            : "insight.bridgeTitles",
          mark.text || mark.why,
          {
            a: a.topic && b.topic && a.topic !== b.topic ? a.topic : a.title,
            b: a.topic && b.topic && a.topic !== b.topic ? b.topic : b.title,
          }
        ),
        desc: mark.text ? mark.why : "",
        evidence: endsEvidence(mark),
        open: { page: "knowledge-map", insight: `global:${mark.id}` },
        dismiss: { type: "status", nodeId, itemId: mark.id },
        action: t("insight.openMap"),
      });
    }
    if (mark.kind === "asked") {
      asked.push({
        key: `global:${mark.id}`,
        kind: "asked",
        label: t("insight.asked"),
        scope: mark.topicLabel || t("insight.global"),
        time,
        ...headline(
          /[？?]$/.test(mark.text ?? "") ? "insight.askedQuestion" : "insight.askedHeadline",
          mark.text ?? "",
          { count: mark.prompts?.length ?? 0, times: number.format(mark.prompts?.length ?? 0) }
        ),
        desc: mark.why,
        evidence: { type: "prompts", prompts: (mark.prompts ?? []).slice(0, TODAY_EVIDENCE_LIMIT) },
        open: { page: "knowledge-map", insight: `global:${mark.id}` },
        dismiss: { type: "status", nodeId, itemId: mark.id },
        action: t("insight.openMap"),
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
      label: t(TOPIC_LABEL[first.kind] ?? "insight.topic"),
      scope:
        marks.length > 1
          ? t("insight.topicScope", { name: node.label, value: number.format(marks.length) })
          : node.label,
      time: node.updateTime,
      before: "",
      em: describe(first, t),
      after: "",
      desc: first.kind === "gap" ? "" : first.why,
      evidence: endsEvidence(first),
      open: { page: "knowledge-map", insight: `topic:${node.topicId}:${first.id}` },
      dismiss: { type: "status", nodeId: node.id, itemId: first.id },
      action: t("insight.openMap"),
    });
  }
  return [...finals, ...bridges, ...asked, ...growths, ...topics].slice(0, TODAY_INSIGHT_LIMIT);
}
