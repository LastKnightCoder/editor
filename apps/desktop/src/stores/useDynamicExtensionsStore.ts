import { EditorExtension } from "@tau/editor";
import { create } from "zustand";

/**
 * 宿主扩展在启动界面挂载后按叶子入口异步加载，完成后才开放正文 kit。
 * 扩展声明不经桶入口互相加载，重型引用预览在实际显示时再加载。
 *
 * 装载一次、之后不再变化；消费者只有 `services/editorKit.ts` 与各入口的 bootstrap。
 */
interface IDynamicExtensionsStore {
  extensions: EditorExtension[];
  /** 装载是否完成。建 kit 前据此拒绝，避免静默少扩展 */
  initialized: boolean;
  initExtensions: () => Promise<void>;
}

const useDynamicExtensionsStore = create<IDynamicExtensionsStore>(set => ({
  extensions: [],
  initialized: false,
  initExtensions: async () => {
    const [
      { default: contentLinkExtension },
      { default: chatRefExtension },
      { default: fileAttachmentExtension },
      { default: whiteboardExtension },
      { default: databaseExtension },
    ] = await Promise.all([
      import("@/editor-extensions/content-link"),
      import("@/editor-extensions/chat-ref"),
      import("@/editor-extensions/file-attachment"),
      import("@/editor-extensions/whiteboard"),
      import("@/editor-extensions/database"),
    ]);
    set({
      extensions: [
        contentLinkExtension,
        chatRefExtension,
        fileAttachmentExtension,
        whiteboardExtension,
        databaseExtension,
      ],
      initialized: true,
    });
  },
}));

export default useDynamicExtensionsStore;
