import { Descendant } from "slate";
import { IPodcast } from "./podcast";

export interface Project {
  id: number;
  createTime: number;
  updateTime: number;
  title: string;
  children: number[];
  desc: Descendant[];
  archived: boolean;
  pinned: boolean;
}

export type CreateProject = Omit<Project, "id" | "createTime" | "updateTime">;
export type UpdateProject = Omit<Project, "createTime" | "updateTime">;

export enum EProjectItemType {
  Document = "document",
  WhiteBoard = "white-board",
  VideoNote = "video-note",
  WebView = "web-view",
  TableView = "table-view",
  Pdf = "pdf",
}

export interface ProjectItem {
  id: number;
  createTime: number;
  updateTime: number;
  title: string;
  content: Descendant[];
  children: number[];
  parents: number[];
  projects: number[];
  refType: string;
  refId: number;
  projectItemType: EProjectItemType;
  count: number;
  contentId: number;
  whiteBoardContentId: number;
  podcast?: IPodcast;
  tags?: string[];
}

export type CreateProjectItem = Omit<
  ProjectItem,
  "id" | "createTime" | "updateTime" | "contentId" | "projects" | "parents"
> & {
  contentId?: number;
};
export type UpdateProjectItem = Omit<
  ProjectItem,
  "createTime" | "updateTime" | "content" | "count"
>;
