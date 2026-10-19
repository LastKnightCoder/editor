import webviewExtension from "@tau/editor/extensions/webview";
import { createMarkdownPasteImportExtension } from "@tau/editor";
import { createImageExtensions } from "@tau/editor/extensions/media";
import { desktopImportFromMarkdown } from "@/services/editorServiceImplementations";
import useSettingStore from "@/stores/useSettingStore";

export { default as contentLinkExtension } from "./content-link";
export { default as skillRefExtension } from "./skill-ref";
export { default as fileAttachmentExtension } from "./file-attachment";
export { createProjectCardListExtension } from "./project-card-list";

/** 应用级扩展由 Desktop 根 Provider 注入，作用域限定在当前 React 树。 */
export const createDesktopEditorExtensions = () => [
  createMarkdownPasteImportExtension(desktopImportFromMarkdown),
  webviewExtension,
  // 图片默认外观随设置变化，订阅 store，不必重建扩展
  ...createImageExtensions({
    appearance: {
      get: () => useSettingStore.getState().setting.appearance?.image,
      subscribe: listener => useSettingStore.subscribe(listener),
    },
  }),
];
