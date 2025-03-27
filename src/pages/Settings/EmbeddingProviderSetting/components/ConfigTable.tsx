import useSettingStore from "@/stores/useSettingStore.ts";
import { Button, Flex, Table, TableColumnsType, App, Tag } from "antd";
import { produce } from "immer";
import { ConfigItem } from "../types";
import {
  clearVecDocumentTable,
  initVecDocumentTable,
} from "@/commands/vec-document";

interface ConfigTableProps {
  onAddConfig: () => void;
  onEditConfig: (config: ConfigItem) => void;
}

const ConfigTable = ({ onAddConfig, onEditConfig }: ConfigTableProps) => {
  const { configs, currentConfigId } = useSettingStore((state) => {
    const configs = state.setting.embeddingProvider.configs;
    const currentConfigId = state.setting.embeddingProvider.currentConfigId;
    return {
      configs,
      currentConfigId,
    };
  });

  const { modal, message } = App.useApp();

  const onActivateConfig = (id: string) => {
    const config = configs.find((item) => item.id === id);
    if (!config) return;

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
          await clearVecDocumentTable();

          // 初始化新的向量数据库
          // 如果当前配置有选中的模型，使用该模型的上下文长度
          if (config.currentModel) {
            const model = config.models.find(
              (model) => model.name === config.currentModel,
            );
            if (model) {
              const vectorLength = model.contextLength;
              if (!vectorLength) {
                message.error("模型上下文长度未设置");
                return;
              }
              await initVecDocumentTable(vectorLength);
            }
          }

          // 更新当前配置
          useSettingStore.setState(
            produce((draft) => {
              draft.setting.embeddingProvider.currentConfigId = id;
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

  const onDeleteConfig = (id: string) => {
    modal.confirm({
      title: "确定删除此配置吗？",
      content:
        id === currentConfigId
          ? "数据也将被删除，删除后无法恢复"
          : "删除后无法恢复",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
      onOk: async () => {
        // 当前配置是否是当前配置
        if (id === currentConfigId) {
          await clearVecDocumentTable();
        }
        useSettingStore.setState(
          produce((draft) => {
            const index = draft.setting.embeddingProvider.configs.findIndex(
              (item: ConfigItem) => item.id === id,
            );
            if (index !== -1) {
              draft.setting.embeddingProvider.configs.splice(index, 1);
            }
          }),
        );
      },
    });
  };

  const columns: TableColumnsType<ConfigItem> = [
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      ellipsis: true,
    },
    {
      title: "API Key",
      dataIndex: "apiKey",
      key: "apiKey",
      ellipsis: true,
      render: () => <div>********</div>,
    },
    {
      title: "Base URL",
      dataIndex: "baseUrl",
      key: "baseUrl",
      ellipsis: true,
    },
    {
      title: "状态",
      render: (_text, record) => {
        const isActive = record.id === currentConfigId;
        return (
          <Tag color={isActive ? "green" : "default"}>
            {isActive ? "使用中" : "未使用"}
          </Tag>
        );
      },
    },
    {
      title: "操作",
      key: "action",
      fixed: "right",
      ellipsis: true,
      render: (_text, record) => (
        <Flex>
          <Button
            disabled={record.id === currentConfigId}
            size={"small"}
            type={"link"}
            onClick={() => onActivateConfig(record.id)}
          >
            启动
          </Button>
          <Button
            size={"small"}
            type="link"
            onClick={() => onEditConfig(record)}
          >
            编辑
          </Button>
          <Button
            danger
            size={"small"}
            type="link"
            onClick={() => onDeleteConfig(record.id)}
          >
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
          <Button onClick={onAddConfig}>添加配置</Button>
        </div>
        <Table columns={columns} dataSource={configs} pagination={false} />
      </Flex>
    </div>
  );
};

export default ConfigTable;
