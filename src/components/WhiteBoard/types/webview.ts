import { CommonElement } from "../plugins";
import { WebLinkSourceType } from "@/types";

export interface WebviewElement extends CommonElement {
  url: string;
  sourceType?: WebLinkSourceType;
}
