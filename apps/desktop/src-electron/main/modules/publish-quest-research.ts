/**
 * 求索录详情的研究投影：把问题的探究材料、对话与轨迹整理成公开页面的「据」（参考资料）与「径」（探索过程）。
 *
 * 资料编号即在 materials 中的序号（从 1 起），按「外部资料 → 我的笔记 → 讨论」排列；
 * 卡片 / 文章 / 项目文档带 citeKey，博客端据此给答案正文里指向它们的 content-link 自动编号。
 * 独立答案不算资料（由「解」展示），已删除的材料与对话不发布。
 */
import type {
  QuestionCompositionKind,
  QuestionDetail,
  QuestionEvent,
  QuestionMaterial,
  QuestionStatus,
} from "@/types";
import type { IPublishInitData } from "@/types/publish";

export type QuestMaterialKind = Exclude<QuestionCompositionKind, "answer">;
export type QuestMaterialGroup = "external" | "note" | "discussion";

export interface IQuestMaterialEntry {
  /** 引用编号（从 1 起） */
  index: number;
  kind: QuestMaterialKind;
  group: QuestMaterialGroup;
  title: string;
  /** 来源或附加信息，如「3.2k 字」「12 条消息」 */
  meta: string;
  /** 摘录（外部材料为引文；我的笔记为开头几句） */
  excerpt: string;
  /** 划线 / 标注上写下的想法 */
  note?: string;
  /** 站内已发布页面 */
  target?: import("@tau/plugins/publish-data").ContentRef;
  /** 外部原处（剪藏网页） */
  url?: string;
  /** 与正文 content-link 对账的键（contentType:refId） */
  citeKey?: string;
}

export interface IQuestTrailEntry {
  time: number;
  /** start 提出 / milestone 产出了自己的笔记 / plain 关联资料 / note 手写笔记 / done 解决 */
  tone: "start" | "milestone" | "plain" | "note" | "done";
  /** 动作描述；note 为笔记正文 */
  text: string;
  /** 涉及的资料编号 */
  refs: number[];
}

type ContentLinkTargets = IPublishInitData["contentLinkTargets"];

const EXCERPT_LIMIT = 200;

const GROUP_ORDER: QuestMaterialGroup[] = ["external", "note", "discussion"];

const KIND_LABEL: Record<QuestMaterialKind, string> = {
  card: "卡片",
  article: "文章",
  project_item: "项目文档",
  project: "项目",
  white_board: "白板",
  excerpt: "划线",
  "pdf-annotation": "PDF 标注",
  "web-clip": "剪藏",
  "chat-session": "对话",
};

const CREATED_VERB: Partial<Record<QuestionCompositionKind, string>> = {
  card: "写下卡片",
  article: "写了文章",
  project_item: "写了项目文档",
  project: "新建项目",
  white_board: "画了白板",
  answer: "写下解答",
};

/** 卡片 / 文章 / 项目文档在 content-link 中的 contentType */
const CITE_TYPE: Partial<Record<QuestMaterialKind, string>> = {
  card: "card",
  article: "article",
  project_item: "project-item",
};

const clip = (text: string) =>
  text.length > EXCERPT_LIMIT ? `${text.slice(0, EXCERPT_LIMIT)}…` : text;

const formatWords = (words: number) =>
  words >= 1000 ? `${(words / 1000).toFixed(1)}k 字` : words > 0 ? `${words} 字` : "";

const groupOf = (kind: QuestMaterialKind): QuestMaterialGroup =>
  kind === "chat-session"
    ? "discussion"
    : kind === "excerpt" || kind === "pdf-annotation" || kind === "web-clip"
      ? "external"
      : "note";

type DraftMaterial = Omit<IQuestMaterialEntry, "index"> & { key: string };

const linkKey = (kind: QuestionCompositionKind, id: number | string) => `${kind}:${id}`;

function draftFromMaterial(
  material: QuestionMaterial,
  targets: ContentLinkTargets
): DraftMaterial | null {
  if (material.missing || material.targetType === "answer") return null;
  const kind = material.targetType;
  const key = linkKey(kind, material.targetId);
  const info = material.material;
  if (info) {
    const isQuote = kind !== "web-clip";
    return {
      key,
      kind,
      group: "external",
      // 划线 / 标注以来源为标题、引文为摘录；剪藏标题本身就是网页标题
      title: (isQuote ? info.meta : info.title) || info.title,
      meta: isQuote ? "" : info.meta,
      excerpt: clip(isQuote ? info.quote : info.quote || info.note),
      note: isQuote && info.note ? clip(info.note) : undefined,
      url: info.open?.page === "external-url" ? info.open.url : undefined,
    };
  }
  const citeType = CITE_TYPE[kind];
  const citeKey = citeType ? `${citeType}:${material.targetId}` : undefined;
  const words = kind === "article" || kind === "project_item" ? formatWords(material.words) : "";
  return {
    key,
    kind,
    group: groupOf(kind),
    title: material.title,
    meta: [material.meta, words].filter(Boolean).join(" · "),
    excerpt: clip(material.excerpt),
    target: citeKey ? targets?.[citeKey] : undefined,
    citeKey,
  };
}

