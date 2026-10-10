/**
 * 统一实体地址：跨模块指向「一份正文的某个身份」（卡片、文章、项目文档、日记）。
 *
 * 实现位于 @tau/shared/entity-ref（桌面端与移动端共用），此处仅作转发。
 */

export {
  ENTITY_REF_KINDS,
  ENTITY_REF_PRIORITY,
  entityRefKey,
  isSameEntityRef,
  normalizeEntityRefKind,
} from "@tau/shared/entity-ref";
export type { EntityRef, EntityRefKind } from "@tau/shared/entity-ref";
