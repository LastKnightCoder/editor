export interface PresentationFrame {
  id: string;
  elements: string[]; // 存储元素的ID
}

export interface PresentationSequence {
  id: string;
  name: string;
  frames: PresentationFrame[];
  createTime: number;
  updateTime: number;
}
