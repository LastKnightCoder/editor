import useSettingStore, { ELLMProvider } from "@/stores/useSettingStore.ts";
import { Button, Flex, Table, TableColumnsType, App, Tag } from "antd";
import { produce } from "immer";
import { ModelItem } from "../types";

interface ModelTableProps {
  onAddModel: () => void;
  onEditModel: (model: ModelItem) => void;
}

const ModelTable = ({ onAddModel, onEditModel }: ModelTableProps) => {
  const { currentConfig } = useSettingStore((state) => {
    const settings = state.setting.llmProviders[ELLMProvider.OTHER];
    const { configs, currentConfigId } = settings;
    return {
      currentConfig: configs.find((item) => item.id === currentConfigId),
    };
  });

  const { modal } = App.useApp();

  const onActivateModel = (name: string) => {
    useSettingStore.setState(
      produce((draft) => {
        const index = draft.setting.llmProviders[
          ELLMProvider.OTHER
        ].configs.findIndex((item: any) => item.id === currentConfig?.id);
        if (index !== -1) {
          draft.setting.llmProviders[ELLMProvider.OTHER].configs[
            index
          ].currentModel = name;
        }
      }),
    );
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
            const currentConfig = draft.setting.llmProviders[
              ELLMProvider.OTHER
            ].configs.find(
              (item: any) =>
                item.id ===
                draft.setting.llmProviders[ELLMProvider.OTHER].currentConfigId,
            );
            if (currentConfig && currentConfig.models) {
              currentConfig.models = currentConfig.models.filter(
                (item: any) => item.name !== name,
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
          online: false,
          thinking: false,
          multimodal: false,
        };
        const featureTags = [];
        if (features.online) featureTags.push(<Tag color="blue">联网</Tag>);
        if (features.thinking) featureTags.push(<Tag color="purple">思考</Tag>);
        if (features.multimodal)
          featureTags.push(<Tag color="orange">多模态</Tag>);
        if (featureTags.length === 0) featureTags.push(<Tag>-</Tag>);
        return <>{featureTags}</>;
      },
    },
    {
      title: "操作",
      key: "action",
      render: (_text, record) => (
        <Flex gap={12}>
          <Button
            disabled={record.name === currentConfig?.currentModel}
            type="link"
            onClick={() => onActivateModel(record.name)}
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
