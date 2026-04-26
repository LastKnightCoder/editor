import { useEffect, useMemo, useState } from "react";
import type { SettingCompat } from "../../../types";
import { ActionSheet } from "./ActionSheet";
import type { SettingModule, SettingsPageProps } from "./types";
import { FieldInput, FieldSheetTrigger, IconCloud, ListItem } from "./ui";
import {
  createId,
  LLM_FEATURE_KEYS,
  normalizeEmbeddingApiConfigs,
  normalizeLlmConfigs,
  normalizeLlmUsageSettings,
  reconcileLlmUsageSettings,
  resolveEmbeddingCurrentConfig,
  type EmbeddingApiConfig,
  type EmbeddingModelConfig,
  type LlmFeatureKey,
  type LlmModelConfig,
  type LlmModelFeatures,
  type LlmUsageSettings,
} from "./aiSettingsCompat";

type UpdateSetting = SettingsPageProps["updateSetting"];

type AICommonProps = {
  safeSetting: SettingCompat | null;
  updateSetting: UpdateSetting;
};

type LlmPersistMutator = (
  configs: ReturnType<typeof normalizeLlmConfigs>,
  usage: LlmUsageSettings,
) => {
  configs: ReturnType<typeof normalizeLlmConfigs>;
  usage: LlmUsageSettings;
};

type EmbeddingPersistMutator = (
  configs: EmbeddingApiConfig[],
  currentConfigId: string,
) => {
  configs: EmbeddingApiConfig[];
  currentConfigId?: string;
};

const LLM_FEATURE_LABELS: Record<LlmFeatureKey, string> = {
  chat: "对话功能",
  titleSummary: "标题总结",
  aiContinueWrite: "AI 续写",
  webClip: "网页剪藏",
  podcastGeneration: "播客生成",
  contentPolish: "内容润色",
  flashcardGeneration: "闪卡生成",
  aiJudgement: "答案评判",
  transcriptionOptimization: "转录断句优化",
  videoSummary: "视频总结",
  vibeLearningImageDescription: "Vibe Learning 图片理解",
  vibeLearningDocSummary: "Vibe Learning 文档摘要",
};

const LLM_USAGE_GROUPS: Array<{
  key: string;
  label: string;
  features: LlmFeatureKey[];
}> = [
  {
    key: "conversation",
    label: "对话与写作",
    features: ["chat", "aiContinueWrite", "contentPolish"],
  },
  {
    key: "content",
    label: "内容处理",
    features: ["titleSummary", "webClip"],
  },
  {
    key: "media",
    label: "多媒体",
    features: [
      "podcastGeneration",
      "videoSummary",
      "transcriptionOptimization",
    ],
  },
  {
    key: "learning",
    label: "学习辅助",
    features: [
      "flashcardGeneration",
      "aiJudgement",
      "vibeLearningImageDescription",
      "vibeLearningDocSummary",
    ],
  },
];

const LLM_FEATURE_SWITCHES: Array<{
  key: keyof LlmModelFeatures;
  label: string;
}> = [
  { key: "online", label: "联网" },
  { key: "thinking", label: "思考" },
  { key: "image", label: "图片" },
  { key: "video", label: "视频" },
  { key: "audio", label: "音频" },
  { key: "file", label: "文件" },
];

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readLlmState(setting: SettingCompat) {
  const root = asRecord(setting);
  return {
    llmConfigs: normalizeLlmConfigs(root.llmConfigs),
    llmUsageSettings: normalizeLlmUsageSettings(root.llmUsageSettings),
  };
}

function persistLlmState(
  updateSetting: UpdateSetting,
  mutator: LlmPersistMutator,
) {
  updateSetting(
    (prev) => {
      const { llmConfigs, llmUsageSettings } = readLlmState(prev);
      const next = mutator(llmConfigs, llmUsageSettings);
      return {
        ...prev,
        llmConfigs: next.configs,
        llmUsageSettings: reconcileLlmUsageSettings(next.configs, next.usage),
      };
    },
    { persist: true },
  );
}

function readEmbeddingState(setting: SettingCompat) {
  const root = asRecord(setting);
  const embeddingProvider = asRecord(root.embeddingProvider);
  const rawConfigs = Array.isArray(embeddingProvider.configs)
    ? embeddingProvider.configs
    : [];
  const localConfigs = rawConfigs.filter((item) => {
    const config = asRecord(item);
    return config.providerType === "local_python";
  });
  const apiConfigs = normalizeEmbeddingApiConfigs(rawConfigs);
  const currentConfigId = resolveEmbeddingCurrentConfig(
    embeddingProvider.currentConfigId,
    apiConfigs,
  );
  return {
    embeddingProvider,
    localConfigs,
    apiConfigs,
    currentConfigId,
  };
}

