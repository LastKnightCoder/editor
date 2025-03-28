import { Divider, App } from "antd";
import useSettingStore from "@/stores/useSettingStore.ts";
import { useState } from "react";
import { produce } from "immer";
import { v4 as getUuid } from "uuid";
import { clearVecDocumentTable, initVecDocumentTable } from "@/commands";
import { ConfigTable, ModelTable, ConfigModal, ModelModal } from "./components";
import { ConfigFormData, ConfigItem, ModelFormData, ModelItem } from "./types";

const EmbeddingProviderSetting = () => {
  const [action, setAction] = useState<"create" | "edit">();
  const [initialConfigData, setInitialConfigData] = useState<ConfigItem | null>(
    null,
  );
  const [modelAddOpen, setModelAddOpen] = useState(false);
  const [modelAction, setModelAction] = useState<"create" | "edit">("create");
  const [initialModelData, setInitialModelData] = useState<ModelItem | null>(
    null,
  );
  const { message, modal } = App.useApp();

  const { currentConfig } = useSettingStore((state) => {
    const settings = state.setting.embeddingProvider;
    const { configs, currentConfigId } = settings;
    return {
      currentConfig: configs.find((item) => item.id === currentConfigId),
    };
  });

  const onAddConfig = () => {
    setAction("create");
    setInitialConfigData(null);
  };

  const onEditConfig = (item: ConfigItem) => {
    setAction("edit");
    setInitialConfigData(item);
  };

  const handleEditConfigFinish = (data: ConfigFormData) => {
    if (!action) return;
    if (action === "create") {
      useSettingStore.setState(
        produce((draft) => {
          draft.setting.embeddingProvider.configs.push({
            id: getUuid(),
            name: data.name,
            apiKey: data.apiKey,
            baseUrl: data.baseUrl,
            models: [],
            currentModel: "",
          });
        }),
      );
    } else {
      useSettingStore.setState(
        produce((draft) => {
          const index = draft.setting.embeddingProvider.configs.findIndex(
            (item: ConfigItem) => item.id === data.id,
          );
          if (index === -1) {
            return;
          }
          draft.setting.embeddingProvider.configs[index] = {
            ...draft.setting.embeddingProvider.configs[index],
            id: data.id,
            name: data.name,
            apiKey: data.apiKey,
            baseUrl: data.baseUrl,
          };
        }),
      );
    }
    setAction(undefined);
    setInitialConfigData(null);
  };

  const handleEditConfigCancel = () => {
    setAction(undefined);
    setInitialConfigData(null);
  };

  const onAddModel = () => {
    setModelAction("create");
    setInitialModelData(null);
    setModelAddOpen(true);
  };

  const onEditModel = (model: ModelItem) => {
    setModelAction("edit");
    setInitialModelData(model);
    setModelAddOpen(true);
  };

  const onAddModelFinish = (data: ModelFormData) => {
    if (!data.name || !data.description) {
      message.warning("请填写完整");
      return;
    }

    useSettingStore.setState(
      produce((draft) => {
        const currentConfig = draft.setting.embeddingProvider.configs.find(
          (item: ConfigItem) =>
            item.id === draft.setting.embeddingProvider.currentConfigId,
        );
        if (currentConfig) {
          if (!currentConfig.models) {
            currentConfig.models = [];
          }

          if (modelAction === "create") {
            currentConfig.models.push({
              name: data.name,
              description: data.description,
              contextLength: data.contextLength,
              features: data.features,
              distace: data.distance,
            });
          } else {
            // Edit existing model
            const modelIndex = currentConfig.models.findIndex(
              (item: ModelItem) => item.name === initialModelData?.name,
            );
            if (modelIndex !== -1) {
              // contextLength 是否和之前的不同，如果不同，则需要删掉重建
              const prevContextLength =
                currentConfig.models[modelIndex].contextLength;
              if (prevContextLength !== data.contextLength) {
                modal.confirm({
                  title: "切换嵌入模型",
                  content:
                    "不同的嵌入模型不能共用，之前的嵌入数据将会被删除，是否继续？",
                  okText: "确认",
                  cancelText: "取消",
                  okButtonProps: {
                    danger: true,
                  },
                  onOk: async () => {
                    try {
                      // 清除现有向量数据
                      await clearVecDocumentTable();

                      await initVecDocumentTable(data.contextLength);

                      // 更新模型名称
                      currentConfig.models[modelIndex] = {
                        name: data.name,
                        description: data.description,
                        contextLength: data.contextLength,
                        features: data.features,
                        distance: data.distance,
                      };
                    } catch (error) {
                      console.error("向量数据库重置失败:", error);
                      modal.error({
                        title: "错误",
                        content: "向量数据库重置失败，请重试",
                      });
                    }
                  },
                });
              } else {
                currentConfig.models[modelIndex] = {
                  name: data.name,
                  description: data.description,
                  contextLength: data.contextLength,
                  features: data.features,
                  distance: data.distance,
                };
              }
              if (
                initialModelData?.name !== data.name &&
                currentConfig.currentModel === initialModelData?.name
              ) {
                currentConfig.currentModel = data.name;
              }
            }
          }
        }
      }),
    );
    setModelAddOpen(false);
    setInitialModelData(null);
  };

  const onAddModelCancel = () => {
    setModelAddOpen(false);
    setInitialModelData(null);
  };

  return (
    <div>
      <ConfigTable onAddConfig={onAddConfig} onEditConfig={onEditConfig} />

      {currentConfig && (
        <div>
          <Divider>模型列表</Divider>
          <ModelTable onAddModel={onAddModel} onEditModel={onEditModel} />
        </div>
      )}

      <ConfigModal
        action={action}
        onFinish={handleEditConfigFinish}
        onCancel={handleEditConfigCancel}
        initialData={initialConfigData || undefined}
      />

      <ModelModal
        open={modelAddOpen}
        onFinish={onAddModelFinish}
        onCancel={onAddModelCancel}
        initialData={initialModelData || undefined}
        action={modelAction}
      />
    </div>
  );
};

export default EmbeddingProviderSetting;
