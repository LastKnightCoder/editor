import useSettingStore, { ELLMProvider } from "@/stores/useSettingStore.ts";
import { Button, Flex, Table, TableColumnsType, App, Tag } from "antd";
import { produce } from "immer";
import { ConfigItem } from "../types";

interface ConfigTableProps {
  onAddConfig: () => void;
  onEditConfig: (item: ConfigItem) => void;
}

const ConfigTable = ({ onAddConfig, onEditConfig }: ConfigTableProps) => {
  const { settings } = useSettingStore((state) => ({
    settings: state.setting.llmProviders[ELLMProvider.OTHER],
  }));

  const { configs, currentConfigId } = settings;
  const { modal } = App.useApp();

  const onDeleteConfig = (id: string) => {
    modal.confirm({
      title: "确定删除此模型吗？",
      onOk: () => {
        useSettingStore.setState(
          produce((draft) => {
            const index = draft.setting.llmProviders[
              ELLMProvider.OTHER
            ].configs.findIndex((item: any) => item.id === id);
            if (index === -1) {
              return;
            }
            draft.setting.llmProviders[ELLMProvider.OTHER].configs.splice(
              index,
              1,
            );
          }),
        );
      },
    });
  };

  const onActivateConfig = (id: string) => {
    useSettingStore.setState(
      produce((draft) => {
        draft.setting.llmProviders[ELLMProvider.OTHER].currentConfigId = id;
      }),
    );
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
      render: (_text, record) => (
        <Flex>
          <Button
            size={"small"}
            disabled={record.id === currentConfigId}
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
            size={"small"}
            danger
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
      <Flex style={{ marginBottom: 16 }}>
        <Button onClick={onAddConfig}>添加配置</Button>
      </Flex>
      <Table columns={columns} dataSource={configs} pagination={false} />
    </div>
  );
};

export default ConfigTable;