function persistEmbeddingState(
  updateSetting: UpdateSetting,
  mutator: EmbeddingPersistMutator,
) {
  updateSetting(
    (prev) => {
      const { embeddingProvider, localConfigs, apiConfigs, currentConfigId } =
        readEmbeddingState(prev);
      const next = mutator(apiConfigs, currentConfigId);
      const nextApiConfigs = normalizeEmbeddingApiConfigs(next.configs);
      const targetCurrentId = next.currentConfigId ?? currentConfigId;
      const nextCurrentId = resolveEmbeddingCurrentConfig(
        targetCurrentId,
        nextApiConfigs,
      );
      return {
        ...prev,
        embeddingProvider: {
          ...embeddingProvider,
          currentConfigId: nextCurrentId,
          configs: [...localConfigs, ...nextApiConfigs],
        },
      };
    },
    { persist: true },
  );
}

function getProviderDisplayName(name: string) {
  return name.trim() || "未命名配置";
}

function isLlmProviderReady(config: { apiKey: string; baseUrl: string }) {
  return Boolean(config.apiKey.trim() && config.baseUrl.trim());
}

function isEmbeddingProviderReady(config: { apiKey: string; baseUrl: string }) {
  return Boolean(config.apiKey.trim() && config.baseUrl.trim());
}

function UsageHint() {
  return (
    <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
      已开启自动保存。结构变更会立即保存，输入框在失焦后保存。
    </p>
  );
}

type LlmModelEditorProps = {
  model: LlmModelConfig;
  onCommitName: (value: string) => void;
  onCommitDescription: (value: string) => void;
  onToggleFeature: (key: keyof LlmModelFeatures) => void;
  onDelete: () => void;
};

