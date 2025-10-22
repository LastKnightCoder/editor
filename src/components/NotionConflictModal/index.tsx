import { memo, useState } from "react";
import { Modal, Button, Space, Typography, Alert } from "antd";
import { Descendant } from "slate";
import Editor from "@/components/Editor";
import { useDynamicExtensions } from "@/hooks";
import styles from "./index.module.less";

const { Text } = Typography;

interface NotionConflictModalProps {
  open: boolean;
  localContent: Descendant[];
  notionContent: Descendant[];
  onUseLocal: () => void;
  onUseNotion: () => void;
  onCancel: () => void;
}

const NotionConflictModal = memo((props: NotionConflictModalProps) => {
  const {
    open,
    localContent,
    notionContent,
    onUseLocal,
    onUseNotion,
    onCancel,
  } = props;

  const extensions = useDynamicExtensions();
  const [resolving, setResolving] = useState(false);

  const handleUseLocal = async () => {
    if (resolving) return;
    setResolving(true);
    try {
      await onUseLocal();
    } finally {
      setResolving(false);
    }
  };

  const handleUseNotion = async () => {
    if (resolving) return;
    setResolving(true);
    try {
      await onUseNotion();
    } finally {
      setResolving(false);
    }
  };

  return (
    <Modal
      title="检测到内容冲突"
      open={open}
      onCancel={onCancel}
      width="90vw"
      style={{ top: 20 }}
      footer={
        <Space>
          <Button onClick={onCancel} disabled={resolving}>
            取消
          </Button>
          <Button onClick={handleUseLocal} loading={resolving}>
            使用本地版本
          </Button>
          <Button type="primary" onClick={handleUseNotion} loading={resolving}>
            使用 Notion 版本
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Alert
          message="本地和 Notion 的内容都已修改，请选择要保留的版本"
          description="选择的版本将覆盖另一个版本的内容，请谨慎选择"
          type="warning"
          showIcon
        />

        <div className={styles.compareContainer}>
          {/* 本地版本 */}
          <div className={styles.versionPanel}>
            <div className={styles.versionHeader}>
              <Text strong>本地版本</Text>
            </div>
            <div className={styles.editorContainer}>
              <Editor
                initValue={localContent}
                readonly={true}
                extensions={extensions}
              />
            </div>
          </div>

          {/* 分隔线 */}
          <div className={styles.divider}></div>

          {/* Notion 版本 */}
          <div className={styles.versionPanel}>
            <div className={styles.versionHeader}>
              <Text strong>Notion 版本</Text>
            </div>
            <div className={styles.editorContainer}>
              <Editor
                initValue={notionContent}
                readonly={true}
                extensions={extensions}
              />
            </div>
          </div>
        </div>
      </Space>
    </Modal>
  );
});

export default NotionConflictModal;
