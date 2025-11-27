import React, { useRef, useState, useEffect } from "react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import ResourcePickerModal from "@/components/ResourcePickerModal";
import YoutubeVideoSelectModal, {
  type YoutubeVideoSelectResult,
} from "@/components/YoutubeVideoSelectModal";
import BilibiliVideoSelectModal, {
  type BilibiliVideoSelectResult,
} from "@/components/BilibiliVideoSelectModal";
import NotionVideoSelectModal, {
  type NotionVideoSelectResult,
} from "@/components/NotionVideoSelectModal";
import RemoteVideoSelectModal, {
  type RemoteVideoSelectResult,
} from "@/components/RemoteVideoSelectModal";
import type { IResource } from "@/types";
import Board from "../../Board";
import { VideoUtil } from "../../utils";

interface VideoSelectorModalProps {
  open: boolean;
  onClose: () => void;
  board: Board;
  action?: string; // "local" | "resource" | "url" | "bilibili" | "youtube" | "notion"
}

const VideoSelectorModal = ({
  open,
  onClose,
  board,
  action,
}: VideoSelectorModalProps) => {
  const videoInputRef = useRef<HTMLInputElement>(null);
  const { message } = App.useApp();

  // Modal states for different actions
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [biliModalOpen, setBiliModalOpen] = useState(false);
  const [ytModalOpen, setYtModalOpen] = useState(false);
  const [notionModalOpen, setNotionModalOpen] = useState(false);
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);

  // 根据 action 自动触发对应操作
  useEffect(() => {
    if (!open) return;

    switch (action) {
      case "local":
        videoInputRef.current?.click();
        break;
      case "resource":
        setResourcePickerOpen(true);
        break;
      case "url":
        setUrlModalOpen(true);
        break;
      case "bilibili":
        setBiliModalOpen(true);
        break;
      case "youtube":
        setYtModalOpen(true);
        break;
      case "notion":
        setNotionModalOpen(true);
        break;
    }
  }, [open, action]);

  const resetState = useMemoizedFn(() => {
    setUrlModalOpen(false);
    setBiliModalOpen(false);
    setYtModalOpen(false);
    setNotionModalOpen(false);
    setResourcePickerOpen(false);
  });

  const handleClose = useMemoizedFn(() => {
    resetState();
    onClose();
  });

  const handleAddVideo = useMemoizedFn(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        message.loading({
          key: "uploading-video",
          content: "正在处理视频，请稍候...",
          duration: 0,
        });
        await VideoUtil.insertVideo(file, board);
        message.destroy("uploading-video");
      }
      event.target.value = "";
      handleClose();
    },
  );

  const handleInsertFromResource = useMemoizedFn(
    async (resources: IResource[]) => {
      if (!resources.length) {
        setResourcePickerOpen(false);
        handleClose();
        return;
      }
      message.loading({
        key: "uploading-video",
        content: "正在插入视频，请稍候...",
        duration: 0,
      });
      try {
        for (const resource of resources) {
          await VideoUtil.insertVideoFromPath(resource.path, board);
        }
      } finally {
        message.destroy("uploading-video");
        setResourcePickerOpen(false);
        handleClose();
      }
    },
  );

  const handleRemoteConfirm = useMemoizedFn(
    async (result: RemoteVideoSelectResult) => {
      try {
        await VideoUtil.insertVideoFromUrl(result.url, board);
        setUrlModalOpen(false);
        handleClose();
      } catch (error) {
        console.error("添加远程视频失败:", error);
        message.error("添加远程视频失败");
      }
    },
  );

  const handleBilibiliConfirm = useMemoizedFn(
    async (result: BilibiliVideoSelectResult) => {
      try {
        await VideoUtil.insertVideoFromMeta(board, result.metaInfo);
        setBiliModalOpen(false);
        handleClose();
      } catch (error) {
        console.error("添加 Bilibili 视频失败:", error);
        message.error("添加 Bilibili 视频失败");
      }
    },
  );

  const handleYoutubeConfirm = useMemoizedFn(
    async (result: YoutubeVideoSelectResult) => {
      try {
        await VideoUtil.insertVideoFromMeta(board, {
          type: "youtube",
          url: result.url,
          videoStream: result.videoStream,
          audioStream: result.audioStream,
        });
        setYtModalOpen(false);
        handleClose();
      } catch (error) {
        console.error("添加 YouTube 视频失败:", error);
        message.error("添加 YouTube 视频失败");
      }
    },
  );

  const handleNotionConfirm = useMemoizedFn(
    async (result: NotionVideoSelectResult) => {
      try {
        await VideoUtil.insertVideoFromMeta(board, result.metaInfo);
        setNotionModalOpen(false);
        handleClose();
        message.success("Notion 视频添加成功");
      } catch (error) {
        console.error("添加 Notion 视频失败:", error);
        message.error("添加 Notion 视频失败");
      }
    },
  );

  return (
    <>
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={handleAddVideo}
      />

      {/* URL 输入弹窗 */}
      <RemoteVideoSelectModal
        open={urlModalOpen}
        onCancel={handleClose}
        onConfirm={handleRemoteConfirm}
      />

      {/* Bilibili 弹窗 */}
      <BilibiliVideoSelectModal
        open={biliModalOpen}
        onCancel={handleClose}
        onConfirm={handleBilibiliConfirm}
      />

      {/* YouTube 弹窗 */}
      <YoutubeVideoSelectModal
        open={ytModalOpen}
        onCancel={handleClose}
        onConfirm={handleYoutubeConfirm}
      />

      {/* Notion 弹窗 */}
      <NotionVideoSelectModal
        open={notionModalOpen}
        onCancel={handleClose}
        onConfirm={handleNotionConfirm}
      />

      {/* 资源库弹窗 */}
      <ResourcePickerModal
        open={resourcePickerOpen}
        onCancel={handleClose}
        allowedTypes={["video"]}
        multiple
        title="选择视频"
        onConfirm={handleInsertFromResource}
      />
    </>
  );
};

export default VideoSelectorModal;