export function buildQuestMaterials(
  detail: Pick<QuestionDetail, "materials" | "chats">,
  targets: ContentLinkTargets
): { materials: IQuestMaterialEntry[]; indexByKey: Map<string, number> } {
  const drafts: DraftMaterial[] = detail.materials
    .map(material => draftFromMaterial(material, targets))
    .filter((draft): draft is DraftMaterial => draft != null);
  // 对话按关联时间正序，与轨迹先后一致
  [...detail.chats]
    .filter(chat => !chat.missing)
    .sort((a, b) => a.createTime - b.createTime)
    .forEach(chat =>
      drafts.push({
        key: linkKey("chat-session", chat.sessionId),
        kind: "chat-session",
        group: "discussion",
        title: chat.title,
        meta: [chat.scopeLabel, chat.messageCount ? `${chat.messageCount} 条消息` : ""]
          .filter(Boolean)
          .join(" · "),
        excerpt: "",
      })
    );

  const indexByKey = new Map<string, number>();
  const materials = GROUP_ORDER.flatMap(group => drafts.filter(draft => draft.group === group)).map(
    ({ key, ...rest }, i) => {
      indexByKey.set(key, i + 1);
      return { index: i + 1, ...rest };
    }
  );
  return { materials, indexByKey };
}

const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/**
 * 轨迹只保留读者关心的节点：提出、产出、关联、手写笔记、解决。
 * 同一天连续的同类节点合并为一行（如「关联 3 份资料」），解除关联与自动状态变化不展示。
 */
export function buildQuestTrail(
  events: QuestionEvent[],
  indexByKey: Map<string, number>
): IQuestTrailEntry[] {
  const trail: Array<IQuestTrailEntry & { mergeKey?: string }> = [];

  const pushMergeable = (time: number, tone: "milestone" | "plain", verb: string, ref?: number) => {
    const mergeKey = `${dayKey(time)}|${tone}|${tone === "milestone" ? verb : ""}`;
    const last = trail[trail.length - 1];
    if (last?.mergeKey === mergeKey) {
      if (ref != null && !last.refs.includes(ref)) last.refs.push(ref);
      if (tone === "plain") last.text = `关联 ${last.refs.length} 份资料`;
      return;
    }
    trail.push({ time, tone, text: verb, refs: ref != null ? [ref] : [], mergeKey });
  };

  for (const event of events) {
    const payload = event.payload as {
      to?: QuestionStatus;
      targetType?: QuestionCompositionKind;
      targetId?: number;
      sessionId?: string;
      created?: boolean;
      text?: string;
    };
    switch (event.type) {
      case "create":
        trail.push({ time: event.createTime, tone: "start", text: "提出问题", refs: [] });
        break;
      case "status":
        if (payload.to === "resolved") {
          trail.push({ time: event.createTime, tone: "done", text: "标为已解决", refs: [] });
        }
        break;
      case "note":
        if (payload.text?.trim()) {
          trail.push({ time: event.createTime, tone: "note", text: payload.text.trim(), refs: [] });
        }
        break;
      case "link": {
        const kind = payload.targetType ?? "card";
        if (kind === "answer") {
          if (payload.created) pushMergeable(event.createTime, "milestone", "写下解答");
          break;
        }
        const ref = indexByKey.get(
          linkKey(
            kind,
            kind === "chat-session" ? (payload.sessionId ?? "") : (payload.targetId ?? 0)
          )
        );
        // 已解除或已删除的材料不再出现在「据」里，轨迹也随之隐去
        if (ref == null) break;
        const verb = payload.created ? CREATED_VERB[kind] : undefined;
        if (verb) pushMergeable(event.createTime, "milestone", verb, ref);
        else pushMergeable(event.createTime, "plain", `关联${KIND_LABEL[kind] ?? "资料"}`, ref);
        break;
      }
      default:
        break;
    }
  }

  trail.forEach(entry => delete entry.mergeKey);
  return trail;
}
