import { create } from "zustand";
import { persist } from "zustand/middleware";
import { produce } from "immer";
import { CreateProject, Project } from "@/types";

import {
  getProjectList,
  createProject,
  updateProject,
  deleteProject,
  getProjectById,
} from "@/commands";

interface IState {
  projects: Project[];
  loading: boolean;
  dragging: boolean;
  activeProjectItemId: number | null;
  showOutline: boolean;
  readonly: boolean;
  hideProjectItemList: boolean;
  showArchived?: boolean;
}

interface IActions {
  init: () => Promise<void>;
  createProject: (project: CreateProject) => Promise<Project>;
  updateProject: (project: Project) => Promise<Project>;
  deleteProject: (id: number) => Promise<number>;
  // createRootProjectItem: (
  //   projectId: number,
  //   createProjectItem: CreateProjectItem,
  // ) => Promise<ProjectItem | undefined>;
  // createChildProjectItem: (
  //   projectId: number,
  //   parentProjectItemId: number,
  //   createProjectItem: CreateProjectItem,
  // ) => Promise<ProjectItem | undefined>;
  // removeRootProjectItem: (
  //   projectId: number,
  //   projectItemId: number,
  // ) => Promise<void>;
  // removeChildProjectItem: (
  //   parentProjectItemId: number,
  //   projectItemId: number,
  // ) => Promise<void>;
  // tryRemoveFromProject: (
  //   projectItemId: number,
  //   projectId: number,
  // ) => Promise<void>;
  archiveProject: (projectId: number) => Promise<Project | undefined>;
  unarchiveProject: (projectId: number) => Promise<Project | undefined>;
  pinProject: (projectId: number) => Promise<Project | undefined>;
  unpinProject: (projectId: number) => Promise<Project | undefined>;
}

const initState: IState = {
  projects: [],
  loading: false,
  // 是否正在拖拽，如果正在处理拖拽逻辑，阻止自动保存，以防同时操作数据，导致数据错乱
  dragging: false,
  activeProjectItemId: null,
  showOutline: true,
  readonly: false,
  hideProjectItemList: false,
};

