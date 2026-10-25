import { createServiceId } from "@tau/shared/service-contract";

/** 宿主按场景限制节点编辑，未注册时沿用编辑器自身只读状态。 */
export interface ElementEditingPolicy {
  canEdit(type: string): boolean;
}
export const IElementEditingPolicy = createServiceId<ElementEditingPolicy>(
  "tau.host.element-editing-policy"
);
