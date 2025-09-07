import { Descendant } from "slate";

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
}

export type CreateProjectItem = Omit<
  ProjectItem,
  "id" | "createTime" | "updateTime" | "contentId" | "projects" | "parents"
>;
export type UpdateProjectItem = Omit<
  ProjectItem,
  "createTime" | "updateTime" | "content" | "count"
>;
