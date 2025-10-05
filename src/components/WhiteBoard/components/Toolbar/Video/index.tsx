import React, { useRef, useState } from "react";
import SVG from "react-inlinesvg";
import {
  App,
  Button,
  Flex,
  Input,
  Popover,
  Select,
  Tabs,
  Tooltip,
  Tag,
} from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import videoIcon from "@/assets/white-board/video.svg";

import { useBoard } from "../../../hooks";
import { VideoUtil } from "../../../utils";
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
import useSettingStore from "@/stores/useSettingStore";
import ytdl from "@distube/ytdl-core";

interface ImageProps {
  className?: string;
  style?: React.CSSProperties;
}

const Video = (props: ImageProps) => {
  const { className, style } = props;
  const board = useBoard();

  const videoInputRef = useRef<HTMLInputElement>(null);
  const { setting } = useSettingStore.getState();

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

  const [popoverOpen, setPopoverOpen] = useState(false);
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

  const onUrlChange = useMemoizedFn(async (value: string) => {
    setUrl(value);
    setBiliQualityOptions([]);
    setYtInfo(null);
    setYtVideoFmt(undefined);
    setYtAudioFmt(undefined);
    if (biliDebounceId) {
      window.clearTimeout(biliDebounceId);
    }
    if (ytDebounceId) {
      window.clearTimeout(ytDebounceId);
    }
    if (!value.trim()) return;
    if (isBilibiliUrl(value)) {
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
          // 默认值
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
    } else if (isYoutubeUrl(value)) {
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
    }
  });

  const onConfirm = useMemoizedFn(async () => {
    if (!url.trim()) {
      message.error("请输入链接");
      return;
    }
    setConfirmLoading(true);
    try {
      if (isBilibiliUrl(url)) {
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
      } else if (isYoutubeUrl(url)) {
        const { videoId } = parseYoutubeUrl(url);
        if (!videoId || !ytVideoFmt || !ytAudioFmt) {
          message.error("请选择清晰度");
          return;
        }
        await VideoUtil.insertVideoFromMeta(board, {
          type: "youtube",
          videoId,
          videoFormat: ytVideoFmt,
          audioFormat: ytAudioFmt,
        });
      } else {
        await VideoUtil.insertVideoFromUrl(url, board);
      }
      setPopoverOpen(false);
      setUrl("");
      setBiliQualityOptions([]);
      setYtInfo(null);
    } finally {
      setConfirmLoading(false);
    }
  });

  return (
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
                  key: "url",
                  label: "网络地址",
                  children: (
                    <Flex vertical gap={8}>
                      <Input
                        placeholder="输入视频直链"
                        value={url}
                        onChange={(e) => onUrlChange(e.target.value)}
                      />
                      <Button loading={confirmLoading} onClick={onConfirm}>
                        添加
                      </Button>
                    </Flex>
                  ),
                },
                {
                  key: "bilibili",
                  label: "Bilibili",
                  children: (
                    <Flex vertical gap={8}>
                      <Input
                        placeholder="输入 Bilibili 链接"
                        value={url}
                        onChange={(e) => onUrlChange(e.target.value)}
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
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                }}
                              >
                                <span>{opt.label}</span>
                                <div>
                                  {opt.needVip && (
                                    <Tag color="gold">大会员</Tag>
                                  )}
                                  {opt.needLogin && !opt.needVip && (
                                    <Tag color="blue">需登录</Tag>
                                  )}
                                </div>
                              </div>
                            </Select.Option>
                          ))}
                        </Select>
                      )}
                      <Button loading={confirmLoading} onClick={onConfirm}>
                        添加
                      </Button>
                    </Flex>
                  ),
                },
                {
                  key: "youtube",
                  label: "YouTube",
                  children: (
                    <Flex vertical gap={8}>
                      <Input
                        placeholder="输入 YouTube 链接"
                        value={url}
                        onChange={(e) => onUrlChange(e.target.value)}
                        suffix={
                          isYoutubeUrl(url) && ytLoading ? (
                            <LoadingOutlined />
                          ) : undefined
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
                        disabled={
                          isYoutubeUrl(url) && (!ytVideoFmt || !ytAudioFmt)
                        }
                        loading={confirmLoading}
                        onClick={onConfirm}
                      >
                        添加
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
  );
};

export default Video;
