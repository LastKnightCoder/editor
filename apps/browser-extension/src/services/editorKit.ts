/**
 * 浏览器扩展的 EditorKit：服务依赖 WebSocket 连接，所以按 wsClient 建一个。
 */
import { createEditorKit, createMarkdownPasteImportExtension, type EditorKit } from "@tau/editor";
import WebviewExtension from "@tau/editor-webview";
import type WebSocketClient from "../utils/WebSocketClient";
import { createExtensionEditorServices, extensionImportFromMarkdown } from "./editorRegistry";
import {
  ExtensionContentLinkExtension,
  ExtensionDatabaseExtension,
  ExtensionFileAttachmentExtension,
  ExtensionWhiteboardExtension,
} from "./passiveExtensions";

const cache = new WeakMap<WebSocketClient, EditorKit>();
let withoutClient: EditorKit | null = null;

export function getExtensionKit(wsClient?: WebSocketClient | null): EditorKit {
  const build = () =>
    createEditorKit({
      // content 正文的元素覆盖见 @tau/shared 的 CONTENT_ELEMENT_TYPES：
      // 笔记会被 desktop 那边的内容覆盖写回，所以这四种块都要能渲染
      extensions: [
        createMarkdownPasteImportExtension(extensionImportFromMarkdown),
        new WebviewExtension(),
        new ExtensionContentLinkExtension(),
        new ExtensionFileAttachmentExtension(),
        new ExtensionWhiteboardExtension(),
        new ExtensionDatabaseExtension(),
      ],
      services: [createExtensionEditorServices({ wsClient: wsClient ?? null })],
    });
  if (!wsClient) {
    withoutClient ??= build();
    return withoutClient;
  }
  let kit = cache.get(wsClient);
  if (!kit) {
    kit = build();
    cache.set(wsClient, kit);
  }
  return kit;
}
