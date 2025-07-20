import React, { useRef } from "react";
import SVG from "react-inlinesvg";
import { App, Tooltip } from "antd";
import { useMemoizedFn } from "ahooks";
import videoIcon from "@/assets/white-board/video.svg";

import { useBoard } from "../../../hooks";
import { VideoUtil } from "../../../utils";

interface ImageProps {
  className?: string;
  style?: React.CSSProperties;
}

const Video = (props: ImageProps) => {
  const { className, style } = props;
  const board = useBoard();

  const videoInputRef = useRef<HTMLInputElement>(null);

  const { message } = App.useApp();

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
    },
  );

  return (
    <Tooltip title="视频">
      <div
        className={className}
        style={style}
        onClick={() => {
          videoInputRef.current?.click();
        }}
      >
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          hidden
          onChange={handleAddVideo}
        />
        <SVG src={videoIcon} />
      </div>
    </Tooltip>
  );
};

export default Video;
