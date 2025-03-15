import { CommonElement } from "../plugins";
import {
  EDescriptionPosition,
  EDescriptionAlignment,
} from "../constants/image";

export interface ImageElement extends CommonElement {
  src: string;
  description?: string;
  descriptionPosition?: EDescriptionPosition;
  descriptionAlignment?: EDescriptionAlignment;
  descriptionStyle?: {
    color?: string;
    fontSize?: number;
  };
}
