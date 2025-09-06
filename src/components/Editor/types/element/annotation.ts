import { FormattedText } from "../text.ts";

export interface AnnotationElement {
  type: "annotation";
  content: string;
  children: FormattedText[];
}
