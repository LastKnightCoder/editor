import { useState } from "react";
import { Input, Button, Spin, Alert } from "antd";
import { LinkOutlined, LoadingOutlined } from "@ant-design/icons";
import {
  parseXiaoyuzhouUrl,
  fetchXiaoyuzhouEpisode,
  XiaoyuzhouEpisodeInfo,
} from "@/commands/xiaoyuzhou";
import CustomModal from "@/components/CustomModal";
import styles from "./XiaoyuzhouInput.module.less";

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
  const [episodeInfo, setEpisodeInfo] = useState<XiaoyuzhouEpisodeInfo | null>(
    null,
  );

  const handleParse = async () => {
    if (!url.trim()) return;
    setError("");
    setEpisodeInfo(null);

    const parsed = await parseXiaoyuzhouUrl(url.trim());
    if (!parsed) {
      setError(
        "无效的小宇宙链接，请输入类似 https://www.xiaoyuzhoufm.com/episode/... 的链接",
      );
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
    <CustomModal
      open={open}
      onCancel={handleClose}
      title="添加小宇宙播客"
      footer={null}
      width={480}
    >
      <div className={styles.container}>
        <div className={styles.inputRow}>
          <Input
            placeholder="粘贴小宇宙播客链接..."
            prefix={<LinkOutlined />}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPressEnter={handleParse}
            disabled={loading}
          />
          <Button type="primary" onClick={handleParse} loading={loading}>
            解析
          </Button>
        </div>

        {error && <Alert type="error" message={error} showIcon />}

        {loading && (
          <div className={styles.loadingState}>
            <Spin indicator={<LoadingOutlined />} />
            <span>正在解析播客信息...</span>
          </div>
        )}

        {episodeInfo && (
          <div className={styles.preview}>
            {episodeInfo.coverUrl && (
              <img
                className={styles.previewCover}
                src={episodeInfo.coverUrl}
                alt=""
              />
            )}
            <div className={styles.previewInfo}>
              <div className={styles.previewTitle}>
                {episodeInfo.title || "未知标题"}
              </div>
              {episodeInfo.podcastName && (
                <div className={styles.previewPodcast}>
                  {episodeInfo.podcastName}
                </div>
              )}
              {episodeInfo.duration && (
                <div className={styles.previewDuration}>
                  时长: {Math.floor(episodeInfo.duration / 60)} 分钟
                </div>
              )}
            </div>
          </div>
        )}

        {episodeInfo && (
          <div className={styles.footer}>
            <Button onClick={handleClose}>取消</Button>
            <Button type="primary" onClick={handleConfirm}>
              添加
            </Button>
          </div>
        )}
      </div>
    </CustomModal>
  );
};

export default XiaoyuzhouInput;
