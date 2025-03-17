import { BoardElement, ViewPort, Selection } from "@/components/WhiteBoard";
import type { PresentationSequence } from "@/components/WhiteBoard/utils/PresentationManager";

export interface WhiteBoard {
  id: number;
  tags: string[];
  data: {
    children: BoardElement[];
    viewPort: ViewPort;
    selection: Selection;
    presentationSequences?: PresentationSequence[];
  };
  createTime: number;
  updateTime: number;
  title: string;
  description: string;
  snapshot: string;
  isProjectItem: boolean;
}
