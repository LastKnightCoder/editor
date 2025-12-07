import { CommonElement } from "../plugins";
import {
  EDescriptionPosition,
  EDescriptionAlignment,
} from "../constants/image";

export interface ImageElement extends CommonElement {
  src: string;
  showDescription?: boolean;
  description?: string;
  descriptionPosition?: EDescriptionPosition;
  descriptionAlignment?: EDescriptionAlignment;
  descriptionStyle?: {
    backgroundColor?: string;
    borderColor?: string;
    color?: string;
    fontSize?: number;
  };
}
