export const ENTITY_REF_KINDS = ["card", "article", "project-item", "diary"] as const;
export type EntityRefKind = (typeof ENTITY_REF_KINDS)[number];
export interface EntityRef {
  kind: EntityRefKind;
  id: number;
}
