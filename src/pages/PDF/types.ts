import ReactDOM from "react-dom/client";
import { EHighlightColor, EHighlightTextStyle, EHighlightType } from './constants';
import { Descendant } from "slate";

export interface LTWH {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LTWHP extends LTWH {
  pageNumber?: number;
}

export interface Highlight {
  pageNumber: number;
  boundingClientRect: {
    top: string;
    left: string;
    width: string;
    height: string;
  },
  rects: Array<{
    top: string;
    left: string;
    width: string;
    height: string;
  }>
  color: EHighlightColor;
  id: string;
  type: EHighlightType;
  highlightTextStyle: EHighlightTextStyle;
  notes: Array<{
    id: string;
    note: Descendant[];
  }>;
}

export interface HighlightLayer {
  pageNumber: number;
  root: ReactDOM.Root;
  container: HTMLDivElement;
}