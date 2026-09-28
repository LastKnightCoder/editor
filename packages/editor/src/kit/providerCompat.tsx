import { useMemo } from "react";

import { createEditorKitFromRegistry, type EditorKit } from "./EditorKit";
import { useInheritedKit } from "./context";
import { useCompatibleRegistry, useProviderExtensions } from "./providerBridge";

/**
 * P6 过渡期：把尚未迁移的 `<EditorProvider registry extensions>` 合成为一个 kit。
 * `EditorProvider` 删除后整个文件删掉。
 */

/**
 * 解析本编辑器最终使用的 kit：显式 kit > 继承外层 > 由 EditorProvider 合成。
 * `bare` 表示「裸编辑器」（原 `disableStartExtensions`）：沿用服务，但只装本实例列出的扩展。
 */
export function useCompatibleKit(explicit: EditorKit | undefined, bare: boolean): EditorKit {
  const inherited = useInheritedKit();
  const providerRegistry = useCompatibleRegistry();
  const providerExtensions = useProviderExtensions();
  const resolved = explicit ?? inherited;

  return useMemo(() => {
    const registry = resolved?.registry ?? providerRegistry;
    if (!registry) {
      throw new Error(
        "[editor] <Editor> 需要 kit：请传 kit={createEditorKit(...)}，或渲染在另一个编辑器的子树内以继承"
      );
    }
    if (bare) {
      return createEditorKitFromRegistry(registry, { builtins: false });
    }
    if (resolved) return resolved;
    return createEditorKitFromRegistry(registry, {
      extensions: [...providerExtensions],
      override: true,
    });
  }, [resolved, bare, providerRegistry, providerExtensions]);
}
