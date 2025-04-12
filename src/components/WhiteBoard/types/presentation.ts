import { ViewPort } from "./viewport";

export interface PresentationFrame {
  id: string;
  viewPort: ViewPort;
  elements: string[]; // 存储元素的ID
}

export interface PresentationSequence {
  id: string;
  name: string;
  frames: PresentationFrame[];
  createTime: number;
  updateTime: number;
}
