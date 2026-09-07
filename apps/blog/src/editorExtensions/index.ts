import type { IExtension } from "@tau/editor";
import WebviewExtension from "@tau/editor-webview";
import { blogContentLinkExtension } from "./contentLinkExtension";

export const blogEditorExtensions: IExtension[] = [
  blogContentLinkExtension,
  new WebviewExtension(),
];
