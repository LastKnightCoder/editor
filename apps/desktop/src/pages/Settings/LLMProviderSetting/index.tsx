import useSettingStore from "@/stores/useSettingStore";
import { App } from "antd";
import { useState } from "react";
import { produce } from "immer";
import { v4 as getUuid } from "uuid";
import {
  ConfigList,
  ConfigModal,
  ModelModal,
  UsageSettings,
} from "./components";
import { ConfigFormData, ConfigItem, ModelFormData, ModelItem } from "./types";
import { SettingContainer, SettingSection } from "../components";

const LLMProviderSetting = () => {
  const [action, setAction] = useState<"create" | "edit">();
  const [initialConfigData, setInitialConfigData] = useState<ConfigItem | null>(
    null,
  );
  const [modelAddOpen, setModelAddOpen] = useState(false);
  const [modelAction, setModelAction] = useState<"create" | "edit">("create");
  const [initialModelData, setInitialModelData] = useState<ModelItem | null>(
    null,
  );
  const [selectedConfigId, setSelectedConfigId] = useState<string>("");
  const { message } = App.useApp();

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
          draft.setting.llmConfigs.push({
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
          const index = draft.setting.llmConfigs.findIndex(
            (item: any) => item.id === data.id,
          );
          if (index === -1) {
            return;
          }
          draft.setting.llmConfigs[index] = {
            ...draft.setting.llmConfigs[index],
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

    if (!selectedConfigId) {
      message.warning("请先选择一个配置");
      return;
    }

    useSettingStore.setState(
      produce((draft) => {
        const config = draft.setting.llmConfigs.find(
          (item: any) => item.id === selectedConfigId,
        );
        if (config) {
          if (!config.models) {
            config.models = [];
          }

          if (modelAction === "create") {
            config.models.push({
              name: data.name,
              description: data.description,
              features: data.features,
            });
          } else {
            const modelIndex = config.models.findIndex(
              (item: ModelItem) => item.name === initialModelData?.name,
            );
            if (modelIndex !== -1) {
              config.models[modelIndex] = {
                name: data.name,
                description: data.description,
                features: data.features,
              };
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
    <SettingContainer>
      <SettingSection
        title="LLM 服务配置"
        description="配置大语言模型服务商的 API 密钥和模型信息"
      >
        <ConfigList
          onAddConfig={onAddConfig}
          onEditConfig={onEditConfig}
          selectedConfigId={selectedConfigId}
          onSelectConfig={setSelectedConfigId}
          onAddModel={onAddModel}
          onEditModel={onEditModel}
        />
      </SettingSection>

      <SettingSection
        title="功能模型分配"
        description="为不同功能分配使用的 LLM 配置和模型"
      >
        <UsageSettings />
      </SettingSection>

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
    </SettingContainer>
  );
};

export default LLMProviderSetting;
