/**
 * 知识地图洞见视图的纯逻辑：每一层画哪些标记、逐条看的顺序、标记的几何（画布坐标）、记问题的来源。
 * 不碰 React 与 DOM，单测直接喂数据。
 */

import type { EntityRef } from "@/entity/ref";
import type { InsightMark } from "@/types/content-insights";
import type { QuestionCaptureSource } from "@/services/question-capture";
import type {
  KnowledgeEndpoint,
  KnowledgeInsightNode,
  KnowledgeInsightsPayload,
  KnowledgeMark,
  KnowledgeMarkKind,
} from "@/types/knowledge-insights";
import type { QuestionLinkTargetType } from "@/types/question";

export const MARK_META: Record<KnowledgeMarkKind, { label: string; dot: string; stroke: string }> =
  {
    bridge: { label: "呼应", dot: "bg-info", stroke: "var(--tau-info)" },
    asked: { label: "问了没写", dot: "bg-warn", stroke: "var(--tau-warn)" },
    dup: { label: "重复", dot: "bg-ink-3", stroke: "var(--tau-ink-3)" },
    conflict: { label: "矛盾", dot: "bg-danger", stroke: "var(--tau-danger)" },
    chain: { label: "缺一环", dot: "bg-accent", stroke: "var(--tau-ink-2)" },
    pattern: { label: "同一思路", dot: "bg-tag-3", stroke: "var(--tau-tag-3)" },
    gap: { label: "还缺", dot: "bg-ink-3", stroke: "var(--tau-ink-3)" },
    belong: { label: "可能属于这里", dot: "bg-accent", stroke: "var(--tau-accent)" },
    thin: { label: "还薄", dot: "bg-ink-3", stroke: "var(--tau-ink-3)" },
  };

/** 报告卡里数量签的顺序 */
export const KIND_ORDER: KnowledgeMarkKind[] = [
  "bridge",
  "asked",
  "conflict",
  "dup",
  "chain",
  "pattern",
  "gap",
];

/** 洞见视图当前在哪一层：全局，或某个主题（地图主题 id） */
export type MapLevel = { kind: "global" } | { kind: "topic"; topicId: number };

export const endpointKey = (end: KnowledgeEndpoint) => `${end.ref.kind}:${end.ref.id}`;

/** 页面参数 insight：打开地图时直接点亮的那一处 */
export function parseInsightParam(
  raw: string | undefined
): { level: MapLevel; markId: string | null } | null {
  if (!raw) return null;
  const [scope, first, second] = raw.split(":");
  if (scope === "global" && first) return { level: { kind: "global" }, markId: first };
  const topicId = Number(first);
  if (scope === "topic" && Number.isSafeInteger(topicId)) {
    return { level: { kind: "topic", topicId }, markId: second || null };
  }
  return null;
}

export const insightParam = (level: MapLevel, markId?: string) =>
  level.kind === "global"
    ? `global:${markId ?? ""}`
    : `topic:${level.topicId}${markId ? `:${markId}` : ""}`;

/** 这一层对应的结果；主题层取不到（主题已不在地图上）时为 null */
export function nodeOfLevel(
  data: KnowledgeInsightsPayload | null,
  level: MapLevel
): KnowledgeInsightNode | null {
  if (!data) return null;
  if (level.kind === "global") return data.global;
  return data.topics.find(topic => topic.topicId === level.topicId) ?? null;
}

/** 画在地图上的：还没处理的，加上已连接的（以已连接的样子留着） */
export const visibleMarks = (node: KnowledgeInsightNode | null) =>
  (node?.result.marks ?? []).filter(mark => mark.status === "open" || mark.status === "linked");

export const openMarks = (node: KnowledgeInsightNode | null) =>
  (node?.result.marks ?? []).filter(mark => mark.status === "open");

/** 有还没处理发现的主题（全局层主题名后的小点、数量签「有发现的主题」） */
export function topicsWithFindings(data: KnowledgeInsightsPayload | null) {
  return (data?.topics ?? []).filter(topic => topic.topicId !== null && openMarks(topic).length);
}

export interface FindingTopic {
  topicId: number;
  label: string;
  /** 还没处理的发现数 */
  open: number;
}

