import { type FormattedText } from "@tau/markdown/model";

export interface AnnotationElement {
  type: "annotation";
  content: string;
  children: FormattedText[];
}
