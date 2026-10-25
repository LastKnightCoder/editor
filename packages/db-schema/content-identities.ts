export const CONTENT_ENTITY_KINDS = [
  "whiteboard-content",
  "data-table",
  "project-item",
  "card",
  "article",
  "diary-moment",
  "whiteboard",
  "content",
  "video-note",
] as const;
export type ContentEntityKind = (typeof CONTENT_ENTITY_KINDS)[number];
export interface ContentEntityReference {
  sourceId: string;
  kind: ContentEntityKind;
  entityId: string;
}
export type ContentEntityTarget = number | ContentEntityReference;
export interface ContentEntityRelation {
  nodeId: string;
  slot: string;
  target: ContentEntityReference;
}
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value);
export function isContentEntityReference(value: unknown): value is ContentEntityReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ref = value as ContentEntityReference;
  return id(ref.sourceId) && id(ref.entityId) && CONTENT_ENTITY_KINDS.includes(ref.kind);
}

/** 内置引用节点的归属约束；不能仅凭同名插件类型认领实体槽。 */
export const CONTENT_ENTITY_NODE_CONTRACTS: Readonly<
  Record<string, { owner: string; kind: ContentEntityKind }>
> = Object.freeze({
  whiteboard: { owner: "host.whiteboard", kind: "whiteboard-content" },
  database: { owner: "host.database", kind: "data-table" },
  "project-card-list": { owner: "host.project-card-list", kind: "project-item" },
});
