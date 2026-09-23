import { useMemoizedFn } from "ahooks";
import { message } from "antd";

import { RemoteEpubSelectResult } from "@/components/RemoteEpubSelectModal";
import {
  CreateProjectItem,
  EProjectItemType,
  Project as IProject,
  type ProjectItem as IProjectItem,
  Epub,
} from "@/types";
import { ModalKey } from "../constants/modalKeys";
import useEpubsStore from "@/stores/useEpubsStore";

export interface EpubAddStrategy {
  addProjectItem: (createItem: CreateProjectItem) => Promise<void>;
}

export interface UseEpubHandlersOptions {
  closeModal: (key: ModalKey) => void;
  strategy: EpubAddStrategy;
}

export interface RootEpubStrategyConfig {
  project: IProject | null;
  addRootProjectItem: (
    projectId: number,
    createItem: CreateProjectItem
  ) => Promise<[IProject, IProjectItem | null]>;
  setProject: (project: IProject) => void;
  navigateTo: (tabType: string, params: { id: number; itemId?: number }, title?: string) => void;
}

export interface ChildEpubStrategyConfig {
  projectItem: IProjectItem | undefined;
  projectId: number | undefined;
  addChildProjectItem: (
    parentId: number,
    createItem: CreateProjectItem
  ) => Promise<[IProjectItem | null, IProjectItem | null]>;
  setProjectItem: (projectItem: IProjectItem) => void;
  projectItemEventBus: {
    publishProjectItemEvent: (event: string, item: IProjectItem) => void;
  };
}

export const createRootEpubStrategy = (config: RootEpubStrategyConfig): EpubAddStrategy => ({
  addProjectItem: async createItem => {
    if (!config.project) {
      message.error("项目尚未加载完成");
      return;
    }

    const [newProject, projectItem] = await config.addRootProjectItem(
      config.project.id,
      createItem
    );

    if (projectItem) {
      config.navigateTo(
        "project-detail",
        {
          id: newProject.id,
          itemId: projectItem.id,
        },
        `项目 - ${projectItem.title || `#${projectItem.id}`}`
      );
    }
    config.setProject(newProject);
  },
});

export const createChildEpubStrategy = (config: ChildEpubStrategyConfig): EpubAddStrategy => ({
  addProjectItem: async createItem => {
    if (!config.projectItem || !config.projectId) {
      message.error("项目文档尚未加载完成");
      return;
    }

    const [parentProjectItem] = await config.addChildProjectItem(config.projectItem.id, createItem);

    if (parentProjectItem) {
      config.setProjectItem(parentProjectItem);
      config.projectItemEventBus.publishProjectItemEvent("project-item:updated", parentProjectItem);
    }
  },
});

export const createProjectItemFromEpub = (epub: Epub): CreateProjectItem => ({
  title: epub.title || epub.fileName,
  content: [],
  children: [],
  refType: "epub",
  refId: epub.id,
  projectItemType: EProjectItemType.Epub,
  count: 0,
  whiteBoardContentId: 0,
});

export const useEpubHandlers = ({ closeModal, strategy }: UseEpubHandlersOptions) => {
  const createEpubRecord = useEpubsStore(state => state.createEpub);

  const handleRemoteEpubConfirm = useMemoizedFn(async (result: RemoteEpubSelectResult) => {
    try {
      const epub = await createEpubRecord({
        fileName: result.fileName,
        filePath: "",
        isLocal: false,
        remoteUrl: result.url,
        tags: [],
        category: "default",
        progressPercentage: 0,
      });

      await strategy.addProjectItem(createProjectItemFromEpub(epub));
      closeModal(ModalKey.RemoteEpub);
      message.success("远程 EPUB 添加成功");
    } catch (error) {
      console.error("添加远程 EPUB 失败:", error);
      message.error("添加远程 EPUB 失败");
    }
  });

  const handleSelectEpubConfirm = useMemoizedFn(async (epub: Epub | null) => {
    if (!epub) {
      message.warning("请选择 EPUB 文件");
      return;
    }

    try {
      await strategy.addProjectItem(createProjectItemFromEpub(epub));
      closeModal(ModalKey.SelectEpub);
      message.success("EPUB 关联成功");
    } catch (error) {
      console.error("关联 EPUB 失败:", error);
      message.error("关联 EPUB 失败");
    }
  });

  return { handleRemoteEpubConfirm, handleSelectEpubConfirm };
};

export type UseEpubHandlersReturn = ReturnType<typeof useEpubHandlers>;
