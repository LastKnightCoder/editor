import type { ServiceIdentifier } from "./tokens";
import type { ServiceRegistry } from "./registry";
import { IEditorSlots } from "./tokens";
import type { EditorSlots } from "./slots";
import { useCompatibleRegistry } from "../kit/providerBridge";

/**
 * 服务的取用入口：优先本编辑器 kit 的注册表；
 * 过渡期（P6）回落到 EditorProvider，Provider 删除后只剩 kit。
 */
// 用函数声明而不是别名赋值：本模块与 kit 存在过渡期的循环引用，赋值会在模块初始化时取到 undefined
function useRegistry(): ServiceRegistry | null {
  return useCompatibleRegistry();
}

/** 获取注册表本身，用于派生子注册表或非 React 场景转发 */
export function useServiceRegistry(): ServiceRegistry {
  const registry = useRegistry();
  if (!registry) {
    throw new Error(
      "useServiceRegistry 必须在 <Editor> 子树内使用（或过渡期的 EditorProvider 内）。"
    );
  }
  return registry;
}

/** 获取必选服务，未注册时抛错 */
export function useService<T>(id: ServiceIdentifier<T>): T {
  return useServiceRegistry().get(id);
}

/** 获取可选服务，未注册时返回 undefined，由消费侧显式降级 */
export function useOptionalService<T>(id: ServiceIdentifier<T>): T | undefined {
  return useRegistry()?.tryGet(id);
}

/** 获取宿主注入的 UI 插槽组件 */
export function useEditorSlots(): EditorSlots {
  return useService(IEditorSlots);
}
