/**
 * 浏览器扩展的 EditorKit：服务依赖 WebSocket 连接，所以按 wsClient 建一个。
 */
import { createEditorKit, createMarkdownPasteImportExtension, type EditorKit } from "@tau/editor";
import WebviewExtension from "@tau/editor-webview";
import type WebSocketClient from "../utils/WebSocketClient";
import { createExtensionEditorServices, extensionImportFromMarkdown } from "./editorRegistry";

const cache = new WeakMap<WebSocketClient, EditorKit>();
let withoutClient: EditorKit | null = null;

export function getExtensionKit(wsClient?: WebSocketClient | null): EditorKit {
  const build = () =>
    createEditorKit({
      extensions: [
        createMarkdownPasteImportExtension(extensionImportFromMarkdown),
        new WebviewExtension(),
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
