import { useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import type { MessageInstance } from "antd/es/message/interface";
import type { PodcastScriptLine } from "@/types/minimax";
import type { IPodcast, SpeakerRole } from "@/types/podcast";
import {
  createPodcast,
  deletePodcast,
  updatePodcastName,
} from "@/commands/podcast";

export interface PodcastAttachmentMessages {
  created: string;
  updated: string;
  deleted: string;
}

export interface UsePodcastAttachmentOptions<THost> {
  hostId: number;
  currentPodcast?: IPodcast;
  attachPodcast: (hostId: number, podcastId: number) => Promise<void>;
  detachPodcast: (hostId: number) => Promise<void>;
  reloadHost: (hostId: number) => Promise<THost | null>;
  onHostReloaded: (host: THost) => void;
  message: MessageInstance;
  messages?: Partial<PodcastAttachmentMessages>;
}

/**
 * 处理播客创建/编辑/删除与宿主（卡片/文章等）关联的通用逻辑。
 * 只负责数据与状态，UI 由调用侧决定。
 */
export const usePodcastAttachment = <THost>(
  options: UsePodcastAttachmentOptions<THost>,
) => {
  const {
    hostId,
    currentPodcast,
    attachPodcast,
    detachPodcast,
    reloadHost,
    onHostReloaded,
    message,
    messages,
  } = options;

  const [podcastModalOpen, setPodcastModalOpen] = useState(false);

  const currentPodcastRef = useRef<IPodcast | undefined>(currentPodcast);
  useEffect(() => {
    currentPodcastRef.current = currentPodcast;
  }, [currentPodcast]);

  const refreshHost = useMemoizedFn(async () => {
    const updatedHost = await reloadHost(hostId);
    if (updatedHost) {
      onHostReloaded(updatedHost);
    }
  });

  const openPodcastModal = useMemoizedFn(() => {
    setPodcastModalOpen(true);
  });

  const closePodcastModal = useMemoizedFn(() => {
    setPodcastModalOpen(false);
  });

  const handlePodcastSuccess = useMemoizedFn(
    async (
      audioUrl: string,
      script: string,
      scriptLines: PodcastScriptLine[],
      duration: number,
      speakers: {
        name: string;
        voiceId: string;
        voiceName: string;
        role: SpeakerRole;
      }[],
      name?: string,
    ) => {
      try {
        const existedPodcast = currentPodcastRef.current;
        if (existedPodcast) {
          await updatePodcastName(existedPodcast.id, name || "");
          await refreshHost();
          message.success(messages?.updated ?? "播客标题已更新");
        } else {
          const podcast = await createPodcast({
            name,
            audioUrl,
            script,
            scriptLines,
            duration,
            speakers,
          });
          await attachPodcast(hostId, podcast.id);
          await refreshHost();
          message.success(messages?.created ?? "播客已添加");
        }
      } catch (error) {
        console.error("保存播客失败:", error);
        message.error("保存播客失败");
      }
    },
  );

  const handleDeletePodcast = useMemoizedFn(async () => {
    const existedPodcast = currentPodcastRef.current;
    if (!existedPodcast) return;

    try {
      await detachPodcast(hostId);
      await deletePodcast(existedPodcast.id);
      await refreshHost();
      message.success(messages?.deleted ?? "播客已删除");
    } catch (error) {
      console.error("删除播客失败:", error);
      message.error("删除播客失败");
    }
  });

  return {
    podcastModalOpen,
    openPodcastModal,
    closePodcastModal,
    handlePodcastSuccess,
    handleDeletePodcast,
  };
};

export default usePodcastAttachment;
