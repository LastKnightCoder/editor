import { CommonElement } from "../plugins";

export interface ImageElement extends CommonElement {
  src: string;
  preserveAspectRatio: string;
}