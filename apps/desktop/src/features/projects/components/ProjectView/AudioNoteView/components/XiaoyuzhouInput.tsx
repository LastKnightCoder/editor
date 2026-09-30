import { useState } from "react";
import { Button, Dialog, DialogBody, Input } from "@tau/ui";
import { Link, Loader2, CircleAlert } from "lucide-react";
import {
  parseXiaoyuzhouUrl,
  fetchXiaoyuzhouEpisode,
  XiaoyuzhouEpisodeInfo,
} from "@/commands/xiaoyuzhou";

interface XiaoyuzhouInputProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: {
    episodeId: string;
    audioUrl: string;
    title?: string;
    podcastName?: string;
    coverUrl?: string;
  }) => void;
}

const XiaoyuzhouInput = (props: XiaoyuzhouInputProps) => {
  const { open, onClose, onConfirm } = props;

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [episodeInfo, setEpisodeInfo] = useState<XiaoyuzhouEpisodeInfo | null>(null);

  const handleParse = async () => {
    if (!url.trim()) return;
    setError("");
    setEpisodeInfo(null);

    const parsed = await parseXiaoyuzhouUrl(url.trim());
    if (!parsed) {
      setError("无效的小宇宙链接，请输入类似 https://www.xiaoyuzhoufm.com/episode/... 的链接");
      return;
    }

    setLoading(true);
    try {
      const info = await fetchXiaoyuzhouEpisode(url.trim());
      if (!info || !info.audioUrl) {
        setError("无法解析音频地址，请检查链接是否正确");
        return;
      }
      setEpisodeInfo(info);
    } catch (e) {
      setError("解析失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!episodeInfo?.audioUrl) return;
    onConfirm({
      episodeId: episodeInfo.episodeId,
      audioUrl: episodeInfo.audioUrl,
      title: episodeInfo.title,
      podcastName: episodeInfo.podcastName,
      coverUrl: episodeInfo.coverUrl,
    });
    setUrl("");
    setEpisodeInfo(null);
    setError("");
  };

  const handleClose = () => {
    setUrl("");
    setEpisodeInfo(null);
    setError("");
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && handleClose()}
      title="添加小宇宙播客"
      width={480}
      footer={
        episodeInfo && (
          <>
            <Button variant="secondary" size="sm" onClick={handleClose}>
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={handleConfirm}>
              添加
            </Button>
          </>
        )
      }
    >
      <DialogBody className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Input
            data-autofocus
            placeholder="粘贴小宇宙播客链接..."
            lead={Link}
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) handleParse();
            }}
            disabled={loading}
          />
          <Button variant="primary" onClick={handleParse} loading={loading}>
            解析
          </Button>
        </div>

        {error && (
          <div className="bg-danger-soft text-danger rounded-tau-sm flex items-center gap-2 px-3 py-2 text-[12.5px]">
            <CircleAlert className="size-4 shrink-0" strokeWidth={1.75} />
            {error}
          </div>
        )}

        {loading && (
          <div className="text-ink-2 flex items-center justify-center gap-2 p-4 text-[13px]">
            <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
            <span>正在解析播客信息...</span>
          </div>
        )}

        {episodeInfo && (
          <div className="border-line-1 flex gap-3 rounded-[8px] border p-3">
            {episodeInfo.coverUrl && (
              <img
                className="size-14 shrink-0 rounded-[8px] object-cover"
                src={episodeInfo.coverUrl}
                alt=""
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-ink-1 mb-1 truncate text-[14px] font-medium">
                {episodeInfo.title || "未知标题"}
              </div>
              {episodeInfo.podcastName && (
                <div className="text-ink-2 mb-0.5 text-[12px]">{episodeInfo.podcastName}</div>
              )}
              {episodeInfo.duration && (
                <div className="text-ink-3 text-[12px]">
                  时长: {Math.floor(episodeInfo.duration / 60)} 分钟
                </div>
              )}
            </div>
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
};

export default XiaoyuzhouInput;
