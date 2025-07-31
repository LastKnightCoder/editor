import useSettingStore from "@/stores/useSettingStore.ts";
import { Button, Card, List, App } from "antd";
import { produce } from "immer";
import { ConfigItem } from "../types";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";

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
      className="h-full border-none shadow-none bg-white dark:bg-gray-800"
      extra={
        <Button
          type="text"
          icon={<PlusOutlined />}
          onClick={onAddConfig}
          size="small"
          className="text-blue-500 hover:text-blue-700"
        >
          添加
        </Button>
      }
    >
      <List
        className="overflow-y-auto"
        dataSource={configs}
        renderItem={(config) => (
          <List.Item
            className={`cursor-pointer rounded-md px-3! py-2 mb-2 flex items-center transition-colors border-none! ${
              config.id === selectedConfigId
                ? "bg-gray-100 dark:bg-gray-900/70"
                : "hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
            onClick={() => handleItemClick(config)}
            actions={[
              <Button
                key="edit"
                type="text"
                size="small"
                className="text-gray-500 hover:text-blue-500"
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
                className="text-red-500 hover:text-red-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteConfig(config.id);
                }}
              />,
            ]}
          >
            <List.Item.Meta
              description={
                <div className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-300">
                  <div className="font-medium text-gray-800 dark:text-gray-100 text-base">
                    {config.name}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-400">
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