/** 切换主题的菜单：有发现的主题按还剩几处从多到少，同数保持原顺序 */
export function findingTopicList(data: KnowledgeInsightsPayload | null): FindingTopic[] {
  return topicsWithFindings(data)
    .map(topic => ({ topicId: topic.topicId!, label: topic.label, open: openMarks(topic).length }))
    .sort((a, b) => b.open - a.open);
}

/** 有还没看的：按钮上的小点 */
export function hasUnseen(data: KnowledgeInsightsPayload | null) {
  return Boolean(
    (data?.global && openMarks(data.global).length) || topicsWithFindings(data).length
  );
}

/** 两端都是卡片时可以在地图上直接连；有一端是长文时要去那篇里连 */
export const bothCards = (mark: KnowledgeMark) =>
  mark.ends.length === 2 && mark.ends.every(end => end.ref.kind === "card");

/**
 * 气泡的主动作：呼应与重复是连接；同一思路是已经会用、还没提炼的原理，写成一张卡片（KL-069）；
 * 其余是还不知道的，记为问题
 */
export type MarkAction = "connect" | "write" | "question";
export const primaryAction = (mark: KnowledgeMark): MarkAction =>
  mark.kind === "bridge" || mark.kind === "dup"
    ? "connect"
    : mark.kind === "pattern"
      ? "write"
      : "question";

/** 去连接时打开哪一端：有原文片段的长文优先 */
export function connectTarget(mark: KnowledgeMark): KnowledgeEndpoint | null {
  return (
    mark.ends.find(end => end.ref.kind !== "card" && end.anchor) ??
    mark.ends.find(end => end.ref.kind !== "card") ??
    null
  );
}

/**
 * 去连接时交给那篇文档洞见视图的一处：画在长文那一端的原文片段上，对方是另一端；
 * 没有逐字核对过的片段时返回 null（只能打开看看）。
 */
export function focusMarkOf(mark: KnowledgeMark, here: KnowledgeEndpoint): InsightMark | null {
  const other = mark.ends.find(end => end !== here);
  if (!here.anchor || !other) return null;
  return {
    id: `map-${mark.id}`,
    kind: mark.kind === "dup" ? "dup" : "link",
    block: here.block,
    anchor: here.anchor,
    text: "",
    why: mark.kind === "bridge" && mark.text ? `${mark.text}。${mark.why}` : mark.why,
    target: {
      ref: other.ref,
      contentId: other.contentId,
      title: other.title,
      heading: other.heading,
      block: other.block,
      excerpt: other.excerpt,
    },
    ...(mark.kind === "dup" ? { mine: here.excerpt, theirs: other.excerpt } : {}),
    status: "open",
  };
}

const stripGapPrefix = (text: string) => text.replace(/^(还缺|这里还薄)[:：]\s*/, "");

/** 气泡开头那一句：直白说出这一处是什么、涉及谁 */
export function markSummary(mark: KnowledgeMark): string {
  const [a, b] = mark.ends.map(end => `《${end.title}》`);
  switch (mark.kind) {
    case "bridge":
      return mark.text ? `${a}和${b}说的是同一个道理：${mark.text}` : `${a}和${b}遥相呼应`;
    case "dup":
      return `${a}和${b}写的几乎是同一件事`;
    case "conflict":
      return `${a}和${b}在同一件事上说法相反`;
    case "chain": {
      const index = mark.missing?.index ?? 1;
      const from = mark.ends[index - 1];
      const to = mark.ends[index];
      const missing = mark.missing?.text ? `「${mark.missing.text}」` : "一环";
      return from && to
        ? `从《${from.title}》到《${to.title}》之间少了${missing}`
        : `这条线上少了${missing}`;
    }
    case "pattern":
      return `这 ${mark.ends.length} 篇都用了「${mark.text ?? ""}」这个思路`;
    case "asked":
      return `你问过 ${mark.prompts?.length ?? 0} 次「${mark.text ?? ""}」，还没写成笔记`;
    case "gap":
    case "thin":
      return `这个主题还缺：${stripGapPrefix(mark.text ?? "")}`;
    default:
      return mark.text || mark.why;
  }
}

