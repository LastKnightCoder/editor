import { FormattedText } from "../text.ts";

export interface InlineImageElement {
  type: "inline-image";
  url: string;
  alt?: string;
  uuid: string;
  width?: number;
  height?: number;
  children: FormattedText[];
}
