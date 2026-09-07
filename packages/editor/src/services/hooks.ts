import type { ServiceIdentifier } from "./tokens";
import type { ServiceRegistry } from "./registry";
import { IEditorSlots } from "./tokens";
import type { EditorSlots } from "./slots";
import { useEditorEnvironment } from "../contexts/EditorProvider";

/** 获取注册表本身，用于派生子注册表或非 React 场景转发 */
export function useServiceRegistry(): ServiceRegistry {
  const { registry } = useEditorEnvironment();
  if (!registry) {
    throw new Error(
      "useServiceRegistry 必须在 EditorProvider 内使用。" + "请确认应用根部已挂载 EditorProvider。"
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
  return useEditorEnvironment().registry?.tryGet(id);
}

/** 获取宿主注入的 UI 插槽组件 */
export function useEditorSlots(): EditorSlots {
  return useService(IEditorSlots);
}
