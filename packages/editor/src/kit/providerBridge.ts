import { useEditorEnvironment } from "../contexts/EditorProvider";
import type IExtension from "../extensions/types";
import type { ServiceRegistry } from "../services/registry";
import { useInheritedKit } from "./context";

/**
 * P6 过渡期读取 `EditorProvider` 的唯一入口（`EditorProvider` 删除后整个文件删掉）。
 *
 * 这里刻意不引入内置扩展（`extensions/index`）：服务 hook 依赖本文件，而内置扩展的组件
 * 又依赖服务 hook，引进来会成环。需要内置扩展的合成逻辑在 `providerCompat.tsx`。
 */

/** 当前作用域可用的注册表：本编辑器 / 外层编辑器的 kit > EditorProvider */
export function useCompatibleRegistry(): ServiceRegistry | null {
  const kit = useInheritedKit();
  const environment = useEditorEnvironment();
  return kit?.registry ?? environment.registry;
}

/** 过渡期 Provider 上挂的宿主扩展 */
export function useProviderExtensions(): IExtension[] {
  return useEditorEnvironment().extensions;
}
