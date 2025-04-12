import { Descendant } from "slate";

export interface WhiteboardElement {
  type: "whiteboard";
  id: string;
  height: number;
  children: Descendant[];
  whiteBoardContentId: number;
}
