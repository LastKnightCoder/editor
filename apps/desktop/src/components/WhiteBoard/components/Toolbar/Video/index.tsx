import { useRef, useState } from "react";
import SVG from "react-inlinesvg";
import { App, Popover, Tooltip } from "antd";
import { useMemoizedFn } from "ahooks";
import { Upload, Link, MonitorPlay, Youtube } from "lucide-react";
import videoIcon from "@/assets/white-board/video.svg";
import YoutubeVideoSelectModal, {
  type YoutubeVideoSelectResult,
} from "@/components/YoutubeVideoSelectModal";
import BilibiliVideoSelectModal, {
  type BilibiliVideoSelectResult,
} from "@/components/BilibiliVideoSelectModal";
import RemoteVideoSelectModal, {
  type RemoteVideoSelectResult,
} from "@/components/RemoteVideoSelectModal";
import ToolbarMenu, { ToolbarMenuItem } from "../ToolbarMenu";

import { useBoard } from "../../../hooks";
import { VideoUtil } from "../../../utils";

interface VideoProps {
  className?: string;
  style?: React.CSSProperties;
}

const Video = (props: VideoProps) => {
  const { className, style } = props;
  const board = useBoard();

  const videoInputRef = useRef<HTMLInputElement>(null);
  const { message } = App.useApp();

  const handleAddVideo = useMemoizedFn(async (event: React.ChangeEvent<HTMLInputElement>) => {
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
  });

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [remoteModalOpen, setRemoteModalOpen] = useState(false);
  const [biliModalOpen, setBiliModalOpen] = useState(false);
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false);

  const handleRemoteConfirm = useMemoizedFn(async (result: RemoteVideoSelectResult) => {
    try {
      await VideoUtil.insertVideoFromUrl(result.url, board);
      setRemoteModalOpen(false);
      setPopoverOpen(false);
    } catch (error) {
      console.error("添加远程视频失败:", error);
      message.error("添加远程视频失败");
    }
  });

  const handleBilibiliConfirm = useMemoizedFn(async (result: BilibiliVideoSelectResult) => {
    try {
      await VideoUtil.insertVideoFromMeta(board, result.metaInfo);
      setBiliModalOpen(false);
      setPopoverOpen(false);
    } catch (error) {
      console.error("添加 Bilibili 视频失败:", error);
      message.error("添加 Bilibili 视频失败");
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
      setPopoverOpen(false);
    } catch (error) {
      console.error("添加 YouTube 视频失败:", error);
      message.error("添加 YouTube 视频失败");
    }
  });

  const menuItems: ToolbarMenuItem[] = [
    {
      key: "local",
      label: "本地上传",
      icon: <Upload size={16} />,
      description: "选择本地视频文件",
      onSelect: () => {
        setPopoverOpen(false);
        videoInputRef.current?.click();
      },
    },
    {
      key: "url",
      label: "网络地址",
      icon: <Link size={16} />,
      description: "输入视频直链地址",
      onSelect: () => {
        setPopoverOpen(false);
        setRemoteModalOpen(true);
      },
    },
    {
      key: "bilibili",
      label: "Bilibili",
      icon: <MonitorPlay size={16} />,
      description: "从 B 站解析视频",
      onSelect: () => {
        setPopoverOpen(false);
        setBiliModalOpen(true);
      },
    },
    {
      key: "youtube",
      label: "YouTube",
      icon: <Youtube size={16} />,
      description: "从 YouTube 解析",
      onSelect: () => {
        setPopoverOpen(false);
        setYoutubeModalOpen(true);
      },
    },
  ];

  return (
    <>
      <Tooltip title="视频">
        <Popover
          open={popoverOpen}
          onOpenChange={setPopoverOpen}
          trigger={"click"}
          arrow={false}
          placement="bottom"
          content={<ToolbarMenu items={menuItems} />}
          styles={{
            container: {
              background: "transparent",
              boxShadow: "none",
              padding: 0,
            },
          }}
        >
          <div className={className} style={style} onClick={() => setPopoverOpen(true)}>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              hidden
              onChange={handleAddVideo}
            />
            <SVG src={videoIcon} />
          </div>
        </Popover>
      </Tooltip>
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
