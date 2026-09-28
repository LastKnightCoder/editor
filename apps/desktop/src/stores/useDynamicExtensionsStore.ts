import { IExtension } from "@tau/editor/src";
import { create } from "zustand";

/**
 * 宿主扩展的异步装载。动态导入有两个原因，改成静态会同时踩到两件事：
 * 一是白板 / 数据库扩展会拉进整个白板引擎与数据库视图，这两块只在文档真的插了对应块时才需要；
 * 二是 editorKit → editor-extensions → whiteboard → components/WhiteBoard → DOMSizeMeasurer → editorKit
 * 成环，而 `new WhiteboardExtension()` 在模块初始化期求值，成环那一刻构造器还是 undefined。
 *
 * 装载一次、之后不再变化；消费者只有 `services/editorKit.ts` 与各入口的 bootstrap。
 */
interface IDynamicExtensionsStore {
  /** 任何内容都支持的宿主扩展 */
  extensions: IExtension[];
  /**
   * 只有库内内容（存 slate JSON）支持的块。Markdown 文件里没有对应语法——
   * 数据库没有 codec、白板只有 void 占位，插进去保存回 .md 会丢，所以文件编辑器不装这两个。
   */
  libraryBlockExtensions: IExtension[];
  /** 装载是否完成。建 kit 前据此拒绝，避免静默少扩展 */
  initialized: boolean;
  initExtensions: () => Promise<void>;
}

const useDynamicExtensionsStore = create<IDynamicExtensionsStore>(set => ({
  extensions: [],
  libraryBlockExtensions: [],
  initialized: false,
  initExtensions: async () => {
    const { contentLinkExtension, fileAttachmentExtension, inlineAIAssistantExtension } =
      await import("@/editor-extensions");
    const [{ default: WhiteboardExtension }, { default: DatabaseExtension }] = await Promise.all([
      import("@/editor-extensions/whiteboard"),
      import("@/editor-extensions/database"),
    ]);
    set({
      extensions: [contentLinkExtension, fileAttachmentExtension, inlineAIAssistantExtension],
      libraryBlockExtensions: [new WhiteboardExtension(), new DatabaseExtension()],
      initialized: true,
    });
  },
}));

export default useDynamicExtensionsStore;
