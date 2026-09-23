import { useMemoizedFn } from "ahooks";
import { message } from "antd";
import { createEmptyVideoNote } from "@/commands";
import {
  CreateProjectItem,
  EProjectItemType,
  type ProjectItem as IProjectItem,
  Project as IProject,
} from "@/types";
import { ModalKey } from "../constants/modalKeys";
import type { YoutubeVideoSelectResult } from "@/components/YoutubeVideoSelectModal";
import type { BilibiliVideoSelectResult } from "@/components/BilibiliVideoSelectModal";
import type { RemoteVideoSelectResult } from "@/components/RemoteVideoSelectModal";

/**
 * 视频添加策略接口
 */
export interface VideoAddStrategy {
  addProjectItem: (createItem: CreateProjectItem) => Promise<void>;
}

/**
 * 根项目添加策略的配置
 */
export interface RootVideoStrategyConfig {
  project: IProject | null;
  addRootProjectItem: (
    projectId: number,
    createItem: CreateProjectItem
  ) => Promise<[IProject, IProjectItem | null]>;
  setProject: (project: IProject) => void;
  navigateTo: (tabType: string, params: { id: number; itemId?: number }, title?: string) => void;
}

/**
 * 子项目添加策略的配置
 */
export interface ChildVideoStrategyConfig {
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

export interface UseVideoHandlersOptions {
  closeModal: (key: ModalKey) => void;
  strategy: VideoAddStrategy;
}

/**
 * 创建根项目添加策略
 */
export const createRootVideoStrategy = (config: RootVideoStrategyConfig): VideoAddStrategy => ({
  addProjectItem: async (createItem: CreateProjectItem) => {
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

/**
 * 创建子项目添加策略
 */
export const createChildVideoStrategy = (config: ChildVideoStrategyConfig): VideoAddStrategy => ({
  addProjectItem: async (createItem: CreateProjectItem) => {
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

/**
 * 视频处理相关的共享 hook
 * 使用策略模式处理根项目和子项目的添加逻辑
 */
export const useVideoHandlers = (options: UseVideoHandlersOptions) => {
  const { closeModal, strategy } = options;

  /**
   * 处理 YouTube 视频添加
   */
  const handleYoutubeConfirm = useMemoizedFn(async (result: YoutubeVideoSelectResult) => {
    try {
      const item = await createEmptyVideoNote({
        type: "youtube",
        url: result.url,
        videoStream: result.videoStream,
        audioStream: result.audioStream,
      });

      if (!item) {
        message.error("创建视频笔记失败");
        return;
      }

      const createProjectItem: CreateProjectItem = {
        title: result.title || `YouTube 视频 - ${result.url}`,
        content: [],
        children: [],
        refType: "video-note",
        refId: item.id,
        projectItemType: EProjectItemType.VideoNote,
        count: 0,
        whiteBoardContentId: 0,
      };

      await strategy.addProjectItem(createProjectItem);
      closeModal(ModalKey.Youtube);
      message.success("YouTube 视频笔记添加成功！");
    } catch (e) {
      console.error(e);
      message.error("添加 YouTube 视频失败");
    }
  });

  /**
   * 处理 Bilibili 视频添加
   */
  const handleBilibiliConfirm = useMemoizedFn(async (result: BilibiliVideoSelectResult) => {
    try {
      const item = await createEmptyVideoNote(result.metaInfo);
      if (!item) {
        message.error("创建视频笔记失败");
        return;
      }

      const createProjectItem: CreateProjectItem = {
        title: result.title || `Bilibili 视频 - ${result.metaInfo.bvid}`,
        content: [],
        children: [],
        refType: "video-note",
        refId: item.id,
        projectItemType: EProjectItemType.VideoNote,
        count: 0,
        whiteBoardContentId: 0,
      };

      await strategy.addProjectItem(createProjectItem);
      closeModal(ModalKey.Bilibili);
      message.success("Bilibili 视频笔记添加成功");
    } catch (error) {
      console.error("添加 Bilibili 视频失败:", error);
      message.error("添加 Bilibili 视频失败");
    }
  });

  /**
   * 处理远程视频添加
   */
  const handleRemoteVideoConfirm = useMemoizedFn(async (result: RemoteVideoSelectResult) => {
    try {
      const item = await createEmptyVideoNote({
        type: "remote",
        url: result.url,
      });

      if (!item) {
        message.error("创建视频笔记失败");
        return;
      }

      const createProjectItem: CreateProjectItem = {
        title: `在线视频 - ${result.url}`,
        content: [],
        children: [],
        refType: "video-note",
        refId: item.id,
        projectItemType: EProjectItemType.VideoNote,
        count: 0,
        whiteBoardContentId: 0,
      };

      await strategy.addProjectItem(createProjectItem);
      closeModal(ModalKey.WebVideo);
      message.success("远程视频添加成功");
    } catch (error) {
      console.error("添加远程视频失败:", error);
      message.error("添加在线视频失败");
    }
  });

  return {
    handleYoutubeConfirm,
    handleBilibiliConfirm,
    handleRemoteVideoConfirm,
  };
};
