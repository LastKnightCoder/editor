import ContentLinkExtension from "./content-link";
import FileAttachmentExtension from "./file-attachment";
import ProjectCardListExtension from "./project-card-list";
import InlineAIAssistantExtension from "./inline-ai-assistant";
import WebviewExtension from "@tau/editor-webview";
import { createMarkdownPasteImportExtension } from "@tau/editor/src";
import { desktopImportFromMarkdown } from "@/services/editorServiceImplementations";

export const createProjectCardListExtension = (projectId?: number) =>
  new ProjectCardListExtension(projectId);

export const contentLinkExtension = new ContentLinkExtension();
export const fileAttachmentExtension = new FileAttachmentExtension();
export const inlineAIAssistantExtension = new InlineAIAssistantExtension();

/** 应用级扩展由 Desktop 根 Provider 注入，作用域限定在当前 React 树。 */
export const createDesktopEditorExtensions = () => [
  createMarkdownPasteImportExtension(desktopImportFromMarkdown),
  new WebviewExtension(),
];
