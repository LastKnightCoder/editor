import type { FormattedText } from "@tau/editor/src";

export interface ContentLinkElement {
  type: "content-link";
  refId: number;
  contentId: number;
  contentType: string;
  contentTitle: string;
  children: FormattedText[];
}
