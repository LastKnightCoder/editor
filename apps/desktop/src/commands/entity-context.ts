import { invoke } from "@/electron";
import type { EntityRef } from "@/entity/ref";
import type { EntityContext } from "@/types/entity-context";
import { withModule } from "./module-init";

/** 一个实体的脉络：共用正文、被引用、相关问题；实体不存在时为 null */
export function getEntityContext(ref: EntityRef) {
  return withModule("entity-context", () =>
    invoke<EntityContext | null>("entity-context:get", ref)
  );
}
