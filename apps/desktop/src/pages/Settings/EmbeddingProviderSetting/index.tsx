import { App } from "antd";
import useSettingStore from "@/stores/useSettingStore";
import { useState } from "react";
import { createDraft, finishDraft, produce } from "immer";
import { v4 as getUuid } from "uuid";
import {
  clearVecDocumentTable,
  initVecDocumentTable,
  vlReinitAllVecTables,
  vlReembeddingAllResources,
  vlClearEmbeddingCache,
} from "@/commands";
import { ConfigTable, ModelTable, ConfigModal, ModelModal } from "./components";
import { ConfigFormData, ConfigItem, ModelFormData, ModelItem } from "./types";
import { SettingContainer, SettingSection } from "../components";

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
  const { message } = App.useApp();

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

  const onAddModelFinish = async (data: ModelFormData) => {
    if (!data.name || !data.description) {
      message.warning("请填写完整");
      return;
    }

    const draft = createDraft(useSettingStore.getState());
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
          distance: data.distance,
        });
      } else {
        const modelIndex = currentConfig.models.findIndex(
          (item: ModelItem) => item.name === initialModelData?.name,
        );
        if (modelIndex !== -1) {
          const prevContextLength =
            currentConfig.models[modelIndex].contextLength;
          if (prevContextLength !== data.contextLength) {
            try {
              // 重置主向量数据库
              await clearVecDocumentTable();
              await initVecDocumentTable(data.contextLength);

              // 重置 Vibe Learning 向量表并重新 embedding
              await vlClearEmbeddingCache();
              await vlReinitAllVecTables(data.contextLength);
              await vlReembeddingAllResources();

              currentConfig.models[modelIndex] = {
                name: data.name,
                description: data.description,
                contextLength: data.contextLength,
                features: data.features,
                distance: data.distance,
              };

              message.success("向量维度已更新，正在重新生成索引...");
            } catch (error) {
              console.error("向量数据库重置失败:", error);
              message.error("向量数据库重置失败，请重试");
            }
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

    useSettingStore.setState(finishDraft(draft));
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
        title="嵌入模型配置"
        description="配置用于文档向量化的嵌入模型服务"
      >
        <ConfigTable onAddConfig={onAddConfig} onEditConfig={onEditConfig} />
      </SettingSection>

      {currentConfig && (
        <SettingSection
          title="模型列表"
          description={`当前配置 "${currentConfig.name}" 的模型列表`}
        >
          <ModelTable onAddModel={onAddModel} onEditModel={onEditModel} />
        </SettingSection>
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
    </SettingContainer>
  );
};

export default EmbeddingProviderSetting;
