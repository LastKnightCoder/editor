import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import type IExtension from "../extensions/types";
import type { EditorKit } from "./EditorKit";

/**
 * kit 的传递：内核私有，不对宿主暴露 Provider（ER-004）。
 *
 * 嵌套编辑器（白板卡片、内容链接预览里的编辑器）默认继承外层编辑器的 kit：
 * `<Editor kit>` 在自己的子树里放入这个 Context，内层 `<Editor>` 不传 kit 时读到它。
 */
const EditorKitContext = createContext<EditorKit | null>(null);

/** 内核用：把本编辑器的 kit 传给子树（含嵌套编辑器与扩展组件） */
export function EditorKitScope({ kit, children }: { kit: EditorKit; children: ReactNode }) {
  return <EditorKitContext.Provider value={kit}>{children}</EditorKitContext.Provider>;
}

/** 继承外层编辑器的 kit；没有外层则为 null */
export function useInheritedKit(): EditorKit | null {
  return useContext(EditorKitContext);
}

/**
 * 解析本编辑器最终使用的 kit：显式传入 > 继承外层。
 * 需要 per-instance 扩展时在此派生，同一组输入返回同一个 kit 实例（否则编辑器会重建）。
 */
export function useResolvedKit(explicit: EditorKit | undefined): EditorKit {
  const inherited = useInheritedKit();
  const kit = explicit ?? inherited;
  if (!kit) {
    throw new Error(
      "[editor] <Editor> 需要 kit：请传 kit={createEditorKit(...)} 创建的实例，" +
        "或把它渲染在另一个编辑器的子树内以继承。"
    );
  }
  return kit;
}

/**
 * 在 kit 基础上叠加单个编辑器的扩展；无扩展时返回原 kit。
 * per-instance 扩展按 type 覆盖 kit 的同名实现（沿用迁移前的 later-wins 语义），
 * 相同扩展实例返回同一个派生 kit（kit.extend 内部按实例集合缓存），编辑器不会因此重建。
 */
export function useKitWithExtensions(
  kit: EditorKit,
  extensions: readonly IExtension[] | undefined
): EditorKit {
  return useMemo(
    () => (extensions?.length ? kit.extend({ extensions: [...extensions], override: true }) : kit),
    [kit, extensions]
  );
}
