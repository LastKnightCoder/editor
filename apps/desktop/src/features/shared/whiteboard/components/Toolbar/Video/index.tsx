import { useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Upload, Link, MonitorPlay, Youtube, Video as VideoIcon } from "lucide-react";
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
import { ToolMenu, type ToolMenuItem } from "@tau/whiteboard";

import { useBoard } from "@tau/whiteboard";
import { VideoUtil } from "@tau/whiteboard";

const Video = () => {
  const board = useBoard();

  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleAddVideo = useMemoizedFn(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const t = toast.loading("正在处理视频，请稍候…");
      try {
        await VideoUtil.insertVideo(file, board);
      } finally {
        toast.dismiss(t);
      }
    }
    event.target.value = "";
  });

  const [remoteModalOpen, setRemoteModalOpen] = useState(false);
  const [biliModalOpen, setBiliModalOpen] = useState(false);
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false);

  const handleRemoteConfirm = useMemoizedFn(async (result: RemoteVideoSelectResult) => {
    try {
      await VideoUtil.insertVideoFromUrl(result.url, board);
      setRemoteModalOpen(false);
    } catch (error) {
      console.error("添加远程视频失败:", error);
      toast.error("添加远程视频失败");
    }
  });

  const handleBilibiliConfirm = useMemoizedFn(async (result: BilibiliVideoSelectResult) => {
    try {
      await VideoUtil.insertVideoFromMeta(board, result.metaInfo);
      setBiliModalOpen(false);
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
      setYoutubeModalOpen(false);
    } catch (error) {
      console.error("添加 YouTube 视频失败:", error);
      toast.error("添加 YouTube 视频失败");
    }
  });

  const menuItems: ToolMenuItem[] = [
    {
      key: "local",
      label: "本地上传",
      icon: Upload,
      onSelect: () => {
        videoInputRef.current?.click();
      },
    },
    {
      key: "url",
      label: "网络地址",
      icon: Link,
      onSelect: () => {
        setRemoteModalOpen(true);
      },
    },
    {
      key: "bilibili",
      label: "Bilibili",
      icon: MonitorPlay,
      onSelect: () => {
        setBiliModalOpen(true);
      },
    },
    {
      key: "youtube",
      label: "YouTube",
      icon: Youtube,
      onSelect: () => {
        setYoutubeModalOpen(true);
      },
    },
  ];

  return (
    <>
      <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={handleAddVideo} />
      <ToolMenu label="视频" icon={<VideoIcon strokeWidth={1.75} />} items={menuItems} />
      <RemoteVideoSelectModal
        open={remoteModalOpen}
        onCancel={() => setRemoteModalOpen(false)}
        onConfirm={handleRemoteConfirm}
      />
      <BilibiliVideoSelectModal
        open={biliModalOpen}
        onCancel={() => setBiliModalOpen(false)}
        onConfirm={handleBilibiliConfirm}
      />
      <YoutubeVideoSelectModal
        open={youtubeModalOpen}
        onCancel={() => setYoutubeModalOpen(false)}
        onConfirm={handleYoutubeConfirm}
      />
    </>
  );
};

export default Video;
