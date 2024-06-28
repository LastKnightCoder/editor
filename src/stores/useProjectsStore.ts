import { create } from 'zustand';
import { produce } from 'immer';
import { CreateProject, CreateProjectItem, Project, ProjectItem } from "@/types";

import {
  getProjectList,
  createProject,
  updateProject,
  deleteProject,
  createProjectItem,
  updateProjectItem,
  getProjectItemById,
} from '@/commands';

interface IState {
  projects: Project[];
  loading: boolean;
  dragging: boolean;
  activeProjectId: number | null;
  activeProjectItemId: number | null;
  showOutline: boolean;
  readonly: boolean;
}

interface IActions {
  init: () => Promise<void>;
  createProject: (project: CreateProject) => Promise<Project>;
  updateProject: (project: Project) => Promise<Project>;
  deleteProject: (id: number) => Promise<number>;
  createRootProjectItem: (projectId: number, createProjectItem: CreateProjectItem) => Promise<ProjectItem | undefined>;
  createChildProjectItem: (parentProjectItemId: number, createProjectItem: CreateProjectItem) => Promise<ProjectItem | undefined>;
  removeRootProjectItem: (projectId: number, projectItemId: number) => Promise<void>;
  removeChildProjectItem: (parentProjectItemId: number, projectItemId: number) => Promise<void>;
  tryRemoveFromProject: (projectItemId: number, projectId: number) => Promise<void>;
  archiveProject: (projectId: number) => Promise<Project | undefined>;
}

const initState: IState = {
  projects: [],
  loading: false,
  // 是否正在拖拽，如果正在处理拖拽逻辑，阻止自动保存，以防同时操作数据，导致数据错乱
  dragging: false,
  activeProjectId: null,
  activeProjectItemId: null,
  showOutline: true,
  readonly: false,
}

const useProjectsStore = create<IState & IActions>((set, get) => ({
  ...initState,
  init: async () => {
    set({
      ...initState,
      loading: true
    });
    const projects = await getProjectList();
    set({ projects, loading: false });
  },
  createProject: async (project) => {
    const res = await createProject(project);
    const projects = await getProjectList();
    set({ projects });
    return res;
  },
  updateProject: async (project) => {
    const res = await updateProject(project);
    const projects = await getProjectList();
    set({ projects });
    return res;
  },
  deleteProject: async (id) => {
    const res = await deleteProject(id);
    const projects = await getProjectList();
    set({ projects });
    return res;
  },
  createRootProjectItem: async (projectId, projectItem) => {
    const { projects, updateProject } = get();
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    const checkedProjectItem = produce(projectItem, (draft) => {
      if (!draft.projects.includes(projectId)) {
        draft.projects.push(projectId);
      }
    });
    const res = await createProjectItem(checkedProjectItem);
    const newProject = produce(project, (draft) => {
      if (!draft.children.includes(res.id)) {
        draft.children.push(res.id);
      }
    });

    await updateProject(newProject);

    return res;
  },
  createChildProjectItem: async (parentProjectItemId, projectItem) => {
    const { activeProjectId }  = get();
    if (!activeProjectId) return;
    const parentProjectItem = await getProjectItemById(parentProjectItemId);
    if (!parentProjectItem) return;
    const checkedProjectItem = produce(projectItem, (draft) => {
      if (!draft.parents.includes(parentProjectItemId)) {
        draft.parents.push(parentProjectItemId);
      }
      if (!draft.projects.includes(activeProjectId)) {
        draft.projects.push(activeProjectId);
      }
      // 子项要继承父的所有 project
      for (const id of parentProjectItem.projects) {
        if (!draft.projects.includes(id)) {
          draft.projects.push(id);
        }
      }
    });
    const res = await createProjectItem(checkedProjectItem);
    const newParentProjectItem = produce(parentProjectItem, (draft) => {
      if (!draft.children.includes(res.id)) {
        draft.children.push(res.id);
      }
    });
    await updateProjectItem(newParentProjectItem);

    return res;
  },
  removeRootProjectItem: async (projectId, projectItemId) => {
    const { projects, updateProject, tryRemoveFromProject } = get();
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    const newProject = produce(project, (draft) => {
      draft.children = draft.children.filter((id) => id !== projectItemId);
    });
    await updateProject(newProject);
    const projectItem = await getProjectItemById(projectItemId);
    if (!projectItem) return;
    for (const projectId of projectItem.projects) {
      await tryRemoveFromProject(projectItemId, projectId);
    }
  },
  removeChildProjectItem: async (parentProjectItemId, projectItemId) => {
    const { tryRemoveFromProject } = get();
    const parentProjectItem = await getProjectItemById(parentProjectItemId);
    if (!parentProjectItem) return;
    const newParentProjectItem = produce(parentProjectItem, (draft) => {
      draft.children = draft.children.filter((id) => id !== projectItemId);
    });
    await updateProjectItem(newParentProjectItem);

    const projectItem = await getProjectItemById(projectItemId);
    if (!projectItem) return;
    const newProjectItem = produce(projectItem, (draft) => {
      // parent 去掉 parentProjectItemId
      draft.parents = draft.parents.filter((id) => id !== parentProjectItemId);
    });
    await updateProjectItem(newProjectItem);
    for (const projectId of newProjectItem.projects) {
      await tryRemoveFromProject(projectItemId, projectId);
    }
  },
  tryRemoveFromProject: async (projectItemId: number, projectId: number) => {
    // 是否需要将从 projects 移除该项目
    // 检查所有 parent 的 project 属性，如果在该项目中，则说明还有其它相同文档在该项目中
    const projectItem = await getProjectItemById(projectItemId);
    if (!projectItem) return;
    const parentIds = projectItem.parents;
    let inProject = false;
    for (const parentId of parentIds) {
      const parentProjectItem = await getProjectItemById(parentId);
      if (!parentProjectItem) continue;
      const parentProjects = parentProjectItem.projects;
      if (parentProjects.includes(projectId)) {
        inProject = true;
        break;
      }
    }
    if (!inProject) {
      const newProjectItem = produce(projectItem, (draft) => {
        draft.projects = draft.projects.filter((id) => id !== projectId);
      });
      await updateProjectItem(newProjectItem);
    }
  },
  archiveProject: async (projectId: number) => {
    const { projects, updateProject } = get();
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    const newProject = produce(project, (draft) => {
      draft.archived = true;
    });
    return updateProject(newProject);
  },
}));

export default useProjectsStore;
