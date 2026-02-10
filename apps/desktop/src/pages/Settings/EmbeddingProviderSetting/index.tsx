import { useEffect, useMemo, useState } from "react";
import { App } from "antd";
import { createDraft, finishDraft, produce } from "immer";
import { v4 as getUuid } from "uuid";
import useSettingStore from "@/stores/useSettingStore";
import {
  clearVecDocumentTable,
  initVecDocumentTable,
  vlClearEmbeddingCache,
  vlReembeddingAllResources,
  vlReinitAllVecTables,
} from "@/commands";
import { SettingContainer, SettingSection, SettingTabs } from "../components";
import { ConfigTable, ConfigModal, ModelModal, ModelTable } from "./components";
import type {
  ConfigFormData,
  ConfigItem,
  ModelFormData,
  ModelItem,
} from "./types";

type ProviderTabKey = "local_python" | "remote_openai";

const LOCAL_CONFIG_ID = "embedding-default-local";

const LOCAL_DEFAULT_CONFIG: ConfigItem = {
  id: LOCAL_CONFIG_ID,
  name: "本地嵌入模型",
  providerType: "local_python",
  source: "modelscope",
  apiKey: "",
  baseUrl: "",
  batchSize: 8,
  devicePolicy: "auto",
  models: [],
  currentModel: "",
};

