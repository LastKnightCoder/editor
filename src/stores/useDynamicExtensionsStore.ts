import { IExtension } from "@/components/Editor";
import { create } from "zustand";

interface IDynamicExtensionsStore {
  extensions: IExtension[];
  initExtensions: () => void;
}

const useDynamicExtensionsStore = create<IDynamicExtensionsStore>((set) => ({
  extensions: [],
  initExtensions: () => {
    import("@/editor-extensions").then(
      ({
        contentLinkExtension,
        fileAttachmentExtension,
        questionCardExtension,
        chatReferenceExtension,
      }) => {
        set({
          extensions: [
            contentLinkExtension,
            fileAttachmentExtension,
            questionCardExtension,
            chatReferenceExtension,
          ],
        });
      },
    );
  },
}));

export default useDynamicExtensionsStore;
