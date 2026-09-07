import type { Descendant } from "slate";

/** Webview 外部扩展的节点类型，浏览器使用 iframe，Electron 使用 webview。 */
export enum WebLinkSourceType {
  URL = "url",
  REMOTE = "remote",
  LOCAL = "local",
}

export interface WebviewElement {
  type: "webview";
  url: string;
  height?: number;
  sourceType?: WebLinkSourceType;
  children: Descendant[];
}