const EmbeddingProviderSetting = () => {
  const { message, modal } = App.useApp();
  const [activeTab, setActiveTab] = useState<ProviderTabKey>("local_python");

  const [action, setAction] = useState<"create" | "edit">();
  const [initialConfigData, setInitialConfigData] = useState<ConfigItem | null>(
    null,
  );
  const [modelAddOpen, setModelAddOpen] = useState(false);
  const [modelAction, setModelAction] = useState<"create" | "edit">("create");
  const [initialModelData, setInitialModelData] = useState<ModelItem | null>(
    null,
  );

  const { allConfigs, currentConfigId } = useSettingStore((state) => {
    const configs = state.setting.embeddingProvider.configs as ConfigItem[];
    return {
      allConfigs: configs,
      currentConfigId: state.setting.embeddingProvider.currentConfigId,
    };
  });

  const localConfig = useMemo(
    () => allConfigs.find((item) => item.id === LOCAL_CONFIG_ID),
    [allConfigs],
  );

  const apiConfigs = useMemo(
    () => allConfigs.filter((item) => item.id !== LOCAL_CONFIG_ID),
    [allConfigs],
  );

  const currentApiConfig = useMemo(() => {
    if (activeTab !== "remote_openai") {
      return undefined;
    }
    return (
      apiConfigs.find((item) => item.id === currentConfigId) || apiConfigs[0]
    );
  }, [activeTab, apiConfigs, currentConfigId]);

  const currentConfig =
    activeTab === "local_python" ? localConfig : currentApiConfig;

  useEffect(() => {
    useSettingStore.setState(
      produce((draft) => {
        const provider = draft.setting.embeddingProvider;
        const configs = provider.configs as ConfigItem[];

        if (!configs.find((item) => item.id === LOCAL_CONFIG_ID)) {
          configs.unshift({ ...LOCAL_DEFAULT_CONFIG });
        }

        const local = configs.find((item) => item.id === LOCAL_CONFIG_ID);
        if (local) {
          local.providerType = "local_python";
          local.name = "本地嵌入模型";
          local.source = local.source || "modelscope";
          local.batchSize = local.batchSize || 8;
          local.devicePolicy = local.devicePolicy || "auto";
        }

        if (!provider.currentConfigId) {
          provider.currentConfigId = LOCAL_CONFIG_ID;
        }
      }),
    );
  }, []);

  useEffect(() => {
    if (activeTab === "local_python") {
      useSettingStore.setState(
        produce((draft) => {
          draft.setting.embeddingProvider.currentConfigId = LOCAL_CONFIG_ID;
        }),
      );
      return;
    }

    if (apiConfigs.length > 0) {
      const exists = apiConfigs.some((item) => item.id === currentConfigId);
      if (!exists) {
        useSettingStore.setState(
          produce((draft) => {
            draft.setting.embeddingProvider.currentConfigId = apiConfigs[0].id;
          }),
        );
      }
    }
  }, [activeTab, apiConfigs, currentConfigId]);

  const tabItems = useMemo(
    () => [
      { key: "local_python", label: "本地模型" },
      { key: "remote_openai", label: "API 模型" },
    ],
    [],
  );

  const onAddConfig = () => {
    setAction("create");
    setInitialConfigData(null);
  };

  const onEditConfig = (config: ConfigItem) => {
    setAction("edit");
    setInitialConfigData(config);
  };

  const handleEditConfigFinish = (data: ConfigFormData) => {
    if (!action) return;

    if (action === "create") {
      useSettingStore.setState(
        produce((draft) => {
          const id = getUuid();
          draft.setting.embeddingProvider.configs.push({
            id,
            name: data.name,
            providerType: "remote_openai",
            source: data.source,
            apiKey: data.apiKey,
            baseUrl: data.baseUrl,
            localModelDir: data.localModelDir,
            batchSize: data.batchSize,
            devicePolicy: data.devicePolicy,
            models: [],
            currentModel: "",
          });
          draft.setting.embeddingProvider.currentConfigId = id;
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
            name: data.name,
            apiKey: data.apiKey,
            baseUrl: data.baseUrl,
            batchSize: data.batchSize,
            devicePolicy: data.devicePolicy,
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

  const onActivateConfig = (id: string) => {
    const config = apiConfigs.find((item) => item.id === id);
    if (!config) {
      return;
    }

    modal.confirm({
      title: "切换嵌入配置",
      content: "切换配置会重建向量索引，是否继续？",
      okText: "确认",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await clearVecDocumentTable();

          if (config.currentModel) {
            const model = config.models.find(
              (item) => item.name === config.currentModel,
            );
            if (model?.contextLength) {
              await initVecDocumentTable(model.contextLength);
            }
          }

          useSettingStore.setState(
            produce((draft) => {
              draft.setting.embeddingProvider.currentConfigId = id;
            }),
          );
        } catch (error) {
          console.error("向量数据库重置失败:", error);
          message.error("向量数据库重置失败，请重试");
        }
      },
    });
  };

  const onDeleteConfig = (id: string) => {
    modal.confirm({
      title: "确定删除此 Provider 配置吗？",
      content: "删除后不可恢复",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        if (id === currentConfigId) {
          await clearVecDocumentTable();
        }

        useSettingStore.setState(
          produce((draft) => {
            const configs = draft.setting.embeddingProvider
              .configs as ConfigItem[];
            const index = configs.findIndex((item) => item.id === id);
            if (index === -1) {
              return;
            }
            configs.splice(index, 1);

            if (draft.setting.embeddingProvider.currentConfigId === id) {
              const next = configs.find((item) => item.id !== LOCAL_CONFIG_ID);
              draft.setting.embeddingProvider.currentConfigId =
                next?.id || LOCAL_CONFIG_ID;
            }
          }),
        );
      },
    });
  };

  const onAddModel = () => {
    if (activeTab !== "remote_openai") {
      return;
    }
    setModelAction("create");
    setInitialModelData(null);
    setModelAddOpen(true);
  };

  const onEditModel = (model: ModelItem) => {
    if (activeTab !== "remote_openai") {
      return;
    }
    setModelAction("edit");
    setInitialModelData(model);
    setModelAddOpen(true);
  };

  const onAddModelFinish = async (data: ModelFormData) => {
    if (!currentConfig || activeTab !== "remote_openai") {
      return;
    }

    if (!data.name || !data.description) {
      message.warning("请填写完整");
      return;
    }

    const draft = createDraft(useSettingStore.getState());
    const config = (
      draft.setting.embeddingProvider.configs as ConfigItem[]
    ).find((item) => item.id === currentConfig.id);

    if (!config) {
      return;
    }

    if (!config.models) {
      config.models = [];
    }

    if (modelAction === "create") {
      config.models.push({
        name: data.name,
        description: data.description,
        contextLength: data.contextLength,
        features: data.features,
        distance: data.distance,
      });
    } else {
      const modelIndex = config.models.findIndex(
        (item: ModelItem) => item.name === initialModelData?.name,
      );
      if (modelIndex !== -1) {
        const prevContextLength = config.models[modelIndex].contextLength;
        config.models[modelIndex] = {
          name: data.name,
          description: data.description,
          contextLength: data.contextLength,
          features: data.features,
          distance: data.distance,
        };

        if (
          initialModelData?.name !== data.name &&
          config.currentModel === initialModelData?.name
        ) {
          config.currentModel = data.name;
        }

        if (prevContextLength !== data.contextLength) {
          try {
            await clearVecDocumentTable();
            await initVecDocumentTable(data.contextLength);
            await vlClearEmbeddingCache();
            await vlReinitAllVecTables(data.contextLength);
            await vlReembeddingAllResources();
            message.success("向量维度已更新，正在重新生成索引...");
          } catch (error) {
            console.error("向量数据库重置失败:", error);
            message.error("向量数据库重置失败，请重试");
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
        title="嵌入模型"
        description="本地模型直接下载；API 模型按 Provider 进行配置与管理"
      >
        <SettingTabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as ProviderTabKey)}
          items={tabItems}
        />
      </SettingSection>

      {activeTab === "remote_openai" && (
        <SettingSection
          title="Provider 配置"
          description="管理 API Provider（可新增多个），并选择当前使用项"
        >
          <ConfigTable
            configs={apiConfigs}
            currentConfigId={currentConfigId}
            onAddConfig={onAddConfig}
            onEditConfig={onEditConfig}
            onActivateConfig={onActivateConfig}
            onDeleteConfig={onDeleteConfig}
          />
        </SettingSection>
      )}

      {currentConfig && (
        <SettingSection
          title={activeTab === "local_python" ? "本地模型列表" : "模型列表"}
          description={
            activeTab === "local_python"
              ? "直接下载并启用本地模型，无需配置 Provider"
              : `当前 Provider「${currentConfig.name}」的模型列表`
          }
        >
          <ModelTable
            providerType={activeTab}
            onOpenConfig={() => {
              if (currentConfig && activeTab === "remote_openai") {
                onEditConfig(currentConfig);
              }
            }}
            onAddModel={onAddModel}
            onEditModel={onEditModel}
          />
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
