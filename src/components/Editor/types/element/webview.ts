import { Descendant } from "slate";

export interface WebviewElement {
  type: "webview";
  url: string;
  height?: number;
  children: Descendant[];
}
