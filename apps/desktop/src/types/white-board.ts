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
  activeWhiteBoardContentId: number | null;
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
  | "activeWhiteBoardContentId"
> & {
  whiteBoardContentList: Pick<WhiteBoardContent, "data" | "name">[];
};

export interface WhiteBoardContent {
  id: number;
  name: string;
  imgUrl: string; // 白板背景图片
  createTime: number;
  updateTime: number;
  data: {
    children: BoardElement[];
    viewPort: ViewPort;
    selection: Selection;
    presentationSequences?: PresentationSequence[];
  };
}
