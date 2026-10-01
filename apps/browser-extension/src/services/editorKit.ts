/**
 * 浏览器扩展的 EditorKit：服务依赖 WebSocket 连接，所以按 wsClient 建一个。
 */
import { createEditorKit, createMarkdownPasteImportExtension, type EditorKit } from "@tau/editor";
import { standardExtensions } from "../../../../editor-extensions/standard";
import webviewExtension from "@tau/editor-webview";
import customBlockExtension from "@tau/editor-custom-block";
import { diagramExtensions } from "@tau/editor-diagram";
import { htmlExtensions } from "@tau/editor-html";
import { previewMenuExtension } from "@tau/editor-source-view/menu";
import codeBlockExtension from "@tau/editor-code-block";
import { mathExtensions } from "@tau/editor-math";
import emojiExtension from "@tau/editor-emoji";
import type WebSocketClient from "../utils/WebSocketClient";
import { createExtensionEditorServices, extensionImportFromMarkdown } from "./editorRegistry";
import {
  extensionContentLinkExtension,
  extensionDatabaseExtension,
  extensionFileAttachmentExtension,
  extensionWhiteboardExtension,
} from "./passiveExtensions";

const cache = new WeakMap<WebSocketClient, EditorKit>();
let withoutClient: EditorKit | null = null;

export function getExtensionKit(wsClient?: WebSocketClient | null): EditorKit {
  const build = () =>
    createEditorKit({
      // content 正文的元素覆盖见 @tau/shared 的 CONTENT_ELEMENT_TYPES：
      // 笔记会被 desktop 那边的内容覆盖写回，所以这四种块都要能渲染
      extensions: [
        ...standardExtensions,
        ...diagramExtensions,
        ...htmlExtensions,
        previewMenuExtension,
        codeBlockExtension,
        ...mathExtensions,
        emojiExtension,
        customBlockExtension,
        createMarkdownPasteImportExtension(extensionImportFromMarkdown),
        webviewExtension,
        extensionContentLinkExtension,
        extensionFileAttachmentExtension,
        extensionWhiteboardExtension,
        extensionDatabaseExtension,
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
