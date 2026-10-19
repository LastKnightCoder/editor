/**
 * 服务注册表实现已下沉到 @tau/shared/service-registry（编辑器与白板等宿主共用），
 * 此处保留原导入路径与公共 API 不变。
 */
export { createServiceRegistry, createChildRegistry } from "@tau/shared/service-registry";
export type {
  ServiceRegistry,
  ServiceRegister,
  ServiceRegistration,
} from "@tau/shared/service-registry";
