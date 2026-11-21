import type { DocumentElement } from "@tau/whiteboard";
import type { EntityRef } from "@/entity/ref";

/** 文档卡指向的正文实体；PDF 卡没有正文，返回 null（脉络、引用、创作模式只认正文实体） */
export function textEntityRef(
  ref: DocumentElement["entityRef"] | { kind: string; id: number } | null | undefined
): EntityRef | null {
  return ref && ref.kind !== "pdf" ? { kind: ref.kind as EntityRef["kind"], id: ref.id } : null;
}
