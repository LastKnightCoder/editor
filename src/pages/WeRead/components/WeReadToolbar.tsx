import { memo } from "react";
import { Button, Typography, Space, Tag } from "antd";
import { ReloadOutlined, LoginOutlined, BookOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

const { Title, Text } = Typography;

interface WeReadToolbarProps {
  isConnected: boolean;
  userName?: string;
  lastSyncedAt: number | null;
  syncing: boolean;
  onQuickLogin: () => void;
  onSync: () => void;
}

export const WeReadToolbar: React.FC<WeReadToolbarProps> = memo((props) => {
  const { isConnected, userName, lastSyncedAt, syncing, onQuickLogin, onSync } =
    props;

  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <Title level={4} className="!mb-1 flex items-center gap-2">
          <BookOutlined />
          微信读书
        </Title>
        <Space size="small">
          <Text type="secondary">
            {isConnected
              ? `已登录：${userName || "已连接账号"}`
              : "尚未连接微信读书账号"}
          </Text>
          {lastSyncedAt && (
            <Tag color="blue">
              上次同步：{dayjs(lastSyncedAt).format("YYYY-MM-DD HH:mm")}
            </Tag>
          )}
        </Space>
      </div>
      <Space>
        {!isConnected && (
          <Button
            icon={<LoginOutlined />}
            onClick={onQuickLogin}
            disabled={syncing}
          >
            扫码登录
          </Button>
        )}
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          onClick={onSync}
          loading={syncing}
          disabled={!isConnected}
        >
          同步
        </Button>
      </Space>
    </div>
  );
});

WeReadToolbar.displayName = "WeReadToolbar";
