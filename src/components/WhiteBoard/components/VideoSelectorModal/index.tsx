import React, { useRef, useState, useEffect } from "react";
import { App, Button, Flex, Input, Modal, Select, Tag } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import ResourcePickerModal from "@/components/ResourcePickerModal";
import type { IResource } from "@/types";

import Board from "../../Board";
import { VideoUtil } from "../../utils";
import {
  isBilibiliUrl,
  getVideoInfoByUrl,
  getQualityInfo,
  getQualityOptions,
  BilibiliVideoQuality,
  quickCheckBilibiliUrl,
} from "@/utils/bilibili";
import { isYoutubeUrl, parseYoutubeUrl } from "@/utils/youtube/parser";
import { getYoutubeVideoInfo } from "@/commands/youtube-cache";
import { parseNotionBlockId } from "@/utils/notion";
import { getNotionBlockInfo } from "@/commands/notion";
import useSettingStore from "@/stores/useSettingStore";
import ytdl from "@distube/ytdl-core";

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
  const { setting } = useSettingStore.getState();
  const { message } = App.useApp();

  // Modal states for different actions
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [biliModalOpen, setBiliModalOpen] = useState(false);
  const [ytModalOpen, setYtModalOpen] = useState(false);
  const [notionModalOpen, setNotionModalOpen] = useState(false);
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);

  const [url, setUrl] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [biliQualityLoading, setBiliQualityLoading] = useState(false);
  const [biliQualityOptions, setBiliQualityOptions] = useState<
    Array<{
      label: string;
      value: number;
      needLogin?: boolean;
      needVip?: boolean;
    }>
  >([]);
  const [biliQuality, setBiliQuality] = useState<number>(
    BilibiliVideoQuality.HD_1080P,
  );
  const [biliDebounceId, setBiliDebounceId] = useState<number | null>(null);

  const [ytInfo, setYtInfo] = useState<{
    audioFmts: ytdl.videoFormat[];
    videoFmts: ytdl.videoFormat[];
    videoId: string;
    title: string;
  } | null>(null);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytVideoFmt, setYtVideoFmt] = useState<ytdl.videoFormat | undefined>(
    undefined,
  );
  const [ytAudioFmt, setYtAudioFmt] = useState<ytdl.videoFormat | undefined>(
    undefined,
  );
  const [ytDebounceId, setYtDebounceId] = useState<number | null>(null);

  const [notionInput, setNotionInput] = useState("");
  const [notionTitle, setNotionTitle] = useState("");
  const [notionLoading, setNotionLoading] = useState(false);

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
    setUrl("");
    setBiliQualityOptions([]);
    setYtInfo(null);
    setYtVideoFmt(undefined);
    setYtAudioFmt(undefined);
    setNotionInput("");
    setNotionTitle("");
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

  const onBiliUrlChange = useMemoizedFn(async (value: string) => {
    setUrl(value);
    setBiliQualityOptions([]);
    if (biliDebounceId) {
      window.clearTimeout(biliDebounceId);
    }
    if (!value.trim() || !isBilibiliUrl(value)) return;

    setBiliQualityLoading(true);
    const id = window.setTimeout(async () => {
      try {
        const info = await getVideoInfoByUrl(
          value,
          setting.integration.bilibili.credentials,
        );
        if (!info) return;
        const q = await getQualityInfo(
          info.cid,
          info.bvid,
          setting.integration.bilibili.credentials,
        );
        const opts = getQualityOptions(q.accept_quality);
        setBiliQualityOptions(opts);
        const hasLogin = !!setting.integration.bilibili.credentials.SESSDATA;
        const hasVip =
          !!setting.integration.bilibili.userInfo.vipStatus && hasLogin;
        let def = BilibiliVideoQuality.HD_720P;
        if (hasVip) def = opts[0]?.value || BilibiliVideoQuality.HD_1080P;
        else if (hasLogin) {
          const m = Math.max(
            ...opts
              .filter((o) => o.value <= BilibiliVideoQuality.HD_1080P)
              .map((o) => o.value),
          );
          def = m || BilibiliVideoQuality.HD_720P;
        } else {
          const m = Math.max(
            ...opts
              .filter((o) => o.value <= BilibiliVideoQuality.HD_720P)
              .map((o) => o.value),
          );
          def = m || BilibiliVideoQuality.CLEAR_480P;
        }
        setBiliQuality(def);
      } catch {
        setBiliQualityOptions([
          { label: "480P 清晰", value: BilibiliVideoQuality.CLEAR_480P },
          { label: "720P 高清", value: BilibiliVideoQuality.HD_720P },
          {
            label: "1080P 高清",
            value: BilibiliVideoQuality.HD_1080P,
            needLogin: true,
          },
        ]);
        setBiliQuality(BilibiliVideoQuality.HD_720P);
      } finally {
        setBiliQualityLoading(false);
      }
    }, 800);
    setBiliDebounceId(id);
  });

  const onYtUrlChange = useMemoizedFn(async (value: string) => {
    setUrl(value);
    setYtInfo(null);
    setYtVideoFmt(undefined);
    setYtAudioFmt(undefined);
    if (ytDebounceId) {
      window.clearTimeout(ytDebounceId);
    }
    if (!value.trim() || !isYoutubeUrl(value)) return;

    const id = window.setTimeout(async () => {
      const { videoId } = parseYoutubeUrl(value);
      if (!videoId) return;
      setYtLoading(true);
      try {
        const info = await getYoutubeVideoInfo(
          videoId,
          setting.integration.youtube.proxy,
        );
        if (info) {
          setYtInfo(info);
          const bestV =
            info.videoFmts.find((f) => f.quality === "highest") ||
            info.videoFmts[0];
          const bestA =
            info.audioFmts.find((f) => f.quality === "highest") ||
            info.audioFmts[0];
          setYtVideoFmt(bestV);
          setYtAudioFmt(bestA);
        }
      } finally {
        setYtLoading(false);
      }
    }, 800);
    setYtDebounceId(id);
  });

  const onUrlConfirm = useMemoizedFn(async () => {
    if (!url.trim()) {
      message.error("请输入链接");
      return;
    }
    setConfirmLoading(true);
    try {
      await VideoUtil.insertVideoFromUrl(url, board);
      handleClose();
    } finally {
      setConfirmLoading(false);
    }
  });

  const onBiliConfirm = useMemoizedFn(async () => {
    if (!url.trim()) {
      message.error("请输入 Bilibili 链接");
      return;
    }
    setConfirmLoading(true);
    try {
      const quick = await quickCheckBilibiliUrl(url);
      if (!quick.isValid || !quick.bvid) {
        message.error(quick.error || "无效的 Bilibili 链接");
        return;
      }
      const videoInfo = await getVideoInfoByUrl(
        url,
        setting.integration.bilibili.credentials,
      );
      let cid = videoInfo.cid;
      const p = new URL(url).searchParams.get("p");
      if (p && videoInfo.pages) {
        const page = videoInfo.pages[Number(p) - 1];
        cid = page.cid;
      }
      await VideoUtil.insertVideoFromMeta(board, {
        type: "bilibili",
        bvid: videoInfo.bvid,
        cid: cid,
        quality: biliQuality,
      });
      handleClose();
    } finally {
      setConfirmLoading(false);
    }
  });

  const onYtConfirm = useMemoizedFn(async () => {
    const { videoId } = parseYoutubeUrl(url);
    if (!videoId || !ytVideoFmt || !ytAudioFmt) {
      message.error("请选择清晰度");
      return;
    }
    setConfirmLoading(true);
    try {
      await VideoUtil.insertVideoFromMeta(board, {
        type: "youtube",
        videoId,
        videoFormat: ytVideoFmt,
        audioFormat: ytAudioFmt,
      });
      handleClose();
    } finally {
      setConfirmLoading(false);
    }
  });

  const onNotionConfirm = useMemoizedFn(async () => {
    setNotionLoading(true);
    try {
      if (!notionInput.trim()) {
        message.error("请输入 Notion 视频区块 ID 或链接");
        return;
      }
      if (!notionTitle.trim()) {
        message.error("请输入视频标题");
        return;
      }
      const blockId = parseNotionBlockId(notionInput);
      if (!blockId) {
        message.error("无法解析 Block ID，请检查输入格式");
        return;
      }
      const token = setting.integration.notion.token;
      if (!token || !setting.integration.notion.enabled) {
        message.error("请先在设置中配置 Notion 集成");
        return;
      }
      const blockInfo = await getNotionBlockInfo(token, blockId);
      if (!blockInfo.success) {
        message.error(blockInfo.error || "获取 Notion 区块信息失败");
        return;
      }
      if (blockInfo.blockType !== "video") {
        message.error(`该区块不是视频类型，而是 ${blockInfo.blockType} 类型`);
        return;
      }
      await VideoUtil.insertVideoFromMeta(board, {
        type: "notion",
        blockId: blockId,
      });
      message.success("Notion 视频添加成功！");
      handleClose();
    } catch (error) {
      console.error("添加 Notion 视频失败:", error);
      message.error("添加 Notion 视频失败，请检查 Block ID 是否正确");
    } finally {
      setNotionLoading(false);
    }
  });

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
      <Modal
        title="网络视频"
        open={urlModalOpen}
        onCancel={handleClose}
        footer={null}
        width={420}
      >
        <Flex vertical gap={12} style={{ padding: "12px 0" }}>
          <Input
            placeholder="输入视频直链"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button loading={confirmLoading} onClick={onUrlConfirm}>
            添加
          </Button>
        </Flex>
      </Modal>

      {/* Bilibili 弹窗 */}
      <Modal
        title="Bilibili 视频"
        open={biliModalOpen}
        onCancel={handleClose}
        footer={null}
        width={420}
      >
        <Flex vertical gap={12} style={{ padding: "12px 0" }}>
          <Input
            placeholder="输入 Bilibili 链接"
            value={url}
            onChange={(e) => onBiliUrlChange(e.target.value)}
            suffix={
              isBilibiliUrl(url) && biliQualityLoading ? (
                <LoadingOutlined />
              ) : undefined
            }
          />
          {isBilibiliUrl(url) && biliQualityOptions.length > 0 && (
            <Select
              style={{ width: "100%" }}
              value={biliQuality}
              onChange={setBiliQuality}
            >
              {biliQualityOptions.map((opt) => (
                <Select.Option key={opt.value} value={opt.value}>
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span>{opt.label}</span>
                    <div>
                      {opt.needVip && <Tag color="gold">大会员</Tag>}
                      {opt.needLogin && !opt.needVip && (
                        <Tag color="blue">需登录</Tag>
                      )}
                    </div>
                  </div>
                </Select.Option>
              ))}
            </Select>
          )}
          <Button loading={confirmLoading} onClick={onBiliConfirm}>
            添加
          </Button>
        </Flex>
      </Modal>

      {/* YouTube 弹窗 */}
      <Modal
        title="YouTube 视频"
        open={ytModalOpen}
        onCancel={handleClose}
        footer={null}
        width={420}
      >
        <Flex vertical gap={12} style={{ padding: "12px 0" }}>
          <Input
            placeholder="输入 YouTube 链接"
            value={url}
            onChange={(e) => onYtUrlChange(e.target.value)}
            suffix={
              isYoutubeUrl(url) && ytLoading ? <LoadingOutlined /> : undefined
            }
          />
          {isYoutubeUrl(url) && ytInfo && (
            <>
              <Select
                style={{ width: "100%" }}
                options={ytInfo.audioFmts.map((f) => ({
                  label: `${f.audioQuality} / ${f.container || f.mimeType || ""}`,
                  value: f.itag,
                }))}
                value={ytAudioFmt?.itag}
                onChange={(itag) =>
                  setYtAudioFmt(
                    ytInfo.audioFmts.find(
                      (f) => f.itag === itag,
                    ) as ytdl.videoFormat,
                  )
                }
                placeholder="选择音频清晰度"
              />
              <Select
                style={{ width: "100%" }}
                options={ytInfo.videoFmts.map((f) => ({
                  label: `${f.qualityLabel} / ${f.container || f.mimeType || ""}`,
                  value: f.itag,
                }))}
                value={ytVideoFmt?.itag}
                onChange={(itag) =>
                  setYtVideoFmt(
                    ytInfo.videoFmts.find(
                      (f) => f.itag === itag,
                    ) as ytdl.videoFormat,
                  )
                }
                placeholder="选择视频清晰度"
              />
            </>
          )}
          <Button
            disabled={isYoutubeUrl(url) && (!ytVideoFmt || !ytAudioFmt)}
            loading={confirmLoading}
            onClick={onYtConfirm}
          >
            添加
          </Button>
        </Flex>
      </Modal>

      {/* Notion 弹窗 */}
      <Modal
        title="Notion 视频"
        open={notionModalOpen}
        onCancel={handleClose}
        footer={null}
        width={420}
      >
        <Flex vertical gap={12} style={{ padding: "12px 0" }}>
          <Input.TextArea
            placeholder={
              "请输入 Notion 视频区块 ID 或链接\n例如：\n- 3b628e1d-84da-4c6c-900d-b6e4a28532e1\n- https://www.notion.so/...#3b628e1d84da4c6c900db6e4a28532e1"
            }
            value={notionInput}
            onChange={(e) => setNotionInput(e.target.value)}
            rows={4}
          />
          <Input
            placeholder="请输入视频标题（必填）"
            value={notionTitle}
            onChange={(e) => setNotionTitle(e.target.value)}
          />
          <div style={{ fontSize: 12, color: "#8c8c8c" }}>
            <p>支持的输入格式：</p>
            <ul style={{ marginBottom: 0, paddingLeft: 16 }}>
              <li>Block ID: 3b628e1d-84da-4c6c-900d-b6e4a28532e1</li>
              <li>Notion 链接（包含 # 后的 ID）</li>
            </ul>
          </div>
          <Button loading={notionLoading} onClick={onNotionConfirm}>
            添加
          </Button>
        </Flex>
      </Modal>

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
