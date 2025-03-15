import { BoardElement, ViewPort, Selection } from "@/components/WhiteBoard";
import { Descendant } from "slate";

export interface WhiteboardElement {
  type: "whiteboard";
  id: string;
  height: number;
  children: Descendant[];
  data: {
    children: BoardElement[];
    viewPort: ViewPort;
    selection: Selection;
  };
}
