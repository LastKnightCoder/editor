import type { FormattedText } from "../text";

export interface AnnotationElement {
  type: "annotation";
  content: string;
  children: FormattedText[];
}
