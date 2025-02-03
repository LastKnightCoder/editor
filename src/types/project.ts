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
}

export type CreateProject = Omit<Project, 'id' | 'createTime' | 'updateTime'>
export type UpdateProject = Omit<Project, 'createTime' | 'updateTime'>

export enum EProjectItemType {
  Document = 'document',
  WhiteBoard = 'white-board',
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
  whiteBoardData?: WhiteBoard['data'];
  projectItemType: EProjectItemType;
}

export type CreateProjectItem = Omit<ProjectItem, 'id' | 'createTime' | 'updateTime'>;
export type UpdateProjectItem = Omit<ProjectItem, 'createTime' | 'updateTime'>;
