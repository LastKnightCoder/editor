import { CommonElement } from "../plugins";
import {
  EDescriptionPosition,
  EDescriptionAlignment,
} from "../constants/image";
import { EShadowSize } from "../constants/shadow";

export interface ImageElement extends CommonElement {
  src: string;
  // 图片的自然宽高，用于在 Column 等容器中保持宽高比
  naturalWidth?: number;
  naturalHeight?: number;
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
  shadowSize?: EShadowSize;
}
