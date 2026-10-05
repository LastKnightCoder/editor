import { invoke } from "@/electron";
import type { EntityRef } from "@/entity/ref";
import type { ContextRelated, EntityContext } from "@/types/entity-context";
import { withModule } from "./module-init";

/** 一个实体的脉络：共用正文、被引用、相关问题；实体不存在时为 null */
export function getEntityContext(ref: EntityRef) {
  return withModule("entity-context", () =>
    invoke<EntityContext | null>("entity-context:get", ref)
  );
}

/** 脉络「相关」：语义相近但还没有关系的内容（最多 5 条） */
export function getEntityRelated(ref: EntityRef) {
  return withModule("entity-context", () =>
    invoke<ContextRelated[]>("entity-context:related", ref)
  );
}