function LlmModelEditor(props: LlmModelEditorProps) {
  const [nameDraft, setNameDraft] = useState(props.model.name);
  const [descriptionDraft, setDescriptionDraft] = useState(
    props.model.description,
  );

  useEffect(() => {
    setNameDraft(props.model.name);
    setDescriptionDraft(props.model.description);
  }, [props.model.description, props.model.name]);

  return (
    <div className="rounded-xl border border-gray-200 p-3 dark:border-neutral-700">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
          {props.model.name}
        </div>
        <button
          type="button"
          onClick={props.onDelete}
          className="rounded-md px-2 py-1 text-xs text-red-600 transition-colors active:bg-red-50 dark:text-red-300 dark:active:bg-red-500/10"
        >
          删除
        </button>
      </div>
      <div className="mt-3 space-y-3">
        <FieldInput
          label="模型名称"
          value={nameDraft}
          onChange={setNameDraft}
          onBlur={() => props.onCommitName(nameDraft)}
          placeholder="请输入模型名称"
        />
        <FieldInput
          label="模型描述"
          value={descriptionDraft}
          onChange={setDescriptionDraft}
          onBlur={() => props.onCommitDescription(descriptionDraft)}
          placeholder="请输入模型描述"
        />
        <div>
          <div className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            支持特性
          </div>
          <div className="flex flex-wrap gap-2">
            {LLM_FEATURE_SWITCHES.map((feature) => {
              const checked = props.model.features[feature.key] ?? false;
              return (
                <button
                  key={feature.key}
                  type="button"
                  onClick={() => props.onToggleFeature(feature.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                    checked
                      ? "bg-zinc-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                      : "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300"
                  }`}
                >
                  {feature.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

type EmbeddingModelEditorProps = {
  model: EmbeddingModelConfig;
  onCommit: (patch: Partial<EmbeddingModelConfig>) => void;
  onToggleMultimodal: () => void;
  onDelete: () => void;
};

function EmbeddingModelEditor(props: EmbeddingModelEditorProps) {
  const [nameDraft, setNameDraft] = useState(props.model.name);
  const [descriptionDraft, setDescriptionDraft] = useState(
    props.model.description,
  );
  const [contextLengthDraft, setContextLengthDraft] = useState(
    props.model.contextLength > 0 ? String(props.model.contextLength) : "",
  );
  const [distanceDraft, setDistanceDraft] = useState(
    props.model.distance > 0 ? String(props.model.distance) : "",
  );

  useEffect(() => {
    setNameDraft(props.model.name);
    setDescriptionDraft(props.model.description);
    setContextLengthDraft(
      props.model.contextLength > 0 ? String(props.model.contextLength) : "",
    );
    setDistanceDraft(
      props.model.distance > 0 ? String(props.model.distance) : "",
    );
  }, [
    props.model.contextLength,
    props.model.description,
    props.model.distance,
    props.model.name,
  ]);

  return (
    <div className="rounded-xl border border-gray-200 p-3 dark:border-neutral-700">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
          {props.model.name}
        </div>
        <button
          type="button"
          onClick={props.onDelete}
          className="rounded-md px-2 py-1 text-xs text-red-600 transition-colors active:bg-red-50 dark:text-red-300 dark:active:bg-red-500/10"
        >
          删除
        </button>
      </div>
      <div className="mt-3 space-y-3">
        <FieldInput
          label="模型名称"
          value={nameDraft}
          onChange={setNameDraft}
          onBlur={() => props.onCommit({ name: nameDraft.trim() })}
          placeholder="请输入模型名称"
        />
        <FieldInput
          label="模型描述"
          value={descriptionDraft}
          onChange={setDescriptionDraft}
          onBlur={() =>
            props.onCommit({ description: descriptionDraft.trim() })
          }
          placeholder="请输入模型描述"
        />
        <FieldInput
          label="向量长度"
          type="number"
          value={contextLengthDraft}
          onChange={setContextLengthDraft}
          onBlur={() => {
            const value = Number(contextLengthDraft);
            props.onCommit({
              contextLength: Number.isFinite(value) ? value : 0,
            });
          }}
          placeholder="1536"
        />
        <FieldInput
          label="距离阈值"
          type="number"
          value={distanceDraft}
          onChange={setDistanceDraft}
          onBlur={() => {
            const value = Number(distanceDraft);
            props.onCommit({ distance: Number.isFinite(value) ? value : 0 });
          }}
          placeholder="0.3"
        />
        <div>
          <div className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            特性
          </div>
          <button
            type="button"
            onClick={props.onToggleMultimodal}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
              props.model.features.multimodal
                ? "bg-zinc-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
          >
            多模态
          </button>
        </div>
      </div>
    </div>
  );
}

export function AIHomeSection(props: {
  onOpenModule: (module: Exclude<SettingModule, null>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="list-group p-4">
        <UsageHint />
      </div>
      <div className="list-group">
        <ListItem
          icon={<IconCloud />}
          label="LLM 配置"
          onClick={() => props.onOpenModule("ai-llm-configs")}
        />
        <ListItem
          icon={<IconCloud />}
          label="功能模型分配"
          onClick={() => props.onOpenModule("ai-llm-usage")}
        />
        <ListItem
          icon={<IconCloud />}
          label="Embedding API"
          onClick={() => props.onOpenModule("ai-embedding-api")}
        />
      </div>
    </div>
  );
}

export function AILlmConfigsSection(props: AICommonProps) {
  const llmState = useMemo(() => {
    if (!props.safeSetting) {
      return {
        llmConfigs: [] as ReturnType<typeof normalizeLlmConfigs>,
        llmUsageSettings: normalizeLlmUsageSettings(null),
      };
    }
    return readLlmState(props.safeSetting);
  }, [props.safeSetting]);

  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [baseUrlDraft, setBaseUrlDraft] = useState("");

  useEffect(() => {
    if (llmState.llmConfigs.length === 0) {
      setSelectedConfigId("");
      return;
    }
    if (
      selectedConfigId &&
      llmState.llmConfigs.some((item) => item.id === selectedConfigId)
    ) {
      return;
    }
    setSelectedConfigId(llmState.llmConfigs[0].id);
  }, [llmState.llmConfigs, selectedConfigId]);

  const activeConfig = useMemo(() => {
    return (
      llmState.llmConfigs.find((item) => item.id === selectedConfigId) ??
      llmState.llmConfigs[0]
    );
  }, [llmState.llmConfigs, selectedConfigId]);

  useEffect(() => {
    if (!activeConfig) {
      setNameDraft("");
      setApiKeyDraft("");
      setBaseUrlDraft("");
      return;
    }
    setNameDraft(activeConfig.name);
    setApiKeyDraft(activeConfig.apiKey);
    setBaseUrlDraft(activeConfig.baseUrl);
  }, [activeConfig]);

  const handleAddConfig = () => {
    const id = createId();
    persistLlmState(props.updateSetting, (configs, usage) => ({
      configs: [
        ...configs,
        {
          id,
          name: "新配置",
          apiKey: "",
          baseUrl: "",
          models: [],
        },
      ],
      usage,
    }));
    setSelectedConfigId(id);
  };

  const handleDeleteConfig = (configId: string) => {
    persistLlmState(props.updateSetting, (configs, usage) => ({
      configs: configs.filter((item) => item.id !== configId),
      usage,
    }));
    if (selectedConfigId === configId) {
      const remain = llmState.llmConfigs.filter((item) => item.id !== configId);
      setSelectedConfigId(remain[0]?.id ?? "");
    }
  };

  const commitActiveConfig = (
    patch: Partial<
      Pick<(typeof llmState.llmConfigs)[number], "name" | "apiKey" | "baseUrl">
    >,
  ) => {
    if (!activeConfig) return;
    persistLlmState(props.updateSetting, (configs, usage) => ({
      configs: configs.map((item) =>
        item.id === activeConfig.id
          ? {
              ...item,
              ...patch,
              name: getProviderDisplayName(patch.name ?? item.name),
            }
          : item,
      ),
      usage,
    }));
  };

  const addModel = () => {
    if (!activeConfig) return;
    if (!isLlmProviderReady(activeConfig)) return;
    persistLlmState(props.updateSetting, (configs, usage) => ({
      configs: configs.map((item) => {
        if (item.id !== activeConfig.id) return item;
        const modelIndex = item.models.length + 1;
        return {
          ...item,
          models: [
            ...item.models,
            {
              name: `new-model-${modelIndex}`,
              description: "",
              features: {
                online: false,
                thinking: false,
                image: false,
                video: false,
                audio: false,
                file: false,
              },
            },
          ],
        };
      }),
      usage,
    }));
  };

  const updateModelByIndex = (
    index: number,
    updater: (model: LlmModelConfig) => LlmModelConfig,
  ) => {
    if (!activeConfig) return;
    persistLlmState(props.updateSetting, (configs, usage) => {
      let renamedFrom = "";
      let renamedTo = "";
      const nextConfigs = configs.map((item) => {
        if (item.id !== activeConfig.id) return item;
        const current = item.models[index];
        if (!current) return item;
        const nextModel = updater(current);
        renamedFrom = current.name;
        renamedTo = nextModel.name;
        const nextModels = item.models.map((model, modelIndex) =>
          modelIndex === index ? nextModel : model,
        );
        return { ...item, models: nextModels };
      });

      if (!renamedFrom || !renamedTo || renamedFrom === renamedTo) {
        return { configs: nextConfigs, usage };
      }

      const nextUsage = { ...usage };
      for (const feature of LLM_FEATURE_KEYS) {
        const currentUsage = nextUsage[feature];
        if (
          currentUsage &&
          currentUsage.providerId === activeConfig.id &&
          currentUsage.modelName === renamedFrom
        ) {
          nextUsage[feature] = {
            ...currentUsage,
            modelName: renamedTo,
          };
        }
      }
      return { configs: nextConfigs, usage: nextUsage };
    });
  };

  const deleteModelByIndex = (index: number) => {
    if (!activeConfig) return;
    persistLlmState(props.updateSetting, (configs, usage) => ({
      configs: configs.map((item) => {
        if (item.id !== activeConfig.id) return item;
        return {
          ...item,
          models: item.models.filter((_, modelIndex) => modelIndex !== index),
        };
      }),
      usage,
    }));
  };

  const canAddLlmModel = Boolean(
    activeConfig && isLlmProviderReady(activeConfig),
  );

  return (
    <div className="space-y-4">
      <div className="list-group p-4">
        <UsageHint />
      </div>

      <div className="list-group p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
            Provider 列表
          </div>
          <button
            type="button"
            onClick={handleAddConfig}
            className="rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-transform active:scale-[0.98] dark:bg-neutral-100 dark:text-neutral-900"
          >
            + 新增 Provider
          </button>
        </div>
        <div className="space-y-2">
          {llmState.llmConfigs.map((config) => {
            const isActive = activeConfig?.id === config.id;
            const ready = isLlmProviderReady(config);
            return (
              <div
                key={config.id}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  isActive
                    ? "border-gray-900/60 bg-zinc-900/5 dark:border-neutral-200/70 dark:bg-neutral-200/10"
                    : "border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/60"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedConfigId(config.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      {getProviderDisplayName(config.name)}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className="text-gray-400 dark:text-gray-500">
                        {config.models.length} 个模型
                      </span>
                      {!ready ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                          未完成配置
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteConfig(config.id)}
                  className="rounded-md px-2 py-1 text-xs text-rose-500 transition-colors active:bg-rose-50 dark:text-rose-300 dark:active:bg-rose-500/10"
                >
                  删除
                </button>
              </div>
            );
          })}
          {llmState.llmConfigs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500 dark:border-neutral-700 dark:text-neutral-400">
              暂无 Provider，点击上方按钮新增。
            </div>
          ) : null}
        </div>
      </div>

      {activeConfig ? (
        <>
          <div className="list-group p-4">
            <div className="space-y-3">
              <FieldInput
                label="配置名称"
                value={nameDraft}
                onChange={setNameDraft}
                onBlur={() => commitActiveConfig({ name: nameDraft.trim() })}
                placeholder="请输入配置名称"
              />
              <FieldInput
                label="API Key"
                type="password"
                value={apiKeyDraft}
                onChange={setApiKeyDraft}
                onBlur={() =>
                  commitActiveConfig({ apiKey: apiKeyDraft.trim() })
                }
                placeholder="请输入 API Key"
              />
              <FieldInput
                label="Base URL"
                value={baseUrlDraft}
                onChange={setBaseUrlDraft}
                onBlur={() =>
                  commitActiveConfig({ baseUrl: baseUrlDraft.trim() })
                }
                placeholder="请输入 Base URL"
              />
            </div>
          </div>

          <div className="list-group p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                模型列表
              </div>
              <button
                type="button"
                onClick={addModel}
                disabled={!canAddLlmModel}
                className="rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 dark:bg-neutral-100 dark:text-neutral-900"
              >
                + 新增模型
              </button>
            </div>
            {!canAddLlmModel ? (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                请先填写当前 Provider 的 API Key 和 Base URL，再新增模型。
              </div>
            ) : null}
            <div className="space-y-3">
              {activeConfig.models.map((model, index) => (
                <LlmModelEditor
                  key={`${model.name}-${index}`}
                  model={model}
                  onCommitName={(value) => {
                    const nextName = value.trim();
                    if (!nextName || nextName === model.name) return;
                    updateModelByIndex(index, (current) => ({
                      ...current,
                      name: nextName,
                    }));
                  }}
                  onCommitDescription={(value) => {
                    const nextDescription = value.trim();
                    if (nextDescription === model.description) return;
                    updateModelByIndex(index, (current) => ({
                      ...current,
                      description: nextDescription,
                    }));
                  }}
                  onToggleFeature={(featureKey) => {
                    updateModelByIndex(index, (current) => ({
                      ...current,
                      features: {
                        ...current.features,
                        [featureKey]: !current.features[featureKey],
                      },
                    }));
                  }}
                  onDelete={() => deleteModelByIndex(index)}
                />
              ))}
              {activeConfig.models.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500 dark:border-neutral-700 dark:text-neutral-400">
                  当前 Provider 暂无模型。
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function AILlmUsageSection(props: AICommonProps) {
  const llmState = useMemo(() => {
    if (!props.safeSetting) {
      return {
        llmConfigs: [] as ReturnType<typeof normalizeLlmConfigs>,
        llmUsageSettings: normalizeLlmUsageSettings(null),
      };
    }
    return readLlmState(props.safeSetting);
  }, [props.safeSetting]);

  const [providerSheetFeature, setProviderSheetFeature] =
    useState<LlmFeatureKey | null>(null);
  const [modelSheetFeature, setModelSheetFeature] =
    useState<LlmFeatureKey | null>(null);

  const providerOptions = useMemo(
    () =>
      llmState.llmConfigs.map((config) => ({
        label: getProviderDisplayName(config.name),
        value: config.id,
      })),
    [llmState.llmConfigs],
  );

  const activeModelOptions = useMemo(() => {
    if (!modelSheetFeature) return [];
    const currentUsage = llmState.llmUsageSettings[modelSheetFeature];
    if (!currentUsage) return [];
    const provider = llmState.llmConfigs.find(
      (item) => item.id === currentUsage.providerId,
    );
    if (!provider) return [];
    return provider.models.map((model) => ({
      label: `${model.name}${model.description ? ` / ${model.description}` : ""}`,
      value: model.name,
    }));
  }, [llmState.llmConfigs, llmState.llmUsageSettings, modelSheetFeature]);

  const handleProviderSelect = (feature: LlmFeatureKey, providerId: string) => {
    persistLlmState(props.updateSetting, (configs, usage) => {
      const provider = configs.find((item) => item.id === providerId);
      const firstModel = provider?.models[0]?.name ?? "";
      const nextUsage = { ...usage };
      nextUsage[feature] = firstModel
        ? {
            providerId,
            modelName: firstModel,
          }
        : null;
      return { configs, usage: nextUsage };
    });
  };

  const handleModelSelect = (feature: LlmFeatureKey, modelName: string) => {
    persistLlmState(props.updateSetting, (configs, usage) => {
      const current = usage[feature];
      if (!current) return { configs, usage };
      const nextUsage = { ...usage };
      nextUsage[feature] = {
        ...current,
        modelName,
      };
      return { configs, usage: nextUsage };
    });
  };

  return (
    <div className="space-y-4">
      <div className="list-group p-4">
        <UsageHint />
      </div>

      {LLM_USAGE_GROUPS.map((group) => (
        <div key={group.key} className="list-group p-4">
          <div className="mb-3 text-sm font-medium text-gray-800 dark:text-gray-100">
            {group.label}
          </div>
          <div className="space-y-4">
            {group.features.map((feature) => {
              const usage = llmState.llmUsageSettings[feature];
              const provider = usage
                ? llmState.llmConfigs.find(
                    (item) => item.id === usage.providerId,
                  )
                : undefined;
              const model = provider?.models.find(
                (item) => item.name === usage?.modelName,
              );
              return (
                <div
                  key={feature}
                  className="rounded-xl border border-gray-200 p-3 dark:border-neutral-700"
                >
                  <div className="mb-3 text-sm font-medium text-gray-800 dark:text-gray-100">
                    {LLM_FEATURE_LABELS[feature]}
                  </div>
                  <div className="space-y-3">
                    <FieldSheetTrigger
                      label="Provider"
                      value={
                        provider ? getProviderDisplayName(provider.name) : ""
                      }
                      placeholder="请选择 Provider"
                      onOpen={() => setProviderSheetFeature(feature)}
                      disabled={providerOptions.length === 0}
                    />
                    <FieldSheetTrigger
                      label="Model"
                      value={model ? model.name : ""}
                      placeholder={
                        provider ? "请选择模型" : "请先选择 Provider"
                      }
                      onOpen={() => setModelSheetFeature(feature)}
                      disabled={!provider || provider.models.length === 0}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <ActionSheet
        open={providerSheetFeature !== null}
        title={
          providerSheetFeature
            ? `选择 Provider（${LLM_FEATURE_LABELS[providerSheetFeature]}）`
            : "选择 Provider"
        }
        value={
          providerSheetFeature
            ? (llmState.llmUsageSettings[providerSheetFeature]?.providerId ??
              "")
            : ""
        }
        options={providerOptions}
        emptyText="暂无 Provider"
        onClose={() => setProviderSheetFeature(null)}
        onSelect={(value) => {
          if (!providerSheetFeature) return;
          handleProviderSelect(providerSheetFeature, value);
        }}
      />

      <ActionSheet
        open={modelSheetFeature !== null}
        title={
          modelSheetFeature
            ? `选择模型（${LLM_FEATURE_LABELS[modelSheetFeature]}）`
            : "选择模型"
        }
        value={
          modelSheetFeature
            ? (llmState.llmUsageSettings[modelSheetFeature]?.modelName ?? "")
            : ""
        }
        options={activeModelOptions}
        emptyText="暂无模型"
        onClose={() => setModelSheetFeature(null)}
        onSelect={(value) => {
          if (!modelSheetFeature) return;
          handleModelSelect(modelSheetFeature, value);
        }}
      />
    </div>
  );
}

export function AIEmbeddingApiSection(props: AICommonProps) {
  const embeddingState = useMemo(() => {
    if (!props.safeSetting) {
      return {
        localConfigs: [] as unknown[],
        apiConfigs: [] as EmbeddingApiConfig[],
        currentConfigId: "",
      };
    }
    const state = readEmbeddingState(props.safeSetting);
    return {
      localConfigs: state.localConfigs,
      apiConfigs: state.apiConfigs,
      currentConfigId: state.currentConfigId,
    };
  }, [props.safeSetting]);

  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [providerSheetOpen, setProviderSheetOpen] = useState(false);
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [baseUrlDraft, setBaseUrlDraft] = useState("");

  useEffect(() => {
    if (embeddingState.apiConfigs.length === 0) {
      setSelectedConfigId("");
      return;
    }
    if (
      selectedConfigId &&
      embeddingState.apiConfigs.some((item) => item.id === selectedConfigId)
    ) {
      return;
    }
    setSelectedConfigId(
      embeddingState.currentConfigId || embeddingState.apiConfigs[0].id,
    );
  }, [
    embeddingState.apiConfigs,
    embeddingState.currentConfigId,
    selectedConfigId,
  ]);

  const activeConfig = useMemo(() => {
    return (
      embeddingState.apiConfigs.find((item) => item.id === selectedConfigId) ??
      embeddingState.apiConfigs[0]
    );
  }, [embeddingState.apiConfigs, selectedConfigId]);

  useEffect(() => {
    if (!activeConfig) {
      setNameDraft("");
      setApiKeyDraft("");
      setBaseUrlDraft("");
      return;
    }
    setNameDraft(activeConfig.name);
    setApiKeyDraft(activeConfig.apiKey);
    setBaseUrlDraft(activeConfig.baseUrl);
  }, [activeConfig]);

  const providerOptions = useMemo(
    () =>
      embeddingState.apiConfigs.map((config) => ({
        label: getProviderDisplayName(config.name),
        value: config.id,
      })),
    [embeddingState.apiConfigs],
  );
  const modelOptions = useMemo(
    () =>
      activeConfig
        ? activeConfig.models.map((model) => ({
            label: `${model.name}${
              model.description ? ` / ${model.description}` : ""
            }`,
            value: model.name,
          }))
        : [],
    [activeConfig],
  );

  const addConfig = () => {
    const id = createId();
    persistEmbeddingState(props.updateSetting, (configs) => ({
      configs: [
        ...configs,
        {
          id,
          name: "新 Embedding API",
          providerType: "remote_openai",
          apiKey: "",
          baseUrl: "",
          models: [],
          currentModel: "",
        },
      ],
      currentConfigId: id,
    }));
    setSelectedConfigId(id);
  };

  const deleteConfig = (configId: string) => {
    persistEmbeddingState(props.updateSetting, (configs, currentConfigId) => ({
      configs: configs.filter((item) => item.id !== configId),
      currentConfigId:
        currentConfigId === configId
          ? configs.find((item) => item.id !== configId)?.id
          : currentConfigId,
    }));
  };

  const commitConfigPatch = (
    patch: Partial<Pick<EmbeddingApiConfig, "name" | "apiKey" | "baseUrl">>,
  ) => {
    if (!activeConfig) return;
    persistEmbeddingState(props.updateSetting, (configs, currentConfigId) => ({
      configs: configs.map((item) =>
        item.id === activeConfig.id
          ? {
              ...item,
              ...patch,
              name: getProviderDisplayName(patch.name ?? item.name),
            }
          : item,
      ),
      currentConfigId,
    }));
  };

  const updateEmbeddingModelByIndex = (
    index: number,
    updater: (model: EmbeddingModelConfig) => EmbeddingModelConfig,
  ) => {
    if (!activeConfig) return;
    persistEmbeddingState(props.updateSetting, (configs, currentConfigId) => ({
      configs: configs.map((item) => {
        if (item.id !== activeConfig.id) return item;
        const current = item.models[index];
        if (!current) return item;
        const nextModel = updater(current);
        const nextModels = item.models.map((model, modelIndex) =>
          modelIndex === index ? nextModel : model,
        );
        const currentModel =
          item.currentModel === current.name
            ? nextModel.name
            : item.currentModel;
        return {
          ...item,
          currentModel,
          models: nextModels,
        };
      }),
      currentConfigId,
    }));
  };

  const addEmbeddingModel = () => {
    if (!activeConfig) return;
    if (!isEmbeddingProviderReady(activeConfig)) return;
    persistEmbeddingState(props.updateSetting, (configs, currentConfigId) => ({
      configs: configs.map((item) => {
        if (item.id !== activeConfig.id) return item;
        const modelName = `embedding-model-${item.models.length + 1}`;
        const nextModels = [
          ...item.models,
          {
            name: modelName,
            description: "",
            contextLength: 1536,
            distance: 0.3,
            features: {
              multimodal: false,
            },
          },
        ];
        return {
          ...item,
          models: nextModels,
          currentModel: item.currentModel || modelName,
        };
      }),
      currentConfigId,
    }));
  };

  const deleteEmbeddingModel = (index: number) => {
    if (!activeConfig) return;
    persistEmbeddingState(props.updateSetting, (configs, currentConfigId) => ({
      configs: configs.map((item) => {
        if (item.id !== activeConfig.id) return item;
        const target = item.models[index];
        if (!target) return item;
        const nextModels = item.models.filter(
          (_, modelIndex) => modelIndex !== index,
        );
        const nextCurrentModel =
          item.currentModel === target.name
            ? (nextModels[0]?.name ?? "")
            : item.currentModel;
        return {
          ...item,
          currentModel: nextCurrentModel,
          models: nextModels,
        };
      }),
      currentConfigId,
    }));
  };

  const canAddEmbeddingModel = Boolean(
    activeConfig && isEmbeddingProviderReady(activeConfig),
  );

  return (
    <div className="space-y-4">
      <div className="list-group p-4">
        <UsageHint />
        {embeddingState.localConfigs.length > 0 ? (
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            检测到 {embeddingState.localConfigs.length} 个本地 embedding
            配置，移动端已隐藏且不会改写。
          </p>
        ) : null}
      </div>

      <div className="list-group p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
            API Provider
          </div>
          <button
            type="button"
            onClick={addConfig}
            className="rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-transform active:scale-[0.98] dark:bg-neutral-100 dark:text-neutral-900"
          >
            + 新增 Provider
          </button>
        </div>
        <div className="space-y-2">
          {embeddingState.apiConfigs.map((config) => {
            const isActive = activeConfig?.id === config.id;
            return (
              <div
                key={config.id}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                  isActive
                    ? "border-gray-900 bg-zinc-900/5 dark:border-neutral-200 dark:bg-neutral-200/10"
                    : "border-gray-200 dark:border-neutral-700"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedConfigId(config.id);
                    persistEmbeddingState(
                      props.updateSetting,
                      (configs, currentConfigId) => ({
                        configs,
                        currentConfigId:
                          currentConfigId === config.id
                            ? currentConfigId
                            : config.id,
                      }),
                    );
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <div>
                    <div className="text-sm text-gray-800 dark:text-gray-100">
                      {getProviderDisplayName(config.name)}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      {config.models.length} 个模型
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => deleteConfig(config.id)}
                  className="rounded-md px-2 py-1 text-xs text-red-600 transition-colors active:bg-red-50 dark:text-red-300 dark:active:bg-red-500/10"
                >
                  删除
                </button>
              </div>
            );
          })}
          {embeddingState.apiConfigs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500 dark:border-neutral-700 dark:text-neutral-400">
              暂无 API Provider，点击上方按钮新增。
            </div>
          ) : null}
        </div>
      </div>

      {activeConfig ? (
        <>
          <div className="list-group p-4 space-y-3">
            <FieldSheetTrigger
              label="当前启用 Provider"
              value={getProviderDisplayName(activeConfig.name)}
              placeholder="请选择 Provider"
              onOpen={() => setProviderSheetOpen(true)}
              disabled={providerOptions.length === 0}
            />
            <FieldInput
              label="配置名称"
              value={nameDraft}
              onChange={setNameDraft}
              onBlur={() => commitConfigPatch({ name: nameDraft.trim() })}
              placeholder="请输入配置名称"
            />
            <FieldInput
              label="API Key"
              type="password"
              value={apiKeyDraft}
              onChange={setApiKeyDraft}
              onBlur={() => commitConfigPatch({ apiKey: apiKeyDraft.trim() })}
              placeholder="请输入 API Key"
            />
            <FieldInput
              label="Base URL"
              value={baseUrlDraft}
              onChange={setBaseUrlDraft}
              onBlur={() => commitConfigPatch({ baseUrl: baseUrlDraft.trim() })}
              placeholder="请输入 Base URL"
            />
            <FieldSheetTrigger
              label="当前模型"
              value={activeConfig.currentModel}
              placeholder={
                activeConfig.models.length > 0 ? "请选择模型" : "请先新增模型"
              }
              onOpen={() => setModelSheetOpen(true)}
              disabled={activeConfig.models.length === 0}
            />
          </div>

          <div className="list-group p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                Embedding 模型
              </div>
              <button
                type="button"
                onClick={addEmbeddingModel}
                disabled={!canAddEmbeddingModel}
                className="rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 dark:bg-neutral-100 dark:text-neutral-900"
              >
                + 新增模型
              </button>
            </div>
            {!canAddEmbeddingModel ? (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                请先填写当前 Provider 的 API Key 和 Base URL，再新增模型。
              </div>
            ) : null}
            <FieldSheetTrigger
              label="当前模型"
              value={activeConfig.currentModel}
              placeholder={
                activeConfig.models.length > 0 ? "请选择模型" : "请先新增模型"
              }
              onOpen={() => setModelSheetOpen(true)}
              disabled={activeConfig.models.length === 0}
            />
            <div className="mt-3 space-y-3">
              {activeConfig.models.map((model, index) => (
                <EmbeddingModelEditor
                  key={`${model.name}-${index}`}
                  model={model}
                  onCommit={(patch) => {
                    updateEmbeddingModelByIndex(index, (current) => ({
                      ...current,
                      ...patch,
                      name: patch.name?.trim() || current.name,
                    }));
                  }}
                  onToggleMultimodal={() => {
                    updateEmbeddingModelByIndex(index, (current) => ({
                      ...current,
                      features: {
                        multimodal: !current.features.multimodal,
                      },
                    }));
                  }}
                  onDelete={() => deleteEmbeddingModel(index)}
                />
              ))}
              {activeConfig.models.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500 dark:border-neutral-700 dark:text-neutral-400">
                  当前 Provider 暂无模型。
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      <ActionSheet
        open={providerSheetOpen}
        title="选择当前 Provider"
        value={activeConfig?.id ?? ""}
        options={providerOptions}
        emptyText="暂无 Provider"
        onClose={() => setProviderSheetOpen(false)}
        onSelect={(value) => {
          setSelectedConfigId(value);
          persistEmbeddingState(props.updateSetting, (configs) => ({
            configs,
            currentConfigId: value,
          }));
        }}
      />

      <ActionSheet
        open={modelSheetOpen}
        title="选择当前模型"
        value={activeConfig?.currentModel ?? ""}
        options={modelOptions}
        emptyText="暂无模型"
        onClose={() => setModelSheetOpen(false)}
        onSelect={(value) => {
          if (!activeConfig) return;
          persistEmbeddingState(
            props.updateSetting,
            (configs, currentConfigId) => ({
              configs: configs.map((item) =>
                item.id === activeConfig.id
                  ? {
                      ...item,
                      currentModel: value,
                    }
                  : item,
              ),
              currentConfigId,
            }),
          );
        }}
      />
    </div>
  );
}
