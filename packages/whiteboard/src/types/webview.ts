import { CommonElement } from "../plugins";
import type { WebLinkSourceType } from "@tau/shared/media-types";
export type { WebLinkSourceType } from "@tau/shared/media-types";

export interface WebviewElement extends CommonElement {
  url: string;
  sourceType?: WebLinkSourceType;
}
