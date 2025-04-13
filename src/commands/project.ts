import { invoke } from "@/electron";
import {
  Project,
  ProjectItem,
  CreateProject,
  UpdateProject,
  CreateProjectItem,
  UpdateProjectItem,
} from "@/types/project";

export const createProject = async (
  project: CreateProject,
): Promise<Project> => {
  return await invoke("create-project", project);
};

export const updateProject = async (
  project: UpdateProject,
): Promise<Project> => {
  return await invoke("update-project", project);
};

export const deleteProject = async (id: number): Promise<number> => {
  return await invoke("delete-project", id);
};

export const getProjectById = async (id: number): Promise<Project> => {
  return await invoke("get-project", id);
};

export const getProjectList = async (): Promise<Project[]> => {
  return await invoke("get-all-projects");
};

export const updateProjectItem = async (
  item: UpdateProjectItem,
): Promise<ProjectItem | null> => {
  return await invoke("update-project-item", item);
};

export const deleteProjectItem = async (id: number): Promise<number> => {
  return await invoke("delete-project-item", id);
};

export const getProjectItemById = async (
  id: number,
): Promise<ProjectItem | null> => {
  return await invoke("get-project-item", id);
};

export const getProjectItemsByIds = async (
  ids: number[],
): Promise<ProjectItem[]> => {
  return await invoke("get-project-items-by-ids", ids);
};

export const getProjectItemByRef = async (
  refType: string,
  refId: number,
): Promise<ProjectItem[]> => {
  return await invoke("get-project-item-by-ref", refType, refId);
};

export const getProjectItemCountInProject = async (
  projectId: number,
): Promise<number> => {
  return await invoke("get-project-item-count-in-project", projectId);
};

export const getAllProjectItemsNotInProject = async (
  projectId: number,
): Promise<ProjectItem[]> => {
  return await invoke("get-all-project-items-not-in-project", projectId);
};

export const isProjectItemNotInAnyProject = async (
  id: number,
): Promise<boolean> => {
  return await invoke("is-project-item-not-in-any-project", id);
};

export const getProjectItemsNotInAnyProject = async (): Promise<
  ProjectItem[]
> => {
  return await invoke("get-project-items-not-in-any-project");
};

export const deleteProjectItemsNotInAnyProject = async (): Promise<number> => {
  return await invoke("delete-project-items-not-in-any-project");
};

export const getAllProjectItems = async (): Promise<ProjectItem[]> => {
  return await invoke("get-all-project-items");
};

export const addRootProjectItem = async (
  projectId: number,
  projectItem: CreateProjectItem,
): Promise<[Project, ProjectItem | null]> => {
  return await invoke("add-root-project-item", projectId, projectItem);
};

export const addChildProjectItem = async (
  parentProjectItemId: number,
  projectItem: CreateProjectItem,
): Promise<[ProjectItem | null, ProjectItem | null]> => {
  return await invoke(
    "add-child-project-item",
    parentProjectItemId,
    projectItem,
  );
};

export const addRefRootProjectItem = async (
  projectId: number,
  projectItemId: number,
): Promise<[Project, ProjectItem | null]> => {
  return await invoke("add-ref-root-project-item", projectId, projectItemId);
};

export const addRefChildProjectItem = async (
  parentProjectItemId: number,
  projectItemId: number,
): Promise<[ProjectItem | null, ProjectItem | null]> => {
  return await invoke(
    "add-ref-child-project-item",
    parentProjectItemId,
    projectItemId,
  );
};

export const removeRootProjectItem = async (
  projectId: number,
  projectItemId: number,
  notDelete?: boolean,
): Promise<[Project, ProjectItem | null]> => {
  return await invoke(
    "remove-root-project-item",
    projectId,
    projectItemId,
    notDelete,
  );
};

export const removeChildProjectItem = async (
  projectId: number,
  parentProjectItemId: number,
  projectItemId: number,
  notDelete?: boolean,
): Promise<[ProjectItem | null, ProjectItem | null]> => {
  return await invoke(
    "remove-child-project-item",
    projectId,
    parentProjectItemId,
    projectItemId,
    notDelete,
  );
};

export const openProjectItemInNewWindow = (
  databaseName: string,
  projectItemId: number,
) => {
  return invoke(
    "open-project-item-in-new-window",
    databaseName,
    projectItemId,
    {
      showTitlebar: true,
      isDefaultTop: true,
    },
  );
};
