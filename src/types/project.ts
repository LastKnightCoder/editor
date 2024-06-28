import { Descendant } from "slate";

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
}

export type CreateProjectItem = Omit<ProjectItem, 'id' | 'createTime' | 'updateTime'>;
