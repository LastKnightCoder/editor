import type { WhiteboardSnapshot } from "@tau/whiteboard";

export interface Whiteboard {
  id: number;
  tags: string[];
  whiteBoardContentIds: number[];
  whiteBoardContentList: WhiteboardContent[];
  activeWhiteboardContentId: number | null;
  createTime: number;
  updateTime: number;
  title: string;
  description: string;
  snapshot: string;
}

export type ICreateWhiteboard = Omit<
  Whiteboard,
  | "id"
  | "createTime"
  | "updateTime"
  | "whiteBoardContentIds"
  | "whiteBoardContentList"
  | "activeWhiteboardContentId"
> & {
  whiteBoardContentList: Pick<WhiteboardContent, "data" | "name">[];
};

export interface WhiteboardContent {
  id: number;
  name: string;
  imgUrl: string; // 白板背景图片
  createTime: number;
  updateTime: number;
  data: WhiteboardSnapshot;
}
