import { createServiceId } from "@tau/shared/service-contract";

/** 宿主为未注册节点提供占位说明（如插件尚在加载），返回 undefined 时用内核默认文案。 */
export interface UnknownElementNotice {
  describe(type: string): { message: string; title?: string } | undefined;
}
export const IUnknownElementNotice = createServiceId<UnknownElementNotice>(
  "tau.host.unknown-element-notice"
);
