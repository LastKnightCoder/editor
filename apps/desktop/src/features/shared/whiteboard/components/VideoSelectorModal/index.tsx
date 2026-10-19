import { desktopMedia } from "../../media";
import React, { useRef, useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { toast } from "@tau/ui";
import OnlineVideoSelectModal, {
  type OnlineVideoSelection,
} from "@/components/OnlineVideoSelectModal";
import { buildOnlineVideoMeta } from "@/types/online-video";
import RemoteVideoSelectModal, {
  type RemoteVideoSelectResult,
} from "@/components/RemoteVideoSelectModal";
import { Board as Board } from "@tau/whiteboard";
import { VideoUtil } from "@tau/whiteboard";

interface VideoSelectorModalProps {
  open: boolean;
  onClose: () => void;
  board: Board;
  action?: string; // "local" | "url" | "source:<视频插件 ID>"
}

const VideoSelectorModal = ({ open, onClose, board, action }: VideoSelectorModalProps) => {
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Modal states for different actions
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [sourceId, setSourceId] = useState<string | null>(null);

  // 根据 action 自动触发对应操作
  useEffect(() => {
    if (!open) return;

    switch (action) {
      case "local":
        videoInputRef.current?.click();
        break;
      case "url":
        setUrlModalOpen(true);
        break;
      default:
        if (action?.startsWith("source:")) setSourceId(action.slice("source:".length));
    }
  }, [open, action]);

  const resetState = useMemoizedFn(() => {
    setUrlModalOpen(false);
    setSourceId(null);
  });

  const handleClose = useMemoizedFn(() => {
    resetState();
    onClose();
  });

  const handleAddVideo = useMemoizedFn(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const toastId = toast.loading("正在处理视频，请稍候…");
      try {
        await VideoUtil.insertVideo(file, board, desktopMedia);
      } finally {
        toast.dismiss(toastId);
      }
    }
    event.target.value = "";
    handleClose();
  });

  const handleRemoteConfirm = useMemoizedFn(async (result: RemoteVideoSelectResult) => {
    try {
      await VideoUtil.insertVideoFromUrl(result.url, board);
      setUrlModalOpen(false);
      handleClose();
    } catch (error) {
      console.error("添加远程视频失败:", error);
      toast.error("添加远程视频失败");
    }
  });

  const handleOnlineConfirm = useMemoizedFn(async (result: OnlineVideoSelection) => {
    try {
      await VideoUtil.insertVideoFromMeta(
        board,
        buildOnlineVideoMeta(result.providerId, result.ref, result.title),
        result.url
      );
      handleClose();
    } catch (error) {
      console.error("添加插件视频失败:", error);
      toast.error("添加视频失败");
    }
  });

  return (
    <>
      <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={handleAddVideo} />

      {/* URL 输入弹窗 */}
      <RemoteVideoSelectModal
        open={urlModalOpen}
        onCancel={handleClose}
        onConfirm={handleRemoteConfirm}
      />

      {sourceId && (
        <OnlineVideoSelectModal
          providerId={sourceId}
          open
          onCancel={handleClose}
          onConfirm={handleOnlineConfirm}
        />
      )}
    </>
  );
};

export default VideoSelectorModal;
