import { Descendant } from "slate";
import { WhiteBoard } from "./white-board";

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
  whiteBoardData?: WhiteBoard["data"];
  projectItemType: EProjectItemType;
  count: number;
  contentId: number;
}

export type CreateProjectItem = Omit<
  ProjectItem,
  "id" | "createTime" | "updateTime" | "contentId"
>;
export type UpdateProjectItem = Omit<ProjectItem, "createTime" | "updateTime">;
