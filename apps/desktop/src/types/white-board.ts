import type { WhiteboardSnapshot } from "@tau/whiteboard";

export interface Whiteboard {
  id: number;
  /** 详情查询返回整块白板拥有的文档身份。 */
  documentId?: string;
  tags: string[];
  whiteboardContentIds: number[];
  whiteboardContentList: WhiteboardContent[];
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
  | "documentId"
  | "createTime"
  | "updateTime"
  | "whiteboardContentIds"
  | "whiteboardContentList"
  | "activeWhiteboardContentId"
> & {
  whiteboardContentList: Pick<WhiteboardContent, "data" | "name">[];
};

export interface WhiteboardContent {
  id: number;
  name: string;
  imgUrl: string; // 白板背景图片
  createTime: number;
  updateTime: number;
  data: WhiteboardSnapshot;
}
