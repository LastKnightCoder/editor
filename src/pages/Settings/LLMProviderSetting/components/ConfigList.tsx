import useSettingStore from "@/stores/useSettingStore.ts";
import { Button, Card, List, App, Tag, Typography, Space } from "antd";
import { produce } from "immer";
import { ConfigItem } from "../types";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import styles from "./ConfigList.module.less";

interface ConfigListProps {
  onAddConfig: () => void;
  onEditConfig: (config: ConfigItem) => void;
  selectedConfigId: string;
  onSelectConfig: (configId: string) => void;
}

const ConfigList = ({
  onAddConfig,
  onEditConfig,
  selectedConfigId,
  onSelectConfig,
}: ConfigListProps) => {
  const { configs } = useSettingStore((state) => ({
    configs: state.setting.llmConfigs,
  }));
  const { modal } = App.useApp();

  const onDeleteConfig = (id: string) => {
    modal.confirm({
      title: "确定删除此配置吗？",
      onOk: () => {
        useSettingStore.setState(
          produce((draft) => {
            const index = draft.setting.llmConfigs.findIndex(
              (item: any) => item.id === id,
            );
            if (index === -1) {
              return;
            }
            draft.setting.llmConfigs.splice(index, 1);
          }),
        );
        // 如果删除的是当前选中的配置，清空选中
        if (id === selectedConfigId) {
          onSelectConfig("");
        }
      },
    });
  };

  const handleItemClick = (config: ConfigItem) => {
    onSelectConfig(config.id);
  };

  return (
    <Card
      title="LLM 配置"
      className={styles.configCard}
      extra={
        <Button
          type="text"
          icon={<PlusOutlined />}
          onClick={onAddConfig}
          size="small"
        >
          添加
        </Button>
      }
    >
      <List
        className={styles.configList}
        dataSource={configs}
        renderItem={(config) => (
          <List.Item
            className={`${styles.configItem} ${
              config.id === selectedConfigId ? styles.selected : ""
            }`}
            onClick={() => handleItemClick(config)}
            actions={[
              <Button
                key="edit"
                type="text"
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditConfig(config);
                }}
              >
                编辑
              </Button>,
              <Button
                key="delete"
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteConfig(config.id);
                }}
              />,
            ]}
          >
            <List.Item.Meta
              title={
                <Space>
                  <Typography.Text strong>{config.name}</Typography.Text>
                  {config.id === selectedConfigId && (
                    <Tag color="blue">已选中</Tag>
                  )}
                </Space>
              }
              description={
                <div className={styles.configDescription}>
                  <div>API Key: ********</div>
                  <div className={styles.baseUrl}>{config.baseUrl}</div>
                  <div className={styles.modelCount}>
                    {config.models?.length || 0} 个模型
                  </div>
                </div>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
};

export default ConfigList;
