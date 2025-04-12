import {
  BoardElement,
  ViewPort,
  Selection,
  PresentationSequence,
} from "@/components/WhiteBoard";

export interface WhiteBoard {
  id: number;
  tags: string[];
  whiteBoardContentIds: number[];
  whiteBoardContentList: WhiteBoardContent[];
  createTime: number;
  updateTime: number;
  title: string;
  description: string;
  snapshot: string;
}

export type ICreateWhiteBoard = Omit<
  WhiteBoard,
  | "id"
  | "createTime"
  | "updateTime"
  | "whiteBoardContentIds"
  | "whiteBoardContentList"
> & {
  whiteBoardContentList: Pick<WhiteBoardContent, "data" | "name">[];
};

export interface WhiteBoardContent {
  id: number;
  name: string;
  createTime: number;
  updateTime: number;
  data: {
    children: BoardElement[];
    viewPort: ViewPort;
    selection: Selection;
    presentationSequences?: PresentationSequence[];
  };
}
