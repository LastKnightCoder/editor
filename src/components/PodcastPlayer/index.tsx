import { memo, useCallback } from "react";
import { Card, Button, Tag, Space, Popconfirm } from "antd";
import { PlayCircleOutlined, DeleteOutlined } from "@ant-design/icons";
import type { IPodcast } from "@/types/podcast";
import LocalAudio from "@/components/LocalAudio";

import styles from "./index.module.less";

interface PodcastPlayerProps {
  podcast: IPodcast;
  onDelete?: () => void;
}

const PodcastPlayer = memo<PodcastPlayerProps>(({ podcast, onDelete }) => {
  const formatDuration = useCallback((seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }, []);

  return (
    <Card
      className={styles.container}
      size="small"
      title={
        <Space>
          <PlayCircleOutlined />
          <span>播客音频</span>
          <Tag color="blue">{formatDuration(podcast.duration)}</Tag>
        </Space>
      }
      extra={
        onDelete && (
          <Popconfirm
            title="确定要删除这个播客吗？"
            description="删除后无法恢复"
            onConfirm={onDelete}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        )
      }
    >
      <LocalAudio controls className={styles.audio} src={podcast.audioUrl} />
    </Card>
  );
});

export default PodcastPlayer;
