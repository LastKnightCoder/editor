import { AnyExtension } from "@tau/editor";
import { create } from "zustand";

/**
 * 宿主扩展的异步装载。动态导入有两个原因，改成静态会同时踩到两件事：
 * 一是白板 / 数据库扩展会拉进整个白板引擎与数据库视图，这两块只在文档真的插了对应块时才需要；
 * 二是 editorKit → editor-extensions → whiteboard → components/WhiteBoard → DOMSizeMeasurer → editorKit
 * 成环，而扩展实例在模块初始化期求值，成环那一刻还是 undefined。
 *
 * 装载一次、之后不再变化；消费者只有 `services/editorKit.ts` 与各入口的 bootstrap。
 */
interface IDynamicExtensionsStore {
  extensions: AnyExtension[];
  /** 装载是否完成。建 kit 前据此拒绝，避免静默少扩展 */
  initialized: boolean;
  initExtensions: () => Promise<void>;
}

const useDynamicExtensionsStore = create<IDynamicExtensionsStore>(set => ({
  extensions: [],
  initialized: false,
  initExtensions: async () => {
    const { contentLinkExtension, fileAttachmentExtension } = await import("@/editor-extensions");
    const [{ default: whiteboardExtension }, { default: databaseExtension }] = await Promise.all([
      import("@/editor-extensions/whiteboard"),
      import("@/editor-extensions/database"),
    ]);
    set({
      extensions: [
        contentLinkExtension,
        fileAttachmentExtension,
        whiteboardExtension,
        databaseExtension,
      ],
      initialized: true,
    });
  },
}));

export default useDynamicExtensionsStore;
