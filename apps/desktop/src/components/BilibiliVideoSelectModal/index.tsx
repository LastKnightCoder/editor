import React, { useState, useCallback, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { Tv } from "lucide-react";
import { Button, Dialog, DialogBody, Select } from "@tau/ui";
import {
  isBilibiliUrl,
  getVideoInfoByUrl,
  getQualityInfo,
  getQualityOptions,
} from "@/utils/bilibili";
import useSettingStore from "@/stores/useSettingStore";
import type { BiliBiliVideoMetaInfo } from "@/types";
import {
  ResourceSelectError,
  ResourceSelectField,
  ResourceSelectInput,
  ResourceSelectPreview,
} from "@/components/ResourceSelectDialog";

export interface BilibiliVideoSelectResult {
  url: string;
  metaInfo: BiliBiliVideoMetaInfo;
  title: string;
  thumbnail?: string;
}

interface BilibiliVideoSelectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (result: BilibiliVideoSelectResult) => void;
  initialUrl?: string;
}

const BilibiliVideoSelectModal: React.FC<BilibiliVideoSelectModalProps> = ({
  open,
  onCancel,
  onConfirm,
  initialUrl = "",
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [step, setStep] = useState<"input" | "config">("input");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<{
    bvid: string;
    cid: string;
    title: string;
    cover: string;
    qualityOptions: Array<{
      label: string;
      value: number;
      needLogin?: boolean;
      needVip?: boolean;
    }>;
  } | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<number>(80);
  const { setting } = useSettingStore.getState();

  useEffect(() => {
    if (open) {
      setUrl(initialUrl);
      setStep("input");
      setError(null);
      setVideoInfo(null);
      setSelectedQuality(80);
    }
  }, [open, initialUrl]);

  const handleAnalyze = useMemoizedFn(async () => {
    if (!url.trim()) {
      setError("请输入 Bilibili 链接");
      return;
    }

    if (!isBilibiliUrl(url)) {
      setError("请输入有效的 Bilibili 链接");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const credentials = setting.integration.bilibili.credentials;
      const info = await getVideoInfoByUrl(url, credentials);

      if (!info) {
        setError("无法获取视频信息，请检查链接是否正确");
        return;
      }

      const qualityInfo = await getQualityInfo(info.cid, info.bvid, credentials);
      const options = getQualityOptions(qualityInfo.accept_quality);

      if (options.length === 0) {
        setError("未找到可用的清晰度选项");
        return;
      }

      // 设置默认质量
      const hasLogin = !!credentials.SESSDATA;
      const hasVip = !!setting.integration.bilibili.userInfo.vipStatus && hasLogin;
      let defaultQuality: number;
      if (hasVip) {
        defaultQuality = options[0]?.value || 80;
      } else if (hasLogin) {
        const maxQuality = Math.max(
          ...options.filter(opt => opt.value <= 80).map(opt => opt.value)
        );
        defaultQuality = maxQuality || 64;
      } else {
        const maxQuality = Math.max(
          ...options.filter(opt => opt.value <= 64).map(opt => opt.value)
        );
        defaultQuality = maxQuality || 32;
      }

      setVideoInfo({
        bvid: info.bvid,
        cid: info.cid,
        title: info.title,
        cover: info.cover,
        qualityOptions: options,
      });
      setSelectedQuality(defaultQuality);
      setStep("config");
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败，请稍后重试");
    } finally {
      setIsAnalyzing(false);
    }
  });

  const handleSubmit = useMemoizedFn(() => {
    if (!videoInfo) return;

    const selectedOption = videoInfo.qualityOptions.find(opt => opt.value === selectedQuality);

    if (!selectedOption) {
      setError("请选择清晰度");
      return;
    }

    onConfirm({
      url,
      metaInfo: {
        type: "bilibili",
        bvid: videoInfo.bvid,
        cid: videoInfo.cid,
        quality: selectedQuality,
      },
      title: videoInfo.title,
      thumbnail: videoInfo.cover,
    });
  });

  const handleBack = useCallback(() => {
    setStep("input");
    setVideoInfo(null);
    setSelectedQuality(80);
    setError(null);
  }, []);

  const isConfig = step === "config" && !!videoInfo;

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onCancel()}
      title="添加 Bilibili 视频"
      subtitle={isConfig ? undefined : "粘贴视频链接，解析后选择清晰度"}
      icon={<Tv className="size-4" strokeWidth={1.75} />}
      locked={isAnalyzing}
      footer={
        isConfig ? (
          <>
            <Button variant="secondary" size="sm" onClick={handleBack}>
              返回
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmit}>
              确认添加
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="sm" disabled={isAnalyzing} onClick={onCancel}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={isAnalyzing}
              loadingText="正在解析…"
              disabled={!url.trim()}
              onClick={handleAnalyze}
            >
              解析视频
            </Button>
          </>
        )
      }
    >
      <DialogBody>
        {isConfig ? (
          <div className="flex flex-col gap-3.5">
            <ResourceSelectPreview
              cover={videoInfo.cover}
              title={videoInfo.title}
              meta="Bilibili"
            />
            <ResourceSelectField label="清晰度">
              <Select
                aria-label="清晰度"
                value={selectedQuality}
                onValueChange={v => setSelectedQuality(v)}
                options={videoInfo.qualityOptions.map(opt => ({
                  value: opt.value,
                  label: `${opt.label}${opt.needVip ? " · 大会员" : opt.needLogin ? " · 需登录" : ""}`,
                }))}
              />
            </ResourceSelectField>
            {error && <ResourceSelectError text={error} />}
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <ResourceSelectField label="视频链接">
              <ResourceSelectInput
                data-autofocus
                type="url"
                value={url}
                onChange={e => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                placeholder="https://www.bilibili.com/video/BV…"
                disabled={isAnalyzing}
                onKeyDown={e => e.key === "Enter" && !isAnalyzing && handleAnalyze()}
              />
            </ResourceSelectField>
            {error && <ResourceSelectError text={error} />}
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
};

export default BilibiliVideoSelectModal;
