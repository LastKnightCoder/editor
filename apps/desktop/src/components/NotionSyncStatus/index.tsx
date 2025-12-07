import { memo, useState } from "react";
import { Dropdown, App } from "antd";
import {
  SyncOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  DisconnectOutlined,
  GlobalOutlined,
} from "@ant-design/icons";
import { NotionSync } from "@/types";
import classnames from "classnames";
import styles from "./index.module.less";

export type SyncStatus = "synced" | "syncing" | "error" | "pending";

interface NotionSyncStatusProps {
  notionSync: NotionSync;
  status: SyncStatus;
  onManualSync: () => void;
  onSyncFromNotion: () => void;
  onDisconnect: () => void;
  onOpenInNotion: () => void;
}

const NotionSyncStatus = memo((props: NotionSyncStatusProps) => {
  const {
    notionSync,
    status,
    onManualSync,
    onSyncFromNotion,
    onDisconnect,
    onOpenInNotion,
  } = props;
  const { modal } = App.useApp();
  const [loading, setLoading] = useState(false);

  const handleManualSync = async () => {
    setLoading(true);
    try {
      await onManualSync();
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    modal.confirm({
      title: "断开 Notion 关联",
      content: "确定要断开与 Notion 的关联吗？本地内容将被保留。",
      onOk: async () => {
        await onDisconnect();
      },
    });
  };

  const getStatusIcon = () => {
    if (loading || status === "syncing") {
      return <LoadingOutlined className={styles.iconSyncing} />;
    }

    switch (status) {
      case "synced":
        return <CheckCircleOutlined className={styles.iconSynced} />;
      case "error":
        return <ExclamationCircleOutlined className={styles.iconError} />;
      case "pending":
        return <SyncOutlined className={styles.iconPending} />;
      default:
        return <SyncOutlined />;
    }
  };

  const getStatusText = () => {
    if (loading) return "同步中...";

    switch (status) {
      case "synced":
        return "已同步";
      case "syncing":
        return "同步中...";
      case "error":
        return notionSync.syncError || "同步失败";
      case "pending":
        return "待同步";
      default:
        return "未知状态";
    }
  };

  const menuItems = [
    {
      key: "sync",
      label: "同步到 Notion",
      icon: <SyncOutlined />,
      onClick: handleManualSync,
      disabled: loading || status === "syncing",
    },
    {
      key: "sync-from-notion",
      label: "从 Notion 同步",
      icon: <SyncOutlined style={{ transform: "rotate(180deg)" }} />,
      onClick: onSyncFromNotion,
      disabled: loading || status === "syncing",
    },
    {
      key: "open",
      label: "在 Notion 中打开",
      icon: <GlobalOutlined />,
      onClick: onOpenInNotion,
    },
    {
      type: "divider" as const,
    },
    {
      key: "disconnect",
      label: "断开关联",
      icon: <DisconnectOutlined />,
      onClick: handleDisconnect,
      danger: true,
    },
  ];

  return (
    <div className={styles.container}>
      <Dropdown
        menu={{ items: menuItems }}
        trigger={["click"]}
        placement="bottomRight"
      >
        <div
          className={classnames(styles.statusButton, {
            [styles.synced]: status === "synced",
            [styles.syncing]: status === "syncing" || loading,
            [styles.error]: status === "error",
            [styles.pending]: status === "pending",
          })}
        >
          {getStatusIcon()}
          <span className={styles.statusText}>{getStatusText()}</span>
        </div>
      </Dropdown>
    </div>
  );
});

export default NotionSyncStatus;
