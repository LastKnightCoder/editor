import { Descendant } from "slate";
import { WebLinkSourceType } from "@/types";

export interface WebviewElement {
  type: "webview";
  url: string;
  height?: number;
  sourceType?: WebLinkSourceType;
  children: Descendant[];
}
