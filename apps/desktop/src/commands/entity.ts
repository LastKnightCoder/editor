import { invoke } from "@/electron";
import type { EntityCandidate, EntityKind, EntityLocation, EntitySearchParams } from "@/types";

/** 通用实体检索：按类型 LIKE 检索标题 / 正文，空关键字按最近更新（EntityPicker 数据源） */
export async function searchEntities(params: EntitySearchParams): Promise<EntityCandidate[]> {
  return invoke("entity:search", params);
}

/** 由正文 content 反查所属实体（只存了 contentId 的关联用来跳转）；找不到返回 null */
export async function locateEntity(params: {
  contentId: number;
  kind?: EntityKind;
}): Promise<EntityLocation | null> {
  return invoke("entity:locate", params);
}
