import React, { useRef, useState } from "react";
import SVG from "react-inlinesvg";
import { App, Button, Flex, Popover, Tabs, Tooltip } from "antd";
import { useMemoizedFn } from "ahooks";
import videoIcon from "@/assets/white-board/video.svg";
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

  const handleInsertFromResource = useMemoizedFn(
    async (resources: IResource[]) => {
      if (!resources.length) {
        setResourcePickerOpen(false);
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
      }
    },
  );

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);
  const [remoteModalOpen, setRemoteModalOpen] = useState(false);
  const [biliModalOpen, setBiliModalOpen] = useState(false);
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false);
  const [notionModalOpen, setNotionModalOpen] = useState(false);

  const handleRemoteConfirm = useMemoizedFn(
    async (result: RemoteVideoSelectResult) => {
      try {
        await VideoUtil.insertVideoFromUrl(result.url, board);
        setRemoteModalOpen(false);
        setPopoverOpen(false);
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
        setPopoverOpen(false);
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
        setYoutubeModalOpen(false);
        setPopoverOpen(false);
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
        setPopoverOpen(false);
        message.success("Notion 视频添加成功");
      } catch (error) {
        console.error("添加 Notion 视频失败:", error);
        message.error("添加 Notion 视频失败");
      }
    },
  );

  return (
    <>
      <Tooltip title="视频">
        <Popover
          open={popoverOpen}
          onOpenChange={setPopoverOpen}
          trigger={"click"}
          arrow={false}
          placement="bottom"
          content={
            <div style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
              <Tabs
                size="small"
                items={[
                  {
                    key: "local",
                    label: "本地上传",
                    children: (
                      <Flex vertical gap={8}>
                        <div>选择本地视频文件上传并插入到白板</div>
                        <Button onClick={() => videoInputRef.current?.click()}>
                          选择文件
                        </Button>
                      </Flex>
                    ),
                  },
                  {
                    key: "library",
                    label: "资源库",
                    children: (
                      <Flex vertical gap={8}>
                        <div>从已有资源库中选择视频插入白板</div>
                        <Button
                          onClick={() => {
                            setPopoverOpen(false);
                            setResourcePickerOpen(true);
                          }}
                        >
                          打开资源库
                        </Button>
                      </Flex>
                    ),
                  },
                  {
                    key: "url",
                    label: "网络地址",
                    children: (
                      <Flex vertical gap={8}>
                        <div>输入在线视频的直链地址</div>
                        <Button
                          onClick={() => {
                            setPopoverOpen(false);
                            setRemoteModalOpen(true);
                          }}
                        >
                          打开在线视频选择器
                        </Button>
                      </Flex>
                    ),
                  },
                  {
                    key: "bilibili",
                    label: "Bilibili",
                    children: (
                      <Flex vertical gap={8}>
                        <div>从 Bilibili 解析视频并选择清晰度</div>
                        <Button
                          onClick={() => {
                            setPopoverOpen(false);
                            setBiliModalOpen(true);
                          }}
                        >
                          打开 Bilibili 视频选择器
                        </Button>
                      </Flex>
                    ),
                  },
                  {
                    key: "youtube",
                    label: "YouTube",
                    children: (
                      <Flex vertical gap={8}>
                        <div>从 YouTube 解析视频并选择清晰度</div>
                        <Button
                          onClick={() => {
                            setPopoverOpen(false);
                            setYoutubeModalOpen(true);
                          }}
                        >
                          打开 YouTube 视频选择器
                        </Button>
                      </Flex>
                    ),
                  },
                  {
                    key: "notion",
                    label: "Notion",
                    children: (
                      <Flex vertical gap={8}>
                        <div>从 Notion 添加视频块，可选是否缓存到本地</div>
                        <Button
                          onClick={() => {
                            setPopoverOpen(false);
                            setNotionModalOpen(true);
                          }}
                        >
                          打开 Notion 视频选择器
                        </Button>
                      </Flex>
                    ),
                  },
                ]}
              />
            </div>
          }
        >
          <div
            className={className}
            style={style}
            onClick={() => setPopoverOpen(true)}
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
        </Popover>
      </Tooltip>
      <ResourcePickerModal
        open={resourcePickerOpen}
        onCancel={() => setResourcePickerOpen(false)}
        allowedTypes={["video"]}
        multiple
        title="选择视频"
        onConfirm={handleInsertFromResource}
      />
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
      <NotionVideoSelectModal
        open={notionModalOpen}
        onCancel={() => setNotionModalOpen(false)}
        onConfirm={handleNotionConfirm}
      />
    </>
  );
};

export default Video;