const QUESTION_TARGET: Record<EntityRef["kind"], QuestionLinkTargetType | null> = {
  card: "card",
  article: "article",
  "project-item": "project_item",
  diary: null,
};

/** 记为问题时的来源与默认标题 */
export function questionDraft(
  mark: KnowledgeMark,
  topicLabel: string
): { source: QuestionCaptureSource; sourceLabel: string; defaultTitle: string } {
  if (mark.kind === "asked") {
    const sessions = new Map<string, string[]>();
    for (const prompt of mark.prompts ?? []) {
      sessions.set(prompt.sessionId, [...(sessions.get(prompt.sessionId) ?? []), prompt.messageId]);
    }
    return {
      source: {
        kind: "chats",
        chats: [...sessions].map(([sessionId, messageIds]) => ({ sessionId, messageIds })),
      },
      sourceLabel: `对话：问过 ${mark.prompts?.length ?? 0} 次`,
      defaultTitle: mark.text ?? "",
    };
  }
  // 缺一环以空位之后那份为主（读到它时才觉得跳）
  const missing = mark.kind === "chain" ? mark.missing : undefined;
  const ends =
    missing && mark.ends[missing.index]
      ? [mark.ends[missing.index], ...mark.ends.filter((_, i) => i !== missing.index)]
      : mark.ends;
  const targets = ends.flatMap(end => {
    const targetType = QUESTION_TARGET[end.ref.kind];
    return targetType ? [{ targetType, targetId: end.ref.id }] : [];
  });
  const title =
    mark.kind === "gap" || mark.kind === "thin"
      ? stripGapPrefix(mark.text ?? "")
      : mark.kind === "chain"
        ? `${mark.missing?.text ?? ""}`
        : mark.why;
  if (!targets.length) {
    return { source: { kind: "none" }, sourceLabel: `主题：${topicLabel}`, defaultTitle: title };
  }
  return {
    source: { kind: "materials", targets },
    sourceLabel:
      targets.length === 1 ? `《${ends[0].title}》` : `《${ends[0].title}》等 ${targets.length} 份`,
    defaultTitle: title,
  };
}

// ───────────────────────── 几何（画布坐标） ─────────────────────────

export interface Point {
  x: number;
  y: number;
  /** 节点此刻画出来的半径；标记的圈随它缩放（非节点处的点没有） */
  r?: number;
}

export interface Circle extends Point {
  radius: number;
}

/** 覆盖层需要的坐标换算（LinkGraph 的 GraphOverlayApi 的子集） */
export interface Projector {
  project(key: string): Point | null;
  topicShape(topicId: number): Circle | null;
  scale(): number;
  subtopicLabelScale: number;
}

export type MarkGeometry =
  | { kind: "curve"; d: string; ends: Point[]; anchor: Point }
  | { kind: "line"; d: string; ends: Point[]; anchor: Point }
  | { kind: "wave"; d: string; ends: Point[]; anchor: Point }
  | { kind: "chain"; d: string; dots: Point[]; ghost: Point; anchor: Point }
  | { kind: "rings"; rings: Point[]; anchor: Point }
  | { kind: "pin"; at: Point; anchor: Point }
  | { kind: "note"; at: Point; anchor: Point };

const mid = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  ...(a.r !== undefined && b.r !== undefined ? { r: (a.r + b.r) / 2 } : {}),
});

/** 二次曲线：控制点在中垂线上，弯度随两端距离走，两端靠得近时也看得出是一道弧 */
export function curvePath(a: Point, b: Point, bend = 0.22): { d: string; apex: Point } {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / length;
  const ny = (b.x - a.x) / length;
  const offset = Math.max(24, length * bend);
  const control = { x: (a.x + b.x) / 2 + nx * offset, y: (a.y + b.y) / 2 + ny * offset };
  const apex = { x: (a.x + 2 * control.x + b.x) / 4, y: (a.y + 2 * control.y + b.y) / 4 };
  return { d: `M${a.x} ${a.y} Q${control.x} ${control.y} ${b.x} ${b.y}`, apex };
}

