import { createImageExtensions, type IExtension } from "@tau/editor";
import WebviewExtension from "@tau/editor-webview";
import { blogContentLinkExtension } from "./contentLinkExtension";
import { getBlogImageAppearance, type BlogPublishSettings } from "../services/editorRegistry";

export const blogEditorExtensions: IExtension[] = [
  blogContentLinkExtension,
  new WebviewExtension(),
];

/** 页面级扩展：在公共扩展上叠加按发布设置定制外观的 image / image-gallery */
export function createBlogEditorExtensions(settings?: BlogPublishSettings): IExtension[] {
  return [
    ...blogEditorExtensions,
    ...createImageExtensions({ appearance: getBlogImageAppearance(settings) }),
  ];
}
