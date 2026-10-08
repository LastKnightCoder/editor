import React, { useRef, useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { toast } from "@tau/ui";
import YoutubeVideoSelectModal, {
  type YoutubeVideoSelectResult,
} from "@/components/YoutubeVideoSelectModal";
import BilibiliVideoSelectModal, {
  type BilibiliVideoSelectResult,
} from "@/components/BilibiliVideoSelectModal";
import RemoteVideoSelectModal, {
  type RemoteVideoSelectResult,
} from "@/components/RemoteVideoSelectModal";
import { Board as Board } from "@tau/whiteboard";
import { VideoUtil } from "@tau/whiteboard";

interface VideoSelectorModalProps {
  open: boolean;
  onClose: () => void;
  board: Board;
  action?: string; // "local" | "url" | "bilibili" | "youtube"
}

const VideoSelectorModal = ({ open, onClose, board, action }: VideoSelectorModalProps) => {
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Modal states for different actions
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [biliModalOpen, setBiliModalOpen] = useState(false);
  const [ytModalOpen, setYtModalOpen] = useState(false);

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
      case "bilibili":
        setBiliModalOpen(true);
        break;
      case "youtube":
        setYtModalOpen(true);
        break;
    }
  }, [open, action]);

  const resetState = useMemoizedFn(() => {
    setUrlModalOpen(false);
    setBiliModalOpen(false);
    setYtModalOpen(false);
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
        await VideoUtil.insertVideo(file, board);
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

  const handleBilibiliConfirm = useMemoizedFn(async (result: BilibiliVideoSelectResult) => {
    try {
      await VideoUtil.insertVideoFromMeta(board, result.metaInfo);
      setBiliModalOpen(false);
      handleClose();
    } catch (error) {
      console.error("添加 Bilibili 视频失败:", error);
      toast.error("添加 Bilibili 视频失败");
    }
  });

  const handleYoutubeConfirm = useMemoizedFn(async (result: YoutubeVideoSelectResult) => {
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
      toast.error("添加 YouTube 视频失败");
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
    </>
  );
};

export default VideoSelectorModal;
