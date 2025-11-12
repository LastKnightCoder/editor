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
  showArchived?: boolean;
}

interface IActions {
  init: () => Promise<void>;
  createProject: (project: CreateProject) => Promise<Project>;
  updateProject: (project: Project) => Promise<Project>;
  deleteProject: (id: number) => Promise<number>;
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
