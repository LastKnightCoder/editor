/**
 * 今日页「洞见」卡的内容（KL-060）：从主题与全局层的结果、项目回顾里挑还没处理的，一次说一件事。
 * 顺序：刚结项的回顾 > 呼应 > 问了没写 > 生长回顾 > 主题层发现（每个主题一条），最多 5 条。纯函数。
 */

import type {
  KnowledgeInsightNode,
  KnowledgeInsightsPayload,
  KnowledgeMark,
} from "@/types/knowledge-insights";

export const TODAY_INSIGHT_LIMIT = 5;

export type TodayInsightKind = "bridge" | "asked" | "topic" | "review";

export interface TodayInsight {
  key: string;
  kind: TodayInsightKind;
  /** 句首的小标签 */
  label: string;
  /** 一句话：重点的几个字单独拿出来画线 */
  before: string;
  em: string;
  after: string;
  /** 「去看看」打开哪里：地图（带 insight 参数）或项目（展开回顾） */
  open: { page: "knowledge-map"; insight: string } | { page: "project-detail"; projectId: number };
  /** 「不相关」 / 「知道了」 */
  dismiss: { type: "status"; nodeId: number; itemId: string } | { type: "seen"; nodeId: number };
  action: string;
}

const firstSentence = (text: string) => {
  const match = text.match(/^[^。！？!?]+[。！？!?]?/);
  return (match?.[0] ?? text).replace(/[。！？!?]$/, "");
};

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
      label: "回顾",
      before: final ? `「${node.label}」已结项：` : `「${node.label}」最近在长：`,
      em: firstSentence(node.result.lead),
      after: "",
      open: { page: "project-detail", projectId: node.projectId },
      dismiss: { type: "seen", nodeId: node.id },
      action: "打开回顾",
    });
  }
  const bridges: TodayInsight[] = [];
  const asked: TodayInsight[] = [];
  for (const mark of openMarks(data.global)) {
    const nodeId = data.global!.id;
    if (mark.kind === "bridge" && mark.ends.length === 2) {
      const [a, b] = mark.ends;
      bridges.push({
        key: `global:${mark.id}`,
        kind: "bridge",
        label: "呼应",
        before:
          a.topic && b.topic && a.topic !== b.topic
            ? `「${a.topic}」和「${b.topic}」其实在说同一件事：`
            : `《${a.title}》和《${b.title}》其实在说同一件事：`,
        em: mark.text || mark.why,
        after: "",
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
        before: `你在对话里问过 ${mark.prompts?.length ?? 0} 次`,
        em: mark.text ?? "",
        after: "，笔记里还没写",
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
      label: "主题",
      before: `「${node.label}」里有 ${marks.length} 处发现：`,
      em: describe(first),
      after: "",
      open: { page: "knowledge-map", insight: `topic:${node.topicId}:${first.id}` },
      dismiss: { type: "status", nodeId: node.id, itemId: first.id },
      action: "在地图上看",
    });
  }
  return [...finals, ...bridges, ...asked, ...growths, ...topics].slice(0, TODAY_INSIGHT_LIMIT);
}
