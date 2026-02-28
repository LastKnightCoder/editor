import { IExtension } from "@tau/editor/src";
import { create } from "zustand";

interface IDynamicExtensionsStore {
  extensions: IExtension[];
  initExtensions: () => Promise<void>;
}

const useDynamicExtensionsStore = create<IDynamicExtensionsStore>((set) => ({
  extensions: [],
  initExtensions: async () => {
    const {
      contentLinkExtension,
      fileAttachmentExtension,
      questionCardExtension,
      chatReferenceExtension,
      inlineAIAssistantExtension,
    } = await import("@/editor-extensions");
    const [{ default: WhiteboardExtension }, { default: DatabaseExtension }] =
      await Promise.all([
        import("@/editor-extensions/whiteboard"),
        import("@/editor-extensions/database"),
      ]);
    set({
      extensions: [
        contentLinkExtension,
        fileAttachmentExtension,
        questionCardExtension,
        chatReferenceExtension,
        inlineAIAssistantExtension,
        new WhiteboardExtension(),
        new DatabaseExtension(),
      ],
    });
  },
}));

export default useDynamicExtensionsStore;
