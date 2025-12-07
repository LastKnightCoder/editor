import { Descendant } from "slate";

export interface Comment {
  id: string;
  content: string;
  createTime: number;
  updateTime: number;
  replies: Comment[];
}

export interface CommentElement {
  type: "comment";
  comments: Comment[];
  uuid: string;
  openEdit?: boolean;
  children: Descendant[];
}
