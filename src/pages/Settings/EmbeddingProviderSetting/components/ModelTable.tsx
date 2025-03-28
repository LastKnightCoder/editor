import useSettingStore from "@/stores/useSettingStore.ts";
import { Button, Flex, Table, TableColumnsType, App, Tag } from "antd";
import { produce } from "immer";
import { ModelItem, ConfigItem } from "../types";
import {
  clearVecDocumentTable,
  initVecDocumentTable,
} from "@/commands/vec-document";

interface ModelTableProps {
  onAddModel: () => void;
  onEditModel: (model: ModelItem) => void;
}

const ModelTable = ({ onAddModel, onEditModel }: ModelTableProps) => {
  const { currentConfig } = useSettingStore((state) => {
    const settings = state.setting.embeddingProvider;
    const { configs, currentConfigId } = settings;
    return {
      currentConfig: configs.find((item) => item.id === currentConfigId),
    };
  });

  const { modal } = App.useApp();

  const onActivateModel = (name: string, contextLength: number) => {
    modal.confirm({
      title: "切换嵌入模型",
      content: "不同的嵌入模型不能共用，之前的嵌入数据将会被删除，是否继续？",
      okText: "确认",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
      onOk: async () => {
        try {
          // 清除现有向量数据
          await clearVecDocumentTable();

          await initVecDocumentTable(contextLength);

          // 更新模型名称
          useSettingStore.setState(
            produce((draft) => {
              const index = draft.setting.embeddingProvider.configs.findIndex(
                (item: ConfigItem) => item.id === currentConfig?.id,
              );
              if (index !== -1) {
                draft.setting.embeddingProvider.configs[index].currentModel =
                  name;
              }
            }),
          );
        } catch (error) {
          console.error("向量数据库重置失败:", error);
          modal.error({
            title: "错误",
            content: "向量数据库重置失败，请重试",
          });
        }
      },
    });
  };

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
            const currentConfig = draft.setting.embeddingProvider.configs.find(
              (item: ConfigItem) =>
                item.id === draft.setting.embeddingProvider.currentConfigId,
            );
            if (currentConfig && currentConfig.models) {
              currentConfig.models = currentConfig.models.filter(
                (item: ModelItem) => item.name !== name,
              );
            }
          }),
        );
      },
    });
  };

  const modelColumns: TableColumnsType<ModelItem> = [
    {
      title: "模型名称",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "模型描述",
      dataIndex: "description",
      key: "description",
    },
    {
      title: "向量长度",
      dataIndex: "contextLength",
      key: "contextLength",
    },
    {
      title: "状态",
      render: (_text, record) => {
        const isActive = record.name === currentConfig?.currentModel;
        return (
          <Tag color={isActive ? "green" : "default"}>
            {isActive ? "使用中" : "未使用"}
          </Tag>
        );
      },
    },
    {
      title: "支持的特性",
      key: "features",
      render: (_text, record) => {
        const features = record.features || {
          multimodal: false,
        };
        const featureTags = [];
        if (features.multimodal)
          featureTags.push(<Tag color="orange">多模态</Tag>);
        if (featureTags.length === 0) featureTags.push(<Tag>-</Tag>);
        return <>{featureTags}</>;
      },
    },
    {
      title: "距离阈值",
      dataIndex: "distance",
      key: "distance",
    },
    {
      title: "操作",
      key: "action",
      render: (_text, record) => (
        <Flex gap={12}>
          <Button
            disabled={record.name === currentConfig?.currentModel}
            type="link"
            onClick={() => onActivateModel(record.name, record.contextLength)}
          >
            启动
          </Button>
          <Button type="link" onClick={() => onEditModel(record)}>
            编辑
          </Button>
          <Button danger type="link" onClick={() => onDeleteModel(record.name)}>
            删除
          </Button>
        </Flex>
      ),
    },
  ];

  return (
    <div>
      <Flex vertical gap={12}>
        <div>
          <Button onClick={onAddModel}>添加模型</Button>
        </div>
        <Table
          columns={modelColumns}
          dataSource={currentConfig?.models || []}
          pagination={false}
        />
      </Flex>
    </div>
  );
};

export default ModelTable;
