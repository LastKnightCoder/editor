import { create } from "zustand";
import { persist } from "zustand/middleware";
import { IResource, ResourceGroup, ResourceType } from "@/types";
import {
  getAllResources,
  getAllResourceGroups,
  createResourceGroup,
  updateResourceGroup,
  deleteResourceGroup,
  moveResourceToGroup,
  updateResourceName,
} from "@/commands";
import { produce } from "immer";

export enum EStatus {
  UN_INIT,
  LOADING,
  SUCCESS,
  FAIL,
}

// 系统过滤器类型
export type SystemFilterType =
  | { type: "all" }
  | { type: "type"; resourceType: ResourceType }
  | {
      type: "type-source";
      resourceType: ResourceType;
      sourceType: "content" | "whiteboard" | "podcast";
    };

interface IState {
  resources: IResource[];
  groups: ResourceGroup[];
  status: EStatus;
  selectedResourceId: number | null;
  selectedGroupId: number | null;
  selectedSystemFilter: SystemFilterType | null;
  searchKeyword: string;
  // 展开状态
  expandedSystemGroups: string[];
  expandedUserGroups: number[];
  expandedUngrouped: boolean;
}

interface IAction {
  initResources: () => Promise<void>;
  initResourceGroups: () => Promise<void>;
  createResourceGroup: (
    name: string,
    parentId?: number | null,
  ) => Promise<ResourceGroup>;
  updateResourceGroup: (id: number, name: string) => Promise<ResourceGroup>;
  deleteResourceGroup: (id: number) => Promise<number>;
  moveResourceToGroup: (
    resourceId: number,
    groupId: number | null,
  ) => Promise<IResource>;
  updateResourceName: (id: number, name: string) => Promise<void>;
  setSelectedResource: (id: number | null) => void;
  setSelectedGroup: (id: number | null) => void;
  setSelectedSystemFilter: (filter: SystemFilterType | null) => void;
  setSearchKeyword: (keyword: string) => void;
  refreshResources: () => Promise<void>;
  // 展开状态管理
  toggleSystemGroup: (groupKey: string) => void;
  toggleUserGroup: (groupId: number) => void;
  setExpandedUngrouped: (expanded: boolean) => void;
}

const useResourceStore = create<IState & IAction>()(
  persist(
    (set, get) => ({
      resources: [] as IResource[],
      groups: [] as ResourceGroup[],
      status: EStatus.UN_INIT,
      selectedResourceId: null,
      selectedGroupId: null,
      selectedSystemFilter: null,
      searchKeyword: "",
      expandedSystemGroups: [],
      expandedUserGroups: [],
      expandedUngrouped: true,

      initResources: async () => {
        set({ status: EStatus.LOADING });
        try {
          const resources = await getAllResources();
          set({ resources, status: EStatus.SUCCESS });
        } catch (error) {
          set({ status: EStatus.FAIL });
          throw error;
        }
      },

      initResourceGroups: async () => {
        const groups = await getAllResourceGroups();
        set({ groups });
      },

      createResourceGroup: async (name, parentId) => {
        const { groups } = get();
        const createdGroup = await createResourceGroup({ name, parentId });
        const newGroups = produce(groups, (draft) => {
          draft.push(createdGroup);
        });
        set({ groups: newGroups });
        return createdGroup;
      },

      updateResourceGroup: async (id, name) => {
        const { groups } = get();
        const updatedGroup = await updateResourceGroup({ id, name });
        const newGroups = produce(groups, (draft) => {
          const index = draft.findIndex((g) => g.id === id);
          if (index !== -1) {
            draft[index] = updatedGroup;
          }
        });
        set({ groups: newGroups });
        return updatedGroup;
      },

      deleteResourceGroup: async (id) => {
        const { groups } = get();
        const res = await deleteResourceGroup(id);
        const newGroups = produce(groups, (draft) => {
          const index = draft.findIndex((g) => g.id === id);
          if (index !== -1) {
            draft.splice(index, 1);
          }
        });
        set({ groups: newGroups });
        return res;
      },

      moveResourceToGroup: async (resourceId, groupId) => {
        const { resources } = get();
        const result = await moveResourceToGroup(resourceId, groupId);

        const newResources = produce(resources, (draft) => {
          const index = draft.findIndex((r) => r.id === resourceId);
          if (index !== -1) {
            draft[index] = result;
          }
        });
        set({ resources: newResources });
        return result;
      },

      updateResourceName: async (id, name) => {
        const { resources } = get();
        const result = await updateResourceName(id, name);

        if (result) {
          const newResources = produce(resources, (draft) => {
            const index = draft.findIndex((r) => r.id === id);
            if (index !== -1) {
              draft[index] = result;
            }
          });
          set({ resources: newResources });
        }
      },

      setSelectedResource: (id) => {
        set({
          selectedResourceId: id,
          selectedGroupId: null,
          selectedSystemFilter: null,
        });
      },

      setSelectedGroup: (id) => {
        set({
          selectedGroupId: id,
          selectedResourceId: null,
          selectedSystemFilter: null,
        });
      },

      setSelectedSystemFilter: (filter) => {
        set({
          selectedSystemFilter: filter,
          selectedResourceId: null,
          selectedGroupId: null,
        });
      },

      setSearchKeyword: (keyword) => {
        set({ searchKeyword: keyword });
      },

      refreshResources: async () => {
        const resources = await getAllResources();
        set({ resources });
      },

      // 展开状态管理
      toggleSystemGroup: (groupKey) => {
        const { expandedSystemGroups } = get();
        const newExpanded = expandedSystemGroups.includes(groupKey)
          ? expandedSystemGroups.filter((key) => key !== groupKey)
          : [...expandedSystemGroups, groupKey];
        set({ expandedSystemGroups: newExpanded });
      },

      toggleUserGroup: (groupId) => {
        const { expandedUserGroups } = get();
        const newExpanded = expandedUserGroups.includes(groupId)
          ? expandedUserGroups.filter((id) => id !== groupId)
          : [...expandedUserGroups, groupId];
        set({ expandedUserGroups: newExpanded });
      },

      setExpandedUngrouped: (expanded) => {
        set({ expandedUngrouped: expanded });
      },
    }),
    {
      name: "resource-store",
      partialize: (state) => ({
        expandedSystemGroups: state.expandedSystemGroups,
        expandedUserGroups: state.expandedUserGroups,
        expandedUngrouped: state.expandedUngrouped,
      }),
    },
  ),
);

export default useResourceStore;