/** 波浪线：每 6px 一个折点，振幅 2px */
export function wavePath(a: Point, b: Point): string {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 1) return `M${a.x} ${a.y}`;
  const steps = Math.max(4, Math.round(length / 6));
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  let d = `M${a.x} ${a.y}`;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const off = i === steps ? 0 : i % 2 ? 2 : -2;
    d += ` L${(a.x + ux * length * t - uy * off).toFixed(1)} ${(a.y + uy * length * t + ux * off).toFixed(1)}`;
  }
  return d;
}

/** 主题名此刻画在哪：远景在岛中心，进入子主题层后挪到岛的上沿（与渲染器一致） */
export function topicLabelPoint(projector: Projector, topicId: number): Point | null {
  const shape = projector.topicShape(topicId);
  if (!shape) return null;
  if (projector.scale() >= projector.subtopicLabelScale) {
    return { x: shape.x, y: shape.y - shape.radius * 0.72 };
  }
  return { x: shape.x, y: shape.y };
}

/**
 * 一处标记此刻的几何；画不出来（涉及的笔记不在地图上）返回 null。
 * gapIndex：同一主题里第几条「还缺」，淡注往下排。
 */
export function markGeometry(
  mark: KnowledgeMark,
  projector: Projector,
  context: {
    topicId: number | null;
    topicByLabel: (label: string) => number | null;
    gapIndex: number;
  }
): MarkGeometry | null {
  const points = mark.ends.map(end => projector.project(endpointKey(end)));
  const placed = points.filter((point): point is Point => point !== null);
  switch (mark.kind) {
    case "bridge":
    case "dup":
    case "conflict": {
      const [a, b] = points;
      if (!a || !b) return null;
      if (mark.kind === "bridge") {
        const { d, apex } = curvePath(a, b);
        return { kind: "curve", d, ends: [a, b], anchor: apex };
      }
      if (mark.kind === "dup") {
        return {
          kind: "line",
          d: `M${a.x} ${a.y} L${b.x} ${b.y}`,
          ends: [a, b],
          anchor: mid(a, b),
        };
      }
      return { kind: "wave", d: wavePath(a, b), ends: [a, b], anchor: mid(a, b) };
    }
    case "chain": {
      if (placed.length < 2) return null;
      const index = Math.min(Math.max(mark.missing?.index ?? 1, 1), placed.length - 1);
      const ghost = mid(placed[index - 1], placed[index]);
      const route = [...placed.slice(0, index), ghost, ...placed.slice(index)];
      const d = route.map((point, i) => `${i ? "L" : "M"}${point.x} ${point.y}`).join(" ");
      return { kind: "chain", d, dots: placed, ghost, anchor: ghost };
    }
    case "pattern": {
      if (!placed.length) return null;
      const anchor = placed.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), {
        x: 0,
        y: 0,
      });
      return {
        kind: "rings",
        rings: placed,
        anchor: { x: anchor.x / placed.length, y: anchor.y / placed.length },
      };
    }
    case "asked": {
      // 画在它最接近的那个主题岛的右上沿；对不上主题时不画（逐条看与数量签仍能打开它）
      const topicId = mark.topicLabel ? context.topicByLabel(mark.topicLabel) : null;
      const shape = topicId === null ? null : projector.topicShape(topicId);
      if (!shape) return null;
      const at = {
        x: shape.x + shape.radius * 0.72,
        y: shape.y - shape.radius * 0.72,
      };
      return { kind: "pin", at, anchor: at };
    }
    case "gap": {
      if (context.topicId === null) return null;
      const label = topicLabelPoint(projector, context.topicId);
      if (!label) return null;
      const at = { x: label.x, y: label.y + 22 + context.gapIndex * 20 };
      return { kind: "note", at, anchor: at };
    }
    default:
      return null;
  }
}

/** 逐条看的顺序：按类型的显示顺序，同类按结果里的顺序 */
export function walkOrder(marks: KnowledgeMark[]): KnowledgeMark[] {
  const rank = (kind: KnowledgeMarkKind) => {
    const index = KIND_ORDER.indexOf(kind);
    return index < 0 ? KIND_ORDER.length : index;
  };
  return marks
    .map((mark, index) => ({ mark, index }))
    .sort((a, b) => rank(a.mark.kind) - rank(b.mark.kind) || a.index - b.index)
    .map(item => item.mark);
}
