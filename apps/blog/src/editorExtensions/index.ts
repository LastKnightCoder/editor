import { createImageExtensions, type AnyExtension } from "@tau/editor";
import webviewExtension from "@tau/editor-webview";
import { blogContentLinkExtension } from "./contentLinkExtension";
import {
  BlogDatabaseExtension,
  BlogFileAttachmentExtension,
  BlogWhiteboardExtension,
} from "./passiveExtensions";
import { getBlogImageAppearance, type BlogPublishSettings } from "../services/editorRegistry";

/** content 正文在 blog 上要覆盖的业务元素（清单见 @tau/shared 的 CONTENT_ELEMENT_TYPES） */
export const blogEditorExtensions: AnyExtension[] = [
  blogContentLinkExtension,
  webviewExtension,
  new BlogFileAttachmentExtension(),
  new BlogWhiteboardExtension(),
  new BlogDatabaseExtension(),
];

/** 页面级扩展：在公共扩展上叠加按发布设置定制外观的 image / image-gallery */
export function createBlogEditorExtensions(settings?: BlogPublishSettings): AnyExtension[] {
  return [
    ...blogEditorExtensions,
    ...createImageExtensions({ appearance: getBlogImageAppearance(settings) }),
  ];
}
