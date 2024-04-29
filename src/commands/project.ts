import { invoke } from "@tauri-apps/api";
import { Project, ProjectItem, CreateProject, CreateProjectItem } from '@/types';

const transformProject = (project: any): Project => {
  return {
    ...project,
    desc: JSON.parse(project.desc),
    createTime: project.create_time,
    updateTime: project.update_time,
  }
}

const transformProjectItem = (projectItem: any): ProjectItem => {
  return {
    ...projectItem,
    content: JSON.parse(projectItem.content),
    refType: projectItem.ref_type,
    refId: projectItem.ref_id,
    createTime: projectItem.create_time,
    updateTime: projectItem.update_time,
  }
}

export const createProject = async (createProject: CreateProject): Promise<Project> => {
  const res: any = await invoke('create_project', {
    ...createProject,
    desc: JSON.stringify(createProject.desc),
  });
  return transformProject(res);
}

export const deleteProject = async (id: number): Promise<number> => {
  return await invoke('delete_project', {
    id
  });
}

export const updateProject = async (project: Project): Promise<Project> => {
  const res: any = await invoke('update_project', {
    ...project,
    desc: JSON.stringify(project.desc),
  });
  return transformProject(res);
}

export const getProjectList = async (): Promise<Project[]> => {
  const list: any[] = await invoke('get_project_list');
  return list.map(transformProject);
}

export const getProjectById = async (id: number): Promise<Project> => {
  const project: any =  await invoke('get_project_by_id', {
    id
  });

  return transformProject(project);
}

export const createProjectItem = async (projectItem: CreateProjectItem): Promise<ProjectItem> => {
  const res: any = await invoke('create_project_item', {
    ...projectItem,
    content: JSON.stringify(projectItem.content),
  });

  return transformProjectItem(res);
}

export const updateProjectItem = async (projectItem: ProjectItem): Promise<ProjectItem> => {
  const res: any = await invoke('update_project_item', {
    ...projectItem,
    content: JSON.stringify(projectItem.content),
  });
  return transformProjectItem(res);
}

export const deleteProjectItem = async (id: number): Promise<number> => {
  return await invoke('delete_project_item', {
    id
  });
}

export const getProjectItemById = async (id: number): Promise<ProjectItem> => {
  const projectItem: any = await invoke('get_project_item_by_id', {
    id
  });

  return transformProjectItem(projectItem);
}

export const getProjectItemByRef = async (refType: string, refId: number): Promise<ProjectItem[]> => {
  const list: any[] = await invoke('get_project_item_by_ref', {
    refType,
    refId
  });

  return list.map(transformProjectItem);
}

export const getAllProjectItemsNotInProject = async (projectId: number): Promise<ProjectItem[]> => {
  const list: any[] = await invoke('get_all_project_items_not_in_project', {
    projectId
  });

  return list.map(transformProjectItem);
}

export const deleteAllProjectItemsNotInProject = async (projectId: number): Promise<number> => {
  return await invoke('delete_all_project_items_not_in_project', {
    projectId
  });
}

export const isProjectItemNotInAnyProject = async (id: number): Promise<boolean> => {
  return await invoke('is_project_item_not_in_any_project', {
    id
  });
}

export const getProjectItemsNotInAnyProject = async (): Promise<ProjectItem[]> => {
  const list: any[] = await invoke('get_project_items_not_in_any_project');
  return list.map(transformProjectItem);
}

export const deleteProjectItemsNotInAnyProject = async (): Promise<number> => {
  return await invoke('delete_project_items_not_in_any_project');
}