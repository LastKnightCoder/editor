import type { FormattedText } from "@tau/editor";

export interface ContentLinkElement {
  type: "content-link";
  refId: number;
  contentId: number;
  contentType: string;
  contentTitle: string;
  children: FormattedText[];
}
