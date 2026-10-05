/**
 * 统一实体地址：跨模块指向「一份正文的某个身份」（卡片、文章、项目文档、日记）。
 *
 * 纯 TypeScript，主进程与渲染端共用。存量各处的类型写法（question_link 的 project_item、
 * content-link / 索引的 project-item 与 diary-daily）经 normalizeEntityRefKind 收口；
 * 存量表与接口不改写，只在新代码里使用这里的写法。
 */

/** 现阶段覆盖四类正文实体；后续按需扩展 */
export const ENTITY_REF_KINDS = ["card", "article", "project-item", "diary"] as const;

export type EntityRefKind = (typeof ENTITY_REF_KINDS)[number];

export interface EntityRef {
  kind: EntityRefKind;
  /** diary 为 diary_entries.id，其余为各自表的主键 */
  id: number;
}

const KIND_ALIASES: Record<string, EntityRefKind> = {
  card: "card",
  article: "article",
  "project-item": "project-item",
  project_item: "project-item",
  diary: "diary",
  "diary-daily": "diary",
};

/** 各处存量写法 → EntityRefKind；不认识的返回 null，由调用方丢弃 */
export function normalizeEntityRefKind(raw: unknown): EntityRefKind | null {
  return typeof raw === "string" ? (KIND_ALIASES[raw] ?? null) : null;
}

export const entityRefKey = (ref: EntityRef): string => `${ref.kind}:${ref.id}`;

export const isSameEntityRef = (a: EntityRef, b: EntityRef): boolean =>
  a.kind === b.kind && a.id === b.id;

/** 同一份正文被多个实体共用时，选哪个身份作代表：卡片 > 文章 > 项目文档 > 日记 */
export const ENTITY_REF_PRIORITY: Record<EntityRefKind, number> = {
  card: 0,
  article: 1,
  "project-item": 2,
  diary: 3,
};
