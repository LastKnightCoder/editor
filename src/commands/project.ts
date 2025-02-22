import { invoke } from '@/electron';
import {
  Project,
  ProjectItem,
  CreateProject,
  UpdateProject,
  CreateProjectItem,
  UpdateProjectItem
} from '@/types/project';
import { WhiteBoard } from "@/types";

export const createProject = async (project: CreateProject): Promise<Project> => {
  return await invoke('create-project', project);
}

export const updateProject = async (project: UpdateProject): Promise<Project> => {
  return await invoke('update-project', project);
}

export const deleteProject = async (id: number): Promise<number> => {
  return await invoke('delete-project', id);
}

export const getProjectById = async (id: number): Promise<Project> => {
  return await invoke('get-project', id);
}

export const getProjectList = async (): Promise<Project[]> => {
  return await invoke('get-all-projects');
}

export const createProjectItem = async (item: CreateProjectItem): Promise<ProjectItem> => {
  return await invoke('create-project-item', item);
}

export const updateProjectItem = async (item: UpdateProjectItem): Promise<ProjectItem> => {
  return await invoke('update-project-item', item);
}

export const partialUpdateProjectItem = async (item: Partial<UpdateProjectItem> & { id: number }): Promise<ProjectItem> => {
  return await invoke('partial-update-project-item', item);
}

export const updateProjectItemWhiteBoardData = async (id: number, whiteBoardData: WhiteBoard['data']): Promise<ProjectItem> => {
  return await invoke('update-project-item-whiteboard-data', id, whiteBoardData);
}

export const updateProjectItemContent = async (id: number, content: ProjectItem['content']): Promise<ProjectItem> => {
  return await invoke('update-project-item-content', id, content);
}

export const deleteProjectItem = async (id: number): Promise<number> => {
  return await invoke('delete-project-item', id);
}

export const getProjectItemById = async (id: number): Promise<ProjectItem> => {
  return await invoke('get-project-item', id);
}

export const getProjectItemsByIds = async (ids: number[]): Promise<ProjectItem[]> => {
  return await invoke('get-project-items-by-ids', ids);
}

export const getProjectItemByRef = async (refType: string, refId: number): Promise<ProjectItem[]> => {
  return await invoke('get-project-item-by-ref', refType, refId);
}

export const getProjectItemCountInProject = async (projectId: number): Promise<number> => {
  return await invoke('get-project-item-count-in-project', projectId);
}

export const getAllProjectItemsNotInProject = async (projectId: number): Promise<ProjectItem[]> => {
  return await invoke('get-all-project-items-not-in-project', projectId);
}

export const isProjectItemNotInAnyProject = async (id: number): Promise<boolean> => {
  return await invoke('is-project-item-not-in-any-project', id);
}

export const getProjectItemsNotInAnyProject = async (): Promise<ProjectItem[]> => {
  return await invoke('get-project-items-not-in-any-project');
}

export const deleteProjectItemsNotInAnyProject = async (): Promise<number> => {
  return await invoke('delete-project-items-not-in-any-project');
}

export const getAllProjectItems = async (): Promise<ProjectItem[]> => {
  return await invoke('get-all-project-items');
}
