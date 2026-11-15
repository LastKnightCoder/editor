import webviewExtension from "@tau/editor/extensions/webview";
import { createMarkdownPasteImportExtension } from "@tau/editor";
import { createImageExtensions } from "@tau/editor/extensions/media";
import { importFromMarkdown } from "@/utils/markdown";
import useSettingStore from "@/stores/useSettingStore";

export const createDesktopEditorExtensions = () => [
  createMarkdownPasteImportExtension(importFromMarkdown),
  webviewExtension,
  ...createImageExtensions({
    appearance: {
      get: () => useSettingStore.getState().setting.appearance?.image,
      subscribe: listener => useSettingStore.subscribe(listener),
    },
  }),
];
