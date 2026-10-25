import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
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

/** 项目打开记录（独立于 Project 实体：写入不改 update_time、不记 operation） */
export interface ProjectOpenState {
  openedAt: number;
  /** 上次停留的文档；从未定位过、已删除或已移出项目时为 null */
  itemId: number | null;
  itemTitle: string | null;
}

export enum EProjectItemType {
  Document = "document",
  WhiteBoard = "white-board",
  VideoNote = "video-note",
  WebView = "web-view",
  TableView = "table-view",
  Pdf = "pdf",
}

export interface ProjectItem {
  contracts?: ContentContractDictionary;
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
