import React, { useContext, useMemo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { ReactEditor, useReadOnly, useSlate } from "slate-react";
import { Transforms } from "slate";
import { Button, Empty, Flex, Input, Popover, Spin, App, Modal } from "antd";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";

import { IExtensionBaseProps } from "@editor/extensions/types.ts";
import { VideoElement } from "@editor/types";
import AddParagraph from "@editor/components/AddParagraph";
import { EditorContext } from "@editor/index.tsx";
import useDragAndDrop from "@editor/hooks/useDragAndDrop.ts";

import LocalVideo from "@/components/LocalVideo";
import If from "@/components/If";
import BilibiliVideoLoader from "@/components/BilibiliVideoLoader";
import YoutubeVideoLoader from "@/components/YoutubeVideoLoader";
import { useBilibiliVideo } from "@/hooks/useBilibiliVideo";
import { useYoutubeVideo } from "@/hooks/useYoutubeVideo";
import { isYoutubeUrl, parseYoutubeUrl } from "@/utils/youtube/parser";
import {
  isBilibiliUrl,
  quickCheckBilibiliUrl,
  getVideoInfoByUrl,
} from "@/utils/bilibili";
import { getYoutubeVideoInfo } from "@/commands/youtube-cache";
import useSettingStore from "@/stores/useSettingStore";
import type {
  BiliBiliVideoMetaInfo,
  YouTubeVideoMetaInfo,
  LocalVideoMetaInfo,
  RemoteVideoMetaInfo,
} from "@/types";

import styles from "./index.module.less";

function isBiliMetaInfo(
  m?:
    | BiliBiliVideoMetaInfo
    | YouTubeVideoMetaInfo
    | LocalVideoMetaInfo
    | RemoteVideoMetaInfo,
): m is BiliBiliVideoMetaInfo {
  return !!m && (m as BiliBiliVideoMetaInfo).type === "bilibili";
}

function isYoutubeMetaInfo(
  m?:
    | BiliBiliVideoMetaInfo
    | YouTubeVideoMetaInfo
    | LocalVideoMetaInfo
    | RemoteVideoMetaInfo,
): m is YouTubeVideoMetaInfo {
  return !!m && (m as YouTubeVideoMetaInfo).type === "youtube";
}

const VideoComponent = (props: IExtensionBaseProps<VideoElement>) => {
  const { element, children, attributes } = props;

  const editor = useSlate();
  const readOnly = useReadOnly();
  const { message } = App.useApp();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [networkUrlOpen, setNetworkUrlOpen] = useState(false);
  const [networkUrl, setNetworkUrl] = useState("");

  // 添加 Bilibili/Youtube 解析弹窗状态
  const [biliModalOpen, setBiliModalOpen] = useState(false);
  const [biliUrl, setBiliUrl] = useState("");
  const [biliLoading, setBiliLoading] = useState(false);

  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeCreateLoading, setYoutubeCreateLoading] = useState(false);

  const setting = useSettingStore.getState().setting;

  // ---- 平台识别（要求 metaInfo 已存在；新增入口可解析写入） ----
  const isBilibili = useMemo(
    () => !!element.src && isBilibiliUrl(element.src),
    [element.src],
  );
  const isYoutube = useMemo(
    () => !!element.src && isYoutubeUrl(element.src),
    [element.src],
  );

  const biliMeta = isBiliMetaInfo(element.metaInfo)
    ? (element.metaInfo as BiliBiliVideoMetaInfo)
    : null;
  const ytMeta = isYoutubeMetaInfo(element.metaInfo)
    ? (element.metaInfo as YouTubeVideoMetaInfo)
    : undefined;

  // 通过 hook 获取最终可播放地址（依赖 metaInfo）
  const {
    videoUrl: bilibiliVideoUrl,
    loading: bilibiliLoading,
    error: bilibiliError,
    streamProgress: bilibiliProgress,
  } = useBilibiliVideo(
    biliMeta ||
      ({
        type: "other",
        bvid: "",
        cid: "",
      } as unknown as BiliBiliVideoMetaInfo),
  );

  const {
    videoUrl: youtubeVideoUrl,
    loading: youtubeLoading,
    error: youtubeError,
    streamProgress: youtubeProgress,
  } = useYoutubeVideo(ytMeta);

  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } =
    useDragAndDrop({
      element,
    });

  const { uploadResource: uploadFile } = useContext(EditorContext) || {};

  const setUploading = useMemoizedFn((uploading) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        uploading,
      },
      {
        at: path,
      },
    );
  });

  const handleNetworkUrlChange = useMemoizedFn(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setNetworkUrl(event.target.value);
    },
  );
  const handleOnNetworkUrlInputFinish = useMemoizedFn(() => {
    if (!networkUrl) {
      message.warning("请输入视频地址");
      return;
    }

    // 若输入的是 bilibili/youtube 链接，但缺少 metaInfo，则报错并不写入
    if (
      (isBilibiliUrl(networkUrl) || isYoutubeUrl(networkUrl)) &&
      !element.metaInfo
    ) {
      message.error("缺少 metaInfo，请通过正确入口创建该平台视频");
      return;
    }

    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        src: networkUrl,
      },
      {
        at: path,
      },
    );
    setNetworkUrl("");
    setNetworkUrlOpen(false);
  });

  const handleUploadFileChange = useMemoizedFn(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        message.warning("请选择文件");
        e.target.value = "";
        return;
      }
      setUploading(true);
      if (!uploadFile) {
        message.warning("尚未配置任何资源上传设置，无法上传资源");
        return null;
      }
      const path = ReactEditor.findPath(editor, element);
      const uploadRes = await uploadFile(file);
      if (!uploadRes) {
        setUploading(false);
        e.target.value = "";
        return;
      }
      Transforms.setNodes(
        editor,
        {
          src: uploadRes,
        },
        {
          at: path,
        },
      );
      setUploading(false);
      e.target.value = "";
    },
  );

  // 解析并写入 Bilibili metaInfo
  const handleConfirmBilibili = useMemoizedFn(async () => {
    if (!biliUrl || !isBilibiliUrl(biliUrl)) {
      message.error("请输入有效的 Bilibili 链接");
      return;
    }
    setBiliLoading(true);
    try {
      const quick = await quickCheckBilibiliUrl(biliUrl);
      if (!quick.isValid || !quick.bvid) {
        message.error(quick.error || "无效的 Bilibili 链接");
        return;
      }

      // 获取 cid（以及可选质量信息）
      const info = await getVideoInfoByUrl(
        biliUrl,
        setting.integration.bilibili.credentials,
      );

      const meta: BiliBiliVideoMetaInfo = {
        type: "bilibili",
        bvid: info.bvid,
        cid: info.cid,
        // 不强制选择清晰度，hook 内会默认 80；如需自定义可在此写入
      };

      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(
        editor,
        {
          src: biliUrl,
          metaInfo: meta,
        },
        { at: path },
      );

      setBiliModalOpen(false);
      setBiliUrl("");
    } catch (e) {
      message.error("解析 Bilibili 信息失败");
      // 保持弹窗以便用户修改
    } finally {
      setBiliLoading(false);
    }
  });

  // 解析并写入 YouTube metaInfo
  const handleConfirmYoutube = useMemoizedFn(async () => {
    if (!youtubeUrl || !isYoutubeUrl(youtubeUrl)) {
      message.error("请输入有效的 YouTube 链接");
      return;
    }
    setYoutubeCreateLoading(true);
    try {
      const { videoId } = parseYoutubeUrl(youtubeUrl);
      if (!videoId) {
        message.error("无法解析视频 ID");
        return;
      }
      const info = await getYoutubeVideoInfo(
        videoId,
        setting.integration.youtube.proxy,
      );
      if (!info) {
        message.error("获取视频信息失败");
        return;
      }
      const bestVideo =
        info.videoFmts.find((f) => f.quality === "highest") ||
        info.videoFmts[0];
      const bestAudio =
        info.audioFmts.find((f) => f.quality === "highest") ||
        info.audioFmts[0];

      const meta: YouTubeVideoMetaInfo = {
        type: "youtube",
        videoId: info.videoId,
        videoFormat: bestVideo,
        audioFormat: bestAudio,
      } as const;

      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(
        editor,
        {
          src: youtubeUrl,
          metaInfo: meta,
        },
        { at: path },
      );

      setYoutubeModalOpen(false);
      setYoutubeUrl("");
    } catch (e) {
      message.error("解析 YouTube 信息失败");
    } finally {
      setYoutubeCreateLoading(false);
    }
  });

  const { src, uploading, playbackRate = 1 } = element;

  const renderEmpty = () => {
    return (
      <Empty description={"暂未设置视频，请上传"}>
        <Flex vertical gap={12} justify={"center"}>
          <Flex align={"center"} gap={12} justify={"center"}>
            <Button
              disabled={readOnly}
              onClick={() => uploadRef.current?.click()}
            >
              本地上传
            </Button>
            <Popover
              open={!readOnly && networkUrlOpen}
              onOpenChange={setNetworkUrlOpen}
              trigger={"click"}
              arrow={false}
              placement={"bottom"}
              content={
                <Flex gap={12}>
                  <Input
                    size={"large"}
                    style={{ width: 500 }}
                    value={networkUrl}
                    onChange={handleNetworkUrlChange}
                  />
                  <Button onClick={handleOnNetworkUrlInputFinish}>确认</Button>
                </Flex>
              }
            >
              <Button disabled={readOnly}>网络地址</Button>
            </Popover>
            {/* 新增：Bilibili / YouTube 入口 */}
            <Button disabled={readOnly} onClick={() => setBiliModalOpen(true)}>
              Bilibili
            </Button>
            <Button
              disabled={readOnly}
              onClick={() => setYoutubeModalOpen(true)}
            >
              YouTube
            </Button>
          </Flex>
        </Flex>
      </Empty>
    );
  };

  return (
    <div
      contentEditable={false}
      ref={drop}
      className={classnames(styles.container, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
    >
      <div {...attributes}>
        <Spin spinning={uploading}>
          <If condition={!src}>{renderEmpty()}</If>
          <If condition={!!src}>
            <If condition={isBilibili}>
              {biliMeta ? (
                <>
                  <BilibiliVideoLoader
                    loading={bilibiliLoading}
                    error={bilibiliError}
                    streamProgress={bilibiliProgress}
                  />
                  <If
                    condition={
                      !!bilibiliVideoUrl && !bilibiliLoading && !bilibiliError
                    }
                  >
                    <LocalVideo
                      width={"100%"}
                      controls
                      src={bilibiliVideoUrl as string}
                      playbackRate={playbackRate}
                    />
                  </If>
                </>
              ) : (
                <div style={{ color: "#ff4d4f", padding: 8 }}>
                  缺少 Bilibili metaInfo，请通过添加视频入口创建
                </div>
              )}
            </If>

            <If condition={isYoutube}>
              {ytMeta ? (
                <>
                  <YoutubeVideoLoader
                    loading={youtubeLoading}
                    error={youtubeError}
                    streamProgress={youtubeProgress}
                  />
                  <If
                    condition={
                      !!youtubeVideoUrl && !youtubeLoading && !youtubeError
                    }
                  >
                    <LocalVideo
                      width={"100%"}
                      controls
                      src={youtubeVideoUrl as string}
                      playbackRate={playbackRate}
                    />
                  </If>
                </>
              ) : (
                <div style={{ color: "#ff4d4f", padding: 8 }}>
                  缺少 YouTube metaInfo，请通过添加视频入口创建
                </div>
              )}
            </If>

            <If condition={!isBilibili && !isYoutube}>
              <LocalVideo
                width={"100%"}
                controls
                src={src}
                playbackRate={playbackRate}
              />
            </If>
          </If>
        </Spin>
        {children}
        <div
          contentEditable={false}
          ref={drag}
          className={classnames(styles.dragHandler, {
            [styles.canDrag]: canDrag,
          })}
        >
          <MdDragIndicator className={styles.icon} />
        </div>
        <input
          ref={uploadRef}
          type={"file"}
          accept={"video/*"}
          hidden
          onChange={handleUploadFileChange}
        />
        <AddParagraph element={element} />
      </div>

      {/* Bilibili 地址输入弹窗 */}
      <Modal
        open={biliModalOpen}
        title={"添加 Bilibili 视频"}
        confirmLoading={biliLoading}
        onCancel={() => {
          setBiliModalOpen(false);
          setBiliUrl("");
        }}
        onOk={handleConfirmBilibili}
      >
        <Input
          placeholder="请输入 Bilibili 链接 (https://www.bilibili.com/video/BV...)"
          value={biliUrl}
          onChange={(e) => setBiliUrl(e.target.value)}
          autoFocus
        />
      </Modal>

      {/* YouTube 地址输入弹窗 */}
      <Modal
        open={youtubeModalOpen}
        title={"添加 YouTube 视频"}
        confirmLoading={youtubeCreateLoading}
        onCancel={() => {
          setYoutubeModalOpen(false);
          setYoutubeUrl("");
        }}
        onOk={handleConfirmYoutube}
      >
        <Input
          placeholder="请输入 YouTube 链接 (https://www.youtube.com/watch?v=...)"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          autoFocus
        />
      </Modal>
    </div>
  );
};

export default VideoComponent;
