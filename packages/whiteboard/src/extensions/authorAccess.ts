import { createServiceId, type ServiceIdentifier } from "@tau/shared/service-contract";
/** 宿主在每次写入时复核工作区与插件激活实例。 */
export const IWhiteboardAuthorPermission: ServiceIdentifier<{ assertActive(): void }> =
  createServiceId<{ assertActive(): void }>("tau.whiteboard.author-permission");
