import { useMemoizedFn } from "ahooks";
import { message } from "antd";
import { createEmptyAudioNote } from "@/commands";
import {
  CreateProjectItem,
  EProjectItemType,
  type ProjectItem as IProjectItem,
  Project as IProject,
} from "@/types";
import type { BilibiliVideoSelectResult } from "@/components/BilibiliVideoSelectModal";
import type { YoutubeVideoSelectResult } from "@/components/YoutubeVideoSelectModal";
import { ModalKey } from "../constants/modalKeys";

export interface AudioAddStrategy {
  addProjectItem: (createItem: CreateProjectItem) => Promise<void>;
}

export interface RootAudioStrategyConfig {
  project: IProject | null;
  addRootProjectItem: (
    projectId: number,
    createItem: CreateProjectItem,
  ) => Promise<[IProject, IProjectItem | null]>;
  setProject: (project: IProject) => void;
  navigateTo: (
    tabType: string,
    params: { id: number; itemId?: number },
    title?: string,
  ) => void;
}

export interface ChildAudioStrategyConfig {
  projectItem: IProjectItem | undefined;
  projectId: number | undefined;
  addChildProjectItem: (
    parentId: number,
    createItem: CreateProjectItem,
  ) => Promise<[IProjectItem | null, IProjectItem | null]>;
  setProjectItem: (projectItem: IProjectItem) => void;
  projectItemEventBus: {
    publishProjectItemEvent: (event: string, item: IProjectItem) => void;
  };
}

export interface UseAudioHandlersOptions {
  closeModal: (key: ModalKey) => void;
  strategy: AudioAddStrategy;
}

export const createRootAudioStrategy = (
  config: RootAudioStrategyConfig,
): AudioAddStrategy => ({
  addProjectItem: async (createItem: CreateProjectItem) => {
    if (!config.project) {
      message.error("项目尚未加载完成");
      return;
    }

    const [newProject, projectItem] = await config.addRootProjectItem(
      config.project.id,
      createItem,
    );

    if (projectItem) {
      config.navigateTo(
        "project-detail",
        { id: newProject.id, itemId: projectItem.id },
        `项目 - ${projectItem.title || `#${projectItem.id}`}`,
      );
    }
    config.setProject(newProject);
  },
});

export const createChildAudioStrategy = (
  config: ChildAudioStrategyConfig,
): AudioAddStrategy => ({
  addProjectItem: async (createItem: CreateProjectItem) => {
    if (!config.projectItem || !config.projectId) {
      message.error("项目信息不完整");
      return;
    }

    const [updatedParent] = await config.addChildProjectItem(
      config.projectItem.id,
      createItem,
    );

    if (updatedParent) {
      config.setProjectItem(updatedParent);
      config.projectItemEventBus.publishProjectItemEvent(
        "project-item:updated",
        updatedParent,
      );
    }
  },
});

export const useAudioHandlers = (options: UseAudioHandlersOptions) => {
  const { closeModal, strategy } = options;

  const handleRemoteAudioConfirm = useMemoizedFn(async (url: string) => {
    closeModal(ModalKey.RemoteAudio);

    const audioNote = await createEmptyAudioNote({
      type: "remote",
      url,
    });

    if (!audioNote) {
      message.error("创建音频笔记失败");
      return;
    }

    const createItem: CreateProjectItem = {
      title: "远程音频",
      content: [],
      children: [],
      refType: "audio-note",
      refId: audioNote.id,
      projectItemType: EProjectItemType.AudioNote,
      count: 0,
      whiteBoardContentId: 0,
    };

    await strategy.addProjectItem(createItem);
  });

  const handleXiaoyuzhouConfirm = useMemoizedFn(
    async (data: {
      episodeId: string;
      audioUrl: string;
      title?: string;
      podcastName?: string;
      coverUrl?: string;
    }) => {
      closeModal(ModalKey.XiaoyuzhouPodcast);

      const audioNote = await createEmptyAudioNote({
        type: "xiaoyuzhou",
        episodeId: data.episodeId,
        audioUrl: data.audioUrl,
        episodeTitle: data.title,
        podcastName: data.podcastName,
        coverUrl: data.coverUrl,
      });

      if (!audioNote) {
        message.error("创建音频笔记失败");
        return;
      }

      const createItem: CreateProjectItem = {
        title: data.title || "小宇宙播客",
        content: [],
        children: [],
        refType: "audio-note",
        refId: audioNote.id,
        projectItemType: EProjectItemType.AudioNote,
        count: 0,
        whiteBoardContentId: 0,
      };

      await strategy.addProjectItem(createItem);
    },
  );

  const handleBilibiliAudioConfirm = useMemoizedFn(
    async (result: BilibiliVideoSelectResult) => {
      closeModal(ModalKey.BilibiliAudio);

      const audioNote = await createEmptyAudioNote({
        type: "bilibili",
        bvid: result.metaInfo.bvid,
        cid: result.metaInfo.cid,
        quality: result.metaInfo.quality,
        title: result.title,
        thumbnail: result.thumbnail,
      });

      if (!audioNote) {
        message.error("创建音频笔记失败");
        return;
      }

      const createItem: CreateProjectItem = {
        title: result.title || `Bilibili 音频 - ${result.metaInfo.bvid}`,
        content: [],
        children: [],
        refType: "audio-note",
        refId: audioNote.id,
        projectItemType: EProjectItemType.AudioNote,
        count: 0,
        whiteBoardContentId: 0,
      };

      await strategy.addProjectItem(createItem);
    },
  );

  const handleYoutubeAudioConfirm = useMemoizedFn(
    async (result: YoutubeVideoSelectResult) => {
      closeModal(ModalKey.YoutubeAudio);

      const audioNote = await createEmptyAudioNote({
        type: "youtube",
        url: result.url,
        audioStream: result.audioStream,
        title: result.title,
        thumbnail: result.thumbnail,
      });

      if (!audioNote) {
        message.error("创建音频笔记失败");
        return;
      }

      const createItem: CreateProjectItem = {
        title: result.title || "YouTube 音频",
        content: [],
        children: [],
        refType: "audio-note",
        refId: audioNote.id,
        projectItemType: EProjectItemType.AudioNote,
        count: 0,
        whiteBoardContentId: 0,
      };

      await strategy.addProjectItem(createItem);
    },
  );

  return {
    handleRemoteAudioConfirm,
    handleXiaoyuzhouConfirm,
    handleBilibiliAudioConfirm,
    handleYoutubeAudioConfirm,
  };
};