const useProjectsStore = create<IState & IActions>()(
  persist(
    (set, get) => ({
      ...initState,
      init: async () => {
        set({
          ...initState,
          loading: true,
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
      // createRootProjectItem: async (projectId, projectItem) => {
      //   const { updateProject } = get();
      //   const project = await getProjectById(projectId);
      //   if (!project) return;
      //   const checkedProjectItem = produce(projectItem, (draft) => {
      //     if (!draft.projects.includes(projectId)) {
      //       draft.projects.push(projectId);
      //     }
      //   });
      //   const res = await createProjectItem(checkedProjectItem);
      //   const newProject = produce(project, (draft) => {
      //     if (!draft.children.includes(res.id)) {
      //       draft.children.push(res.id);
      //     }
      //   });

      //   await updateProject(newProject);

      //   return res;
      // },
      // createChildProjectItem: async (
      //   projectId,
      //   parentProjectItemId,
      //   projectItem,
      // ) => {
      //   const parentProjectItem = await getProjectItemById(parentProjectItemId);
      //   if (!parentProjectItem) return;
      //   const checkedProjectItem = produce(projectItem, (draft) => {
      //     if (!draft.parents.includes(parentProjectItemId)) {
      //       draft.parents.push(parentProjectItemId);
      //     }
      //     if (!draft.projects.includes(projectId)) {
      //       draft.projects.push(projectId);
      //     }
      //     // 子项要继承父的所有 project
      //     for (const id of parentProjectItem.projects) {
      //       if (!draft.projects.includes(id)) {
      //         draft.projects.push(id);
      //       }
      //     }
      //   });
      //   const res = await createProjectItem(checkedProjectItem);
      //   const newParentProjectItem = produce(parentProjectItem, (draft) => {
      //     if (!draft.children.includes(res.id)) {
      //       draft.children.push(res.id);
      //     }
      //   });
      //   await updateProjectItem(newParentProjectItem);

      //   return res;
      // },
      // removeRootProjectItem: async (projectId, projectItemId) => {
      //   const { updateProject, tryRemoveFromProject } = get();
      //   const project = await getProjectById(projectId);
      //   if (!project) return;
      //   const newProject = produce(project, (draft) => {
      //     draft.children = draft.children.filter((id) => id !== projectItemId);
      //   });
      //   await updateProject(newProject);
      //   const projectItem = await getProjectItemById(projectItemId);
      //   if (!projectItem) return;
      //   for (const projectId of projectItem.projects) {
      //     await tryRemoveFromProject(projectItemId, projectId);
      //   }
      // },
      // removeChildProjectItem: async (parentProjectItemId, projectItemId) => {
      //   const { tryRemoveFromProject } = get();
      //   const parentProjectItem = await getProjectItemById(parentProjectItemId);
      //   if (!parentProjectItem) return;
      //   const newParentProjectItem = produce(parentProjectItem, (draft) => {
      //     draft.children = draft.children.filter((id) => id !== projectItemId);
      //   });
      //   await updateProjectItem(newParentProjectItem);

      //   const projectItem = await getProjectItemById(projectItemId);
      //   if (!projectItem) return;
      //   const newProjectItem = produce(projectItem, (draft) => {
      //     draft.parents = draft.parents.filter(
      //       (id) => id !== parentProjectItemId,
      //     );
      //   });
      //   await updateProjectItem(newProjectItem);
      //   for (const projectId of newProjectItem.projects) {
      //     await tryRemoveFromProject(projectItemId, projectId);
      //   }
      // },
      // tryRemoveFromProject: async (
      //   projectItemId: number,
      //   projectId: number,
      // ) => {
      //   // 是否需要将从 projects 移除该项目
      //   // 检查所有 parent 的 project 属性，如果在该项目中，则说明还有其它相同文档在该项目中
      //   const projectItem = await getProjectItemById(projectItemId);
      //   if (!projectItem) return;
      //   const parentIds = projectItem.parents;
      //   let inProject = false;
      //   for (const parentId of parentIds) {
      //     const parentProjectItem = await getProjectItemById(parentId);
      //     if (!parentProjectItem) continue;
      //     const parentProjects = parentProjectItem.projects;
      //     if (parentProjects.includes(projectId)) {
      //       inProject = true;
      //       break;
      //     }
      //   }
      //   if (!inProject) {
      //     const newProjectItem = produce(projectItem, (draft) => {
      //       draft.projects = draft.projects.filter((id) => id !== projectId);
      //     });
      //     await updateProjectItem(newProjectItem);
      //   }
      // },
      archiveProject: async (projectId: number) => {
        const { updateProject } = get();
        const project = await getProjectById(projectId);
        if (!project) return;
        const newProject = produce(project, (draft) => {
          draft.archived = true;
        });
        return updateProject(newProject);
      },
      unarchiveProject: async (projectId: number) => {
        const { updateProject } = get();
        const project = await getProjectById(projectId);
        if (!project) return;
        const newProject = produce(project, (draft) => {
          draft.archived = false;
        });
        return updateProject(newProject);
      },
      pinProject: async (projectId: number) => {
        const { updateProject } = get();
        const project = await getProjectById(projectId);
        if (!project) return;
        const newProject = produce(project, (draft) => {
          draft.pinned = true;
        });
        return updateProject(newProject);
      },
      unpinProject: async (projectId: number) => {
        const { updateProject } = get();
        const project = await getProjectById(projectId);
        if (!project) return;
        const newProject = produce(project, (draft) => {
          draft.pinned = false;
        });
        return updateProject(newProject);
      },
    }),
    {
      name: "projects",
      partialize: (state) => ({
        showArchived: state.showArchived,
      }),
    },
  ),
);

export default useProjectsStore;
