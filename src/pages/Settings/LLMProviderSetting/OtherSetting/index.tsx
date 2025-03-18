import useSettingStore, { ELLMProvider } from "@/stores/useSettingStore.ts";
import { Divider, App } from "antd";
import { useState } from "react";
import { produce } from "immer";
import { v4 as getUuid } from "uuid";
import { ConfigTable, ModelTable, ConfigModal, ModelModal } from "./components";
import { ConfigFormData, ConfigItem, ModelFormData, ModelItem } from "./types";

const OtherSetting = () => {
  const [action, setAction] = useState<"create" | "edit">();
  const [initialConfigData, setInitialConfigData] = useState<ConfigItem | null>(
    null,
  );
  const [modelAddOpen, setModelAddOpen] = useState(false);
  const [modelAction, setModelAction] = useState<"create" | "edit">("create");
  const [initialModelData, setInitialModelData] = useState<ModelItem | null>(
    null,
  );
  const { message } = App.useApp();

  const { currentConfig } = useSettingStore((state) => {
    const settings = state.setting.llmProviders[ELLMProvider.OTHER];
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
          draft.setting.llmProviders[ELLMProvider.OTHER].configs.push({
            id: getUuid(),
            name: data.name,
            apiKey: data.apiKey,
            baseUrl: data.baseUrl,
            models: [],
          });
        }),
      );
    } else {
      useSettingStore.setState(
        produce((draft) => {
          const index = draft.setting.llmProviders[
            ELLMProvider.OTHER
          ].configs.findIndex((item: any) => item.id === data.id);
          if (index === -1) {
            return;
          }
          draft.setting.llmProviders[ELLMProvider.OTHER].configs[index] = {
            ...draft.setting.llmProviders[ELLMProvider.OTHER].configs[index],
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
        const currentConfig = draft.setting.llmProviders[
          ELLMProvider.OTHER
        ].configs.find(
          (item: any) =>
            item.id ===
            draft.setting.llmProviders[ELLMProvider.OTHER].currentConfigId,
        );
        if (currentConfig) {
          if (!currentConfig.models) {
            currentConfig.models = [];
          }

          if (modelAction === "create") {
            currentConfig.models.push({
              name: data.name,
              description: data.description,
            });
          } else {
            // Edit existing model
            const modelIndex = currentConfig.models.findIndex(
              (item: ModelItem) => item.name === initialModelData?.name,
            );
            if (modelIndex !== -1) {
              currentConfig.models[modelIndex] = {
                name: data.name,
                description: data.description,
              };

              // Update currentModel if the name changed and it was the active model
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

export default OtherSetting;
