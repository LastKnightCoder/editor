import ReactDOM from "react-dom/client";
import { EHighlightColor, EHighlightTextStyle, EHighlightType } from './constants';
import { Descendant } from "slate";

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface RectWithPageNumber extends Rect{
  pageNumber: number;
}

export interface RectPercent {
  top: string;
  left: string;
  width: string;
  height: string;
}

export interface RectPercentWithPageNumber extends RectPercent {
  pageNum: number;
}

export interface Highlight {
  pageNumber: number;
  boundingClientRect: RectPercentWithPageNumber;
  rects: RectPercentWithPageNumber[];
  color: EHighlightColor;
  id: string;
  type: EHighlightType;
  highlightTextStyle: EHighlightTextStyle;
  notes: Array<Note>;
}

export interface HighlightLayer {
  pageNumber: number;
  root: ReactDOM.Root;
  container: HTMLDivElement;
}

export interface Note {
  id: string;
  note: Descendant[];
}
