import useSettingStore from "@/stores/useSettingStore.ts";
import { Button, Card, List, App, Tag, Typography, Space, Empty } from "antd";
import { produce } from "immer";
import { ModelItem, ConfigItem } from "../types";
import { EditOutlined, PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import styles from "./ModelDetails.module.less";

interface ModelDetailsProps {
  onAddModel: () => void;
  onEditModel: (model: ModelItem) => void;
  configId: string;
  onEditConfig: (config: ConfigItem) => void;
}

const ModelDetails = ({
  onAddModel,
  onEditModel,
  configId,
  onEditConfig,
}: ModelDetailsProps) => {
  const { config } = useSettingStore((state) => {
    return {
      config: state.setting.llmConfigs.find((item) => item.id === configId),
    };
  });

  const { modal } = App.useApp();

  const onDeleteModel = (name: string) => {
    modal.confirm({
      title: "确定删除此模型吗？",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
      onOk: () => {
        useSettingStore.setState(
          produce((draft) => {
            const config = draft.setting.llmConfigs.find(
              (item: any) => item.id === configId,
            );
            if (config && config.models) {
              config.models = config.models.filter(
                (item: any) => item.name !== name,
              );
            }
          }),
        );
      },
    });
  };

  const renderFeatureTags = (features: ModelItem["features"]) => {
    const featureConfig = features || {
      online: false,
      thinking: false,
      multimodal: false,
    };
    const featureTags = [];
    if (featureConfig.online)
      featureTags.push(
        <Tag color="blue" key="online">
          联网
        </Tag>,
      );
    if (featureConfig.thinking)
      featureTags.push(
        <Tag color="purple" key="thinking">
          思考
        </Tag>,
      );
    if (featureConfig.multimodal)
      featureTags.push(
        <Tag color="orange" key="multimodal">
          多模态
        </Tag>,
      );
    if (featureTags.length === 0)
      featureTags.push(<Tag key="none">无特殊功能</Tag>);
    return featureTags;
  };

  if (!config) {
    return null;
  }

  return (
    <div className={styles.container}>
      <Card
        className={styles.configCard}
        title={
          <Space>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {config.name}
            </Typography.Title>
            <Button
              type="text"
              icon={<EditOutlined />}
              size="small"
              onClick={() => onEditConfig(config)}
            >
              编辑配置
            </Button>
          </Space>
        }
      >
        <div className={styles.configInfo}>
          <div className={styles.infoItem}>
            <Typography.Text type="secondary">Base URL:</Typography.Text>
            <Typography.Text code className={styles.configValue}>
              {config.baseUrl}
            </Typography.Text>
          </div>
          <div className={styles.infoItem}>
            <Typography.Text type="secondary">API Key:</Typography.Text>
            <Typography.Text code className={styles.configValue}>
              ********
            </Typography.Text>
          </div>
        </div>
      </Card>

      <Card
        className={styles.modelsCard}
        title="模型列表"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={onAddModel}
            size="small"
          >
            添加模型
          </Button>
        }
      >
        {config.models && config.models.length > 0 ? (
          <List
            dataSource={config.models}
            renderItem={(model) => (
              <List.Item
                className={styles.modelItem}
                actions={[
                  <Button
                    key="edit"
                    type="text"
                    size="small"
                    onClick={() => onEditModel(model)}
                  >
                    编辑
                  </Button>,
                  <Button
                    key="delete"
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => onDeleteModel(model.name)}
                  />,
                ]}
              >
                <List.Item.Meta
                  title={<Typography.Text strong>{model.name}</Typography.Text>}
                  description={
                    <div className={styles.modelDescription}>
                      <div>{model.description}</div>
                      <div className={styles.features}>
                        {renderFeatureTags(model.features)}
                      </div>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty
            description="暂无模型配置"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ padding: "40px 0" }}
          />
        )}
      </Card>
    </div>
  );
};

export default ModelDetails;
