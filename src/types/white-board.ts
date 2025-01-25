import { BoardElement, ViewPort, Selection } from "@/components/WhiteBoard";

export interface WhiteBoard {
  id: number;
  tags: string[];
  data: {
    children: BoardElement[];
    viewPort: ViewPort,
    selection: Selection
  };
  createTime: number;
  updateTime: number;
  title: string;
  description: string;
  snapshot: string;
}
