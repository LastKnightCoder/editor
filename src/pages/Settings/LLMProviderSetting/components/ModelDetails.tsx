import useSettingStore from "@/stores/useSettingStore.ts";
import { Button, Card, List, App, Tag, Typography, Space, Empty } from "antd";
import { produce } from "immer";
import { ModelItem, ConfigItem } from "../types";
import {
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
} from "@ant-design/icons";

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

  const { modal, message } = App.useApp();

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

  const onCopyApiKey = () => {
    if (config) {
      navigator.clipboard.writeText(config.apiKey);
      message.success("API Key 已复制到剪贴板");
    }
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
    <div className="flex flex-col gap-4">
      <Card
        className="!mb-4 border border-gray-200"
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
              className="text-blue-500 hover:text-blue-700"
            >
              编辑配置
            </Button>
          </Space>
        }
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Typography.Text type="secondary">Base URL:</Typography.Text>
            <Typography.Text className="text-gray-800">
              {config.baseUrl}
            </Typography.Text>
          </div>
          <div className="flex items-center gap-2">
            <Typography.Text type="secondary">API Key:</Typography.Text>
            <Typography.Text className="text-gray-800">
              ********
            </Typography.Text>
            <CopyOutlined
              onClick={onCopyApiKey}
              className="cursor-pointer hover:text-blue-500"
            />
          </div>
        </div>
      </Card>

      <Card
        className="flex flex-col gap-4 border border-gray-200"
        title="模型列表"
        extra={
          <Button
            icon={<PlusOutlined />}
            onClick={onAddModel}
            className="text-green-600 hover:text-green-800"
          >
            添加模型
          </Button>
        }
      >
        {config.models && config.models.length > 0 ? (
          <List
            dataSource={config.models}
            className="overflow-y-auto pr-2! max-h-[250px] border-b border-b-[20px] border-b-transparent"
            renderItem={(model) => (
              <List.Item
                className="flex items-center border-b border-gray-100 py-2 px-0 transition"
                actions={[
                  <Button
                    key="edit"
                    type="text"
                    size="small"
                    onClick={() => onEditModel(model)}
                    className="text-blue-500 hover:text-blue-700"
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
                    className="hover:text-red-600"
                  />,
                ]}
              >
                <List.Item.Meta
                  title={<Typography.Text strong>{model.name}</Typography.Text>}
                  description={
                    <div className="flex flex-col gap-1">
                      <div>{model.description}</div>
                      <div className="flex gap-2 flex-wrap">
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
