/**
 * 嵌入模型 —— 本地 / API 双态一页（Segmented 首个消费者）+ 检索模型共享节。
 *
 * 定稿：mockups/settings/embedding-plans.html（案 1 分段，2026-09-23）。分段 =
 * 模型来源（embeddingProvider.currentConfigId 单选，本地 ⇄ API 互斥）；本地态是
 * 下载管理器（下载源 / 设备策略 / 批大小 + 模型下载与启用），API 态是 Provider
 * 配置 + 模型登记。三类切换（本地 ⇄ API / Provider 激活 / 模型启用）都触发后台
 * 重建向量索引，一律 ConfirmDialog 确认；即时保存（无应答区）。检索模型独立于
 * 来源，常驻切换区之外。命令族全量复用 legacy（embedding-model / search-model）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { produce } from "immer";
import { v4 as getUuid } from "uuid";
import {
  Activity,
  Download,
  Globe,
  HardDrive,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";
import { Button, ConfirmDialog, Dialog, Input, Segmented, Select, Switch, toast } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import {
  cancelEmbeddingDownload,
  cancelSearchDownload,
  deleteEmbeddingModel,
  deleteSearchModel,
  downloadEmbeddingModel,
  downloadSearchModel,
  embeddingModelHealth,
  getEmbeddingModels,
  getSearchModels,
  onEmbeddingDownloadProgress,
  onSearchDownloadProgress,
  type EmbeddingDownloadSource,
  type EmbeddingModelInfo,
  type SearchModelInfo,
} from "@/commands";
import { DEFAULT_LOCAL_EMBEDDING_DISTANCE } from "@/constants/embedding";
import { SettingRow } from "../components/SettingRow";
import { SectionTitle } from "../components/SectionTitle";

/** 本地嵌入的唯一配置 id（API 配置之外常驻，legacy 同名常量对齐） */
const LOCAL_CONFIG_ID = "embedding-default-local";

type DevicePolicy = "auto" | "cpu" | "cuda";

type EmbeddingModelEntry = {
  name: string;
  description: string;
  contextLength: number;
  features: { multimodal: boolean };
  distance: number;
};

type EmbeddingConfigEntry = {
  id: string;
  name: string;
  providerType?: "local_python" | "remote_openai";
  source?: EmbeddingDownloadSource;
  apiKey: string;
  baseUrl: string;
  batchSize?: number;
  devicePolicy?: DevicePolicy;
  currentModel: string;
  models: EmbeddingModelEntry[];
};

const DOWNLOAD_SOURCE_OPTIONS = [
  { value: "modelscope", label: "ModelScope" },
  { value: "huggingface", label: "HuggingFace" },
];

const DEVICE_OPTIONS = [
  { value: "auto", label: "自动" },
  { value: "cpu", label: "CPU" },
  { value: "cuda", label: "CUDA" },
];

interface ConfirmSpec {
  title: string;
  description?: string;
  context?: string;
  danger?: boolean;
  confirmText?: string;
  action: () => void | Promise<void>;
}

/** 单次 produce 更新嵌入配置（updater 内禁止副作用，toast 等在外层做） */
const mutateConfigs = (updater: (configs: EmbeddingConfigEntry[]) => void) => {
  useSettingStore.setState(s => ({
    setting: produce(s.setting, draft => {
      updater(draft.embeddingProvider.configs as EmbeddingConfigEntry[]);
    }),
  }));
};

export function EmbeddingSection() {
  const provider = useSettingStore(s => s.setting.embeddingProvider);

  /* ── 本地配置常驻兜底（legacy 同款：首开补建 + 字段回填 + 默认指向本地） ── */
  useEffect(() => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        const p = draft.embeddingProvider;
        if (!p.configs.find(c => c.id === LOCAL_CONFIG_ID)) {
          p.configs.unshift({
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
          });
        }
        const local = p.configs.find(c => c.id === LOCAL_CONFIG_ID);
        if (local) {
          local.providerType = "local_python";
          local.name = "本地嵌入模型";
          local.source = local.source || "modelscope";
          local.batchSize = local.batchSize || 8;
          local.devicePolicy = local.devicePolicy || "auto";
        }
        if (!p.currentConfigId) p.currentConfigId = LOCAL_CONFIG_ID;
      }),
    }));
  }, []);

  const configs = provider.configs as EmbeddingConfigEntry[];
  const localConfig = configs.find(c => c.id === LOCAL_CONFIG_ID);
  const apiConfigs = configs.filter(c => c.id !== LOCAL_CONFIG_ID);
  const currentApiConfig = apiConfigs.find(c => c.id === provider.currentConfigId) ?? apiConfigs[0];
  const source: "local" | "api" =
    provider.currentConfigId === LOCAL_CONFIG_ID || !currentApiConfig ? "local" : "api";
  const currentConfig = source === "local" ? localConfig : currentApiConfig;

  /* ── 确认弹窗（索引重建类切换共用一扇） ── */
  const [confirmSpec, setConfirmSpec] = useState<ConfirmSpec | null>(null);
  const runConfirmed = (spec: ConfirmSpec) => setConfirmSpec(spec);

  /* ── 来源切换：本地 ⇄ API（无 API 配置时先补 Provider） ── */
  const [providerEditor, setProviderEditor] = useState<
    { action: "create" } | { action: "edit"; config: EmbeddingConfigEntry } | null
  >(null);

  const switchSource = (next: "local" | "api") => {
    if (next === source) return;
    if (next === "api" && apiConfigs.length === 0) {
      toast.info("请先添加 API Provider");
      setProviderEditor({ action: "create" });
      return;
    }
    runConfirmed({
      title: "切换嵌入模型来源",
      description: "切换后将由后台自动处理向量索引",
      danger: true,
      action: () => {
        useSettingStore.setState(s => ({
          setting: produce(s.setting, draft => {
            draft.embeddingProvider.currentConfigId =
              next === "local" ? LOCAL_CONFIG_ID : (currentApiConfig?.id ?? LOCAL_CONFIG_ID);
          }),
        }));
        toast.success("已切换来源，后台正在自动处理索引");
      },
    });
  };

  /* ── 本地模型列表（getEmbeddingModels 实读 + 下载进度） ── */
  const [localModels, setLocalModels] = useState<EmbeddingModelInfo[]>([]);
  const [localLoadError, setLocalLoadError] = useState("");
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadMessage, setDownloadMessage] = useState("");
  const downloadingModelRef = useRef<string | null>(null);
  const [healthInfo, setHealthInfo] = useState<{
    loaded?: boolean;
    device?: string;
    dimensions?: number;
    model_path?: string;
  } | null>(null);

  const loadLocalModels = useCallback(async () => {
    try {
      const result = await getEmbeddingModels();
      if (result.success && result.data) {
        setLocalModels(result.data);
        setLocalLoadError("");
      } else {
        setLocalModels([]);
        setLocalLoadError(result.error || "获取本地模型列表失败");
      }
    } catch (error) {
      setLocalModels([]);
      setLocalLoadError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    if (source === "local") void loadLocalModels();
  }, [source, loadLocalModels]);

  useEffect(() => {
    const unsubscribe = onEmbeddingDownloadProgress(progress => {
      if (progress.modelName === downloadingModelRef.current) {
        setDownloadProgress(progress.percentage);
        setDownloadMessage(progress.message || "");
      }
    });
    return () => unsubscribe();
  }, []);

  const updateLocalSource = (value: EmbeddingDownloadSource) =>
    mutateConfigs(configs => {
      const local = configs.find(c => c.id === LOCAL_CONFIG_ID);
      if (local) local.source = value;
    });

  const updateLocalDevice = (value: DevicePolicy) =>
    mutateConfigs(configs => {
      const local = configs.find(c => c.id === LOCAL_CONFIG_ID);
      if (local) local.devicePolicy = value;
    });

  const updateLocalBatchSize = (value: string) => {
    const next = Number.parseInt(value || "8", 10);
    mutateConfigs(configs => {
      const local = configs.find(c => c.id === LOCAL_CONFIG_ID);
      if (local) local.batchSize = Number.isFinite(next) && next > 0 ? next : 8;
    });
  };

  const activateLocalModel = (model: EmbeddingModelInfo) => {
    if (localConfig?.currentModel === model.name) return;
    runConfirmed({
      title: "切换嵌入模型",
      description: "不同的嵌入模型不能共用，之前的嵌入数据将会被删除",
      context: model.label,
      danger: true,
      action: async () => {
        mutateConfigs(configs => {
          const local = configs.find(c => c.id === LOCAL_CONFIG_ID);
          if (!local) return;
          if (!local.models.find(m => m.name === model.name)) {
            local.models.push({
              name: model.name,
              description: "本地离线 embedding 模型",
              contextLength: model.dimensions,
              distance: DEFAULT_LOCAL_EMBEDDING_DISTANCE,
              features: { multimodal: false },
            });
          }
          local.currentModel = model.name;
        });
        // 启用后预热（失败不阻塞启用，后台索引照常重建）
        try {
          await embeddingModelHealth(model.name, localConfig?.devicePolicy || "auto");
        } catch {
          /* 预热失败不影响启用 */
        }
        toast.success("模型已启用，后台正在自动处理索引");
      },
    });
  };

  const deleteLocalModel = (model: EmbeddingModelInfo) => {
    runConfirmed({
      title: "删除本地模型",
      description: "删除后需要重新下载才能使用",
      context: model.label,
      danger: true,
      confirmText: "删除",
      action: async () => {
        const result = await deleteEmbeddingModel(model.name);
        if (result.success) {
          toast.success("删除成功");
          await loadLocalModels();
        } else {
          toast.error(result.error || "删除失败");
        }
      },
    });
  };

  const downloadLocalModel = async (model: EmbeddingModelInfo) => {
    setDownloadingModel(model.name);
    downloadingModelRef.current = model.name;
    setDownloadProgress(0);
    setDownloadMessage("准备下载...");
    try {
      const result = await downloadEmbeddingModel(model.name, localConfig?.source || "modelscope");
      if (result.success) {
        toast.success(`模型 ${model.label} 下载成功`);
        await loadLocalModels();
      } else {
        toast.error(result.error || "下载失败");
      }
    } catch (error) {
      toast.error(`下载失败: ${error}`);
    } finally {
      setDownloadingModel(null);
      downloadingModelRef.current = null;
      setDownloadProgress(0);
      setDownloadMessage("");
    }
  };

  const cancelLocalDownload = async (modelName: string) => {
    await cancelEmbeddingDownload(modelName);
    setDownloadingModel(null);
    downloadingModelRef.current = null;
    setDownloadProgress(0);
    setDownloadMessage("");
    toast.info("已取消下载");
  };

  const handleHealthCheck = async () => {
    if (!currentConfig?.currentModel) {
      toast.warning("请先启用一个模型");
      return;
    }
    try {
      const result = await embeddingModelHealth(
        currentConfig.currentModel,
        currentConfig.devicePolicy || "auto"
      );
      if (!result.success || !result.health) {
        toast.error(result.error || "健康检查失败");
        return;
      }
      setHealthInfo(result.health);
    } catch (error) {
      toast.error(`健康检查失败: ${error}`);
    }
  };

  /* ── API 态：Provider 配置 ── */
  const saveProvider = (data: { name: string; apiKey: string; baseUrl: string; id?: string }) => {
    const editing = providerEditor?.action === "edit" ? providerEditor.config : null;
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        const configs = draft.embeddingProvider.configs as EmbeddingConfigEntry[];
        if (editing) {
          const target = configs.find(c => c.id === editing.id);
          if (target) {
            target.name = data.name || target.name;
            target.apiKey = data.apiKey;
            target.baseUrl = data.baseUrl;
          }
        } else {
          const id = getUuid();
          configs.push({
            id,
            name: data.name || "新 Provider",
            providerType: "remote_openai",
            source: "modelscope",
            apiKey: data.apiKey,
            baseUrl: data.baseUrl,
            batchSize: 8,
            devicePolicy: "auto",
            models: [],
            currentModel: "",
          });
          draft.embeddingProvider.currentConfigId = id;
        }
      }),
    }));
    toast.success(editing ? "Provider 已保存" : "Provider 已添加并启用");
    setProviderEditor(null);
  };

  const activateProvider = (config: EmbeddingConfigEntry) => {
    if (config.id === provider.currentConfigId) return;
    runConfirmed({
      title: "切换嵌入配置",
      description: "切换后将由后台自动处理向量索引",
      context: config.name,
      danger: true,
      action: () => {
        useSettingStore.setState(s => ({
          setting: produce(s.setting, draft => {
            draft.embeddingProvider.currentConfigId = config.id;
          }),
        }));
        toast.success("已切换配置，后台正在自动处理索引");
      },
    });
  };

  const deleteProvider = (config: EmbeddingConfigEntry) => {
    runConfirmed({
      title: "删除此 Provider 配置",
      description: "删除后不可恢复",
      context: config.name,
      danger: true,
      confirmText: "删除",
      action: () => {
        useSettingStore.setState(s => ({
          setting: produce(s.setting, draft => {
            const configs = draft.embeddingProvider.configs as EmbeddingConfigEntry[];
            const index = configs.findIndex(c => c.id === config.id);
            if (index === -1) return;
            configs.splice(index, 1);
            if (draft.embeddingProvider.currentConfigId === config.id) {
              const rest = configs.filter(c => c.id !== LOCAL_CONFIG_ID);
              draft.embeddingProvider.currentConfigId = rest[0]?.id ?? LOCAL_CONFIG_ID;
            }
          }),
        }));
        toast.success("已删除 Provider");
      },
    });
  };

  /* ── API 态：模型登记（弹窗表单） ── */
  const [modelEditor, setModelEditor] = useState<
    { action: "create" } | { action: "edit"; model: EmbeddingModelEntry } | null
  >(null);

  const saveModel = (data: EmbeddingModelEntry) => {
    const providerId = currentApiConfig?.id;
    if (!providerId) return;
    const editing = modelEditor?.action === "edit" ? modelEditor.model : null;
    let contextChanged = false;
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        const target = (draft.embeddingProvider.configs as EmbeddingConfigEntry[]).find(
          c => c.id === providerId
        );
        if (!target) return;
        if (editing) {
          const index = target.models.findIndex(m => m.name === editing.name);
          if (index === -1) return;
          contextChanged = target.models[index].contextLength !== data.contextLength;
          target.models[index] = data;
          if (editing.name !== data.name && target.currentModel === editing.name) {
            target.currentModel = data.name;
          }
        } else {
          target.models.push(data);
        }
      }),
    }));
    if (contextChanged) {
      toast.success("向量维度已更新，后台正在自动重新生成索引");
    }
    setModelEditor(null);
  };

  const deleteApiModel = (model: EmbeddingModelEntry) => {
    const providerId = currentApiConfig?.id;
    if (!providerId) return;
    runConfirmed({
      title: "删除此模型",
      context: model.name,
      danger: true,
      confirmText: "删除",
      action: () => {
        mutateConfigs(configs => {
          const target = configs.find(c => c.id === providerId);
          if (!target) return;
          target.models = target.models.filter(m => m.name !== model.name);
          if (target.currentModel === model.name) {
            target.currentModel = target.models[0]?.name ?? "";
          }
        });
        toast.success("已删除模型");
      },
    });
  };

  const activateApiModel = (model: EmbeddingModelEntry) => {
    const providerId = currentApiConfig?.id;
    if (!providerId || currentApiConfig?.currentModel === model.name) return;
    runConfirmed({
      title: "切换嵌入模型",
      description: "不同的嵌入模型不能共用，之前的嵌入数据将会被删除",
      context: model.name,
      danger: true,
      action: () => {
        mutateConfigs(configs => {
          const target = configs.find(c => c.id === providerId);
          if (target) target.currentModel = model.name;
        });
        toast.success("模型已启用，后台正在自动处理索引");
      },
    });
  };

  return (
    <section>
      <h3 className="text-tau-body-lg font-semibold">嵌入模型</h3>
      <div className="text-tau-tiny text-ink-3 mt-0.5">
        本地模型直接下载；API 模型按 Provider 进行配置与管理
      </div>

      <div className="pt-3.5">
        <Segmented
          label="模型来源"
          value={source}
          onValueChange={v => switchSource(v as "local" | "api")}
        >
          <Segmented.Item value="local" icon={HardDrive} label="本地模型" />
          <Segmented.Item value="api" icon={Globe} label="API 模型" />
        </Segmented>
      </div>

      {source === "local" ? (
        <>
          <SectionTitle title="运行环境" />
          <SettingRow title="下载源" description="模型下载镜像，影响下载地址与速度">
            <Select
              aria-label="本地模型下载源"
              className="w-[168px]"
              value={localConfig?.source || "modelscope"}
              options={DOWNLOAD_SOURCE_OPTIONS}
              disabled={Boolean(downloadingModel)}
              onValueChange={v => updateLocalSource(v as EmbeddingDownloadSource)}
            />
          </SettingRow>
          <SettingRow title="设备策略" description="预热与健康检查的推理设备">
            <Select
              aria-label="本地模型设备策略"
              className="w-[168px]"
              value={localConfig?.devicePolicy || "auto"}
              options={DEVICE_OPTIONS}
              onValueChange={v => updateLocalDevice(v as DevicePolicy)}
            />
          </SettingRow>
          <SettingRow title="批处理大小" description="单次向量化并入库的文档批数">
            <Input
              className="w-[168px] tabular-nums"
              value={String(localConfig?.batchSize ?? 8)}
              onChange={e => updateLocalBatchSize(e.target.value)}
            />
          </SettingRow>

          <SectionTitle
            title={`本地模型 · 已下载 ${localModels.filter(m => m.downloaded).length} / ${localModels.length}`}
          />
          <SettingRow title="健康检查" description="检查当前启用模型的加载状态与向量维度">
            <Button
              variant="secondary"
              size="sm"
              icon={Activity}
              onClick={() => void handleHealthCheck()}
            >
              健康检查
            </Button>
          </SettingRow>
          {localLoadError ? (
            <div className="text-tau-tiny text-ink-3 flex items-center gap-2 py-3">
              <span className="text-warn">本地模型列表加载失败：{localLoadError}</span>
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                onClick={() => void loadLocalModels()}
              >
                重试加载
              </Button>
            </div>
          ) : localModels.length === 0 ? (
            <div className="text-tau-tiny text-ink-3 py-3">
              暂未获取到本地模型列表，可点击「重试加载」或重启应用后再试。
            </div>
          ) : (
            localModels.map(model => (
              <LocalModelRow
                key={model.name}
                model={model}
                active={localConfig?.currentModel === model.name}
                downloading={downloadingModel === model.name}
                downloadProgress={downloadProgress}
                downloadMessage={downloadMessage}
                onActivate={() => activateLocalModel(model)}
                onDelete={() => deleteLocalModel(model)}
                onDownload={() => void downloadLocalModel(model)}
                onCancel={() => void cancelLocalDownload(model.name)}
              />
            ))
          )}
        </>
      ) : (
        <>
          <SectionTitle title={`Provider 配置 · ${apiConfigs.length}`} />
          {apiConfigs.length === 0 && (
            <div className="text-tau-tiny text-ink-3 py-3">
              还没有 API Provider，添加一个即可接入任意 OpenAI 兼容嵌入端点。
            </div>
          )}
          {apiConfigs.map(config => (
            <SettingRow
              key={config.id}
              title={config.name}
              description={`${config.baseUrl || "未配置 Base URL"} · ${config.models.length} 个模型`}
            >
              {config.id === provider.currentConfigId ? (
                <span className="bg-ok-soft text-ok rounded-full px-2 py-px text-[11px] font-semibold">
                  当前使用
                </span>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Zap}
                  onClick={() => activateProvider(config)}
                >
                  启用
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                icon={Pencil}
                onClick={() => setProviderEditor({ action: "edit", config })}
              >
                编辑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                onClick={() => deleteProvider(config)}
              >
                删除
              </Button>
            </SettingRow>
          ))}
          <SettingRow title="新增 Provider" description="接入任意 OpenAI 兼容嵌入端点">
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={() => setProviderEditor({ action: "create" })}
            >
              新增
            </Button>
          </SettingRow>

          <SectionTitle title={`模型列表 · ${currentApiConfig?.name ?? "—"}`} />
          {currentApiConfig ? (
            <>
              {currentApiConfig.models.length === 0 && (
                <div className="text-tau-tiny text-ink-3 py-3">
                  当前 Provider 还没有登记模型，添加模型的名称与向量维度后即可启用。
                </div>
              )}
              {currentApiConfig.models.map(model => (
                <SettingRow
                  key={model.name}
                  title={model.name}
                  description={`${model.contextLength} 维${model.features.multimodal ? " · 多模态" : ""}`}
                >
                  {currentApiConfig.currentModel === model.name ? (
                    <span className="bg-ok-soft text-ok rounded-full px-2 py-px text-[11px] font-semibold">
                      使用中
                    </span>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Zap}
                      onClick={() => activateApiModel(model)}
                    >
                      启用
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Pencil}
                    onClick={() => setModelEditor({ action: "edit", model })}
                  >
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    onClick={() => deleteApiModel(model)}
                  >
                    删除
                  </Button>
                </SettingRow>
              ))}
              <SettingRow
                title="新增模型"
                description="手工登记模型名与向量维度，维度变更自动重建索引"
              >
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Plus}
                  onClick={() => setModelEditor({ action: "create" })}
                >
                  新增
                </Button>
              </SettingRow>
            </>
          ) : (
            <div className="text-tau-tiny text-ink-3 py-3">请先添加并启用一个 Provider。</div>
          )}
        </>
      )}

      <SearchModelsSection />

      <div className="text-tau-tiny text-ink-3 flex items-center gap-2 px-0.5 pt-2.5">
        <Zap size={13} strokeWidth={1.75} className="flex-none" />
        嵌入模型切换（本地 ↔ API、启用模型、切换
        Provider）都会触发后台自动重建向量索引，切换前弹确认。
      </div>

      <ConfirmDialog
        open={confirmSpec !== null}
        onOpenChange={open => {
          if (!open) setConfirmSpec(null);
        }}
        title={confirmSpec?.title ?? ""}
        context={confirmSpec?.context}
        description={confirmSpec?.description}
        danger={confirmSpec?.danger}
        confirmText={confirmSpec?.confirmText}
        onConfirm={() => {
          const spec = confirmSpec;
          setConfirmSpec(null);
          void spec?.action();
        }}
      />

      <ProviderEditorDialog
        editor={providerEditor}
        onClose={() => setProviderEditor(null)}
        onSave={saveProvider}
      />

      <ModelEditorDialog
        editor={modelEditor}
        onClose={() => setModelEditor(null)}
        onSave={saveModel}
      />

      <Dialog
        open={healthInfo !== null}
        onOpenChange={open => {
          if (!open) setHealthInfo(null);
        }}
        title="Embedding 健康检查"
        subtitle="当前启用模型的运行状态"
        footer={
          <Button variant="secondary" size="sm" onClick={() => setHealthInfo(null)}>
            关闭
          </Button>
        }
      >
        <div className="text-tau-meta text-ink-2 flex flex-col gap-1.5">
          <span>
            已加载：<b className="text-ink-1 font-semibold">{healthInfo?.loaded ? "是" : "否"}</b>
          </span>
          <span>设备：{healthInfo?.device || "—"}</span>
          <span>维度：{healthInfo?.dimensions || "—"}</span>
          <span className="font-tau-mono text-tau-sm text-ink-3 break-all">
            {healthInfo?.model_path || "—"}
          </span>
        </div>
      </Dialog>
    </section>
  );
}

/* ── 本地模型行：启用 / 下载（进度）/ 删除 ── */
function LocalModelRow({
  model,
  active,
  downloading,
  downloadProgress,
  downloadMessage,
  onActivate,
  onDelete,
  onDownload,
  onCancel,
}: {
  model: EmbeddingModelInfo;
  active: boolean;
  downloading: boolean;
  downloadProgress: number;
  downloadMessage: string;
  onActivate: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border-line-2 border-b py-3 last:border-b-0">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-ink-1 flex items-center gap-2">
            <span className="font-tau-mono text-tau-body truncate font-medium">{model.label}</span>
            {active && (
              <span className="bg-ok-soft text-ok flex-none rounded-full px-2 py-px text-[11px] font-semibold">
                使用中
              </span>
            )}
            <span
              className={clsx(
                "flex-none rounded-full px-2 py-px text-[11px] font-medium",
                model.downloaded ? "bg-group text-ink-3" : "border-line-1 text-ink-3 border"
              )}
            >
              {model.downloaded ? "已下载" : "未下载"}
            </span>
          </div>
          <div className="text-tau-meta text-ink-3 mt-0.5 truncate">{model.description}</div>
          <div className="text-tau-tiny text-ink-3 mt-0.5 flex gap-3 tabular-nums">
            <span>大小 {model.size}</span>
            <span>向量维度 {model.dimensions}</span>
          </div>
        </div>
        <div className="flex flex-none items-center gap-2">
          {model.downloaded ? (
            <>
              {!active && (
                <Button variant="secondary" size="sm" icon={Zap} onClick={onActivate}>
                  启用
                </Button>
              )}
              <Button variant="ghost" size="sm" icon={Trash2} onClick={onDelete}>
                删除
              </Button>
            </>
          ) : downloading ? (
            <Button variant="secondary" size="sm" onClick={onCancel}>
              取消
            </Button>
          ) : (
            <Button variant="secondary" size="sm" icon={Download} onClick={onDownload}>
              下载
            </Button>
          )}
        </div>
      </div>
      {downloading && (
        <div className="mt-1">
          <div className="bg-sunken h-[5px] overflow-hidden rounded-full">
            <div
              className="bg-accent h-full rounded-full transition-[width] duration-200"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
          <div className="text-tau-tiny text-ink-3 mt-1">
            {downloadMessage || `下载中... ${downloadProgress}%`}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Provider 编辑弹窗（新增 / 编辑共用） ── */
function ProviderEditorDialog({
  editor,
  onClose,
  onSave,
}: {
  editor: { action: "create" } | { action: "edit"; config: EmbeddingConfigEntry } | null;
  onClose: () => void;
  onSave: (data: { name: string; apiKey: string; baseUrl: string; id?: string }) => void;
}) {
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    if (editor) {
      setName(editor.action === "edit" ? editor.config.name : "");
      setApiKey(editor.action === "edit" ? editor.config.apiKey : "");
      setBaseUrl(editor.action === "edit" ? editor.config.baseUrl : "");
    }
  }, [editor]);

  if (!editor) return null;
  const isEdit = editor.action === "edit";

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
      title={isEdit ? "编辑 Provider" : "添加 Provider"}
      subtitle="任意 OpenAI 兼容嵌入端点"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              onSave({
                name,
                apiKey,
                baseUrl,
                id: isEdit ? editor.config.id : undefined,
              })
            }
          >
            {isEdit ? "保存" : "添加"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-tau-meta text-ink-2 font-medium">配置名称</span>
          <Input
            value={name}
            placeholder="例如：SiliconFlow / DeepSeek"
            onChange={e => setName(e.target.value)}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-tau-meta text-ink-2 font-medium">API Key</span>
          <Input
            type="password"
            value={apiKey}
            placeholder="请输入 API Key"
            onChange={e => setApiKey(e.target.value)}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-tau-meta text-ink-2 font-medium">Base URL</span>
          <Input
            value={baseUrl}
            placeholder="例如：https://api.siliconflow.cn/v1"
            onChange={e => setBaseUrl(e.target.value)}
          />
        </label>
      </div>
    </Dialog>
  );
}

/* ── API 模型编辑弹窗（新增 / 编辑共用） ── */
function ModelEditorDialog({
  editor,
  onClose,
  onSave,
}: {
  editor: { action: "create" } | { action: "edit"; model: EmbeddingModelEntry } | null;
  onClose: () => void;
  onSave: (data: EmbeddingModelEntry) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contextLength, setContextLength] = useState("0");
  const [distance, setDistance] = useState("0.6");
  const [multimodal, setMultimodal] = useState(false);

  useEffect(() => {
    if (editor) {
      const model = editor.action === "edit" ? editor.model : null;
      setName(model?.name ?? "");
      setDescription(model?.description ?? "");
      setContextLength(String(model?.contextLength ?? 0));
      setDistance(String(model?.distance ?? 0.6));
      setMultimodal(Boolean(model?.features.multimodal));
    }
  }, [editor]);

  if (!editor) return null;
  const isEdit = editor.action === "edit";

  const handleSubmit = () => {
    if (!name || !description) {
      toast.error("请填写模型名称与描述");
      return;
    }
    const context = Number.parseInt(contextLength, 10);
    const dist = Number.parseFloat(distance);
    if (!Number.isFinite(context) || context <= 0) {
      toast.error("向量维度不能为 0");
      return;
    }
    if (!Number.isFinite(dist) || dist <= 0) {
      toast.error("距离阈值不能为 0");
      return;
    }
    onSave({
      name,
      description,
      contextLength: context,
      features: { multimodal },
      distance: dist,
    });
  };

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
      title={isEdit ? "编辑模型" : "添加模型"}
      subtitle="手工登记模型名与向量维度"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit}>
            {isEdit ? "保存" : "添加"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-tau-meta text-ink-2 font-medium">模型名称</span>
          <Input
            value={name}
            placeholder="例如：BAAI/bge-large-zh-v1.5"
            onChange={e => setName(e.target.value)}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-tau-meta text-ink-2 font-medium">模型描述</span>
          <Input
            value={description}
            placeholder="请输入模型描述"
            onChange={e => setDescription(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-tau-meta text-ink-2 font-medium">向量维度</span>
            <Input
              className="tabular-nums"
              value={contextLength}
              placeholder="1024"
              onChange={e => setContextLength(e.target.value)}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-tau-meta text-ink-2 font-medium">距离阈值</span>
            <Input
              className="tabular-nums"
              value={distance}
              placeholder="0.6"
              onChange={e => setDistance(e.target.value)}
            />
          </label>
        </div>
        <div className="border-line-1 flex items-center justify-between border-t pt-3">
          <Switch
            checked={multimodal}
            onCheckedChange={setMultimodal}
            label="多模态（支持图文混合输入）"
          />
        </div>
      </div>
    </Dialog>
  );
}

/* ── 检索模型：查询扩展 + 重排序（独立于嵌入来源，常驻本页） ── */
function SearchModelsSection() {
  const searchConfig = useSettingStore(s => s.setting.searchModelProvider);

  const [models, setModels] = useState<SearchModelInfo[]>([]);
  const [loadError, setLoadError] = useState("");
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadMessage, setDownloadMessage] = useState("");
  const downloadingModelRef = useRef<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SearchModelInfo | null>(null);

  const persistConfig = (updater: (draft: typeof searchConfig) => void) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        updater(draft.searchModelProvider);
      }),
    }));
  };

  const loadModels = useCallback(async () => {
    try {
      const result = await getSearchModels();
      if (result.success && result.data) {
        setModels(result.data);
        setLoadError("");
      } else {
        setModels([]);
        setLoadError(result.error || "获取检索模型列表失败");
      }
    } catch (error) {
      setModels([]);
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  useEffect(() => {
    const unsubscribe = onSearchDownloadProgress(progress => {
      if (progress.modelName === downloadingModelRef.current) {
        setDownloadProgress(progress.percentage);
        setDownloadMessage(progress.message || "");
      }
    });
    return () => unsubscribe();
  }, []);

  const downloadModel = async (model: SearchModelInfo) => {
    setDownloadingModel(model.name);
    downloadingModelRef.current = model.name;
    setDownloadProgress(0);
    setDownloadMessage("准备下载...");
    try {
      const result = await downloadSearchModel(model.name, searchConfig.source || "modelscope");
      if (result.success) {
        toast.success(`模型 ${model.label} 下载成功`);
        await loadModels();
      } else {
        toast.error(result.error || "下载失败");
      }
    } catch (error) {
      toast.error(`下载失败: ${error}`);
    } finally {
      setDownloadingModel(null);
      downloadingModelRef.current = null;
      setDownloadProgress(0);
      setDownloadMessage("");
    }
  };

  const cancelDownload = async (modelName: string) => {
    await cancelSearchDownload(modelName);
    setDownloadingModel(null);
    downloadingModelRef.current = null;
    setDownloadProgress(0);
    setDownloadMessage("");
    toast.info("已取消下载");
  };

  const runDelete = async (model: SearchModelInfo) => {
    const result = await deleteSearchModel(model.name);
    if (result.success) {
      toast.success("删除成功");
      await loadModels();
    } else {
      toast.error(result.error || "删除失败");
    }
  };

  const activateModel = (model: SearchModelInfo) => {
    persistConfig(draft => {
      if (model.kind === "query_expander") draft.queryExpanderModel = model.name;
      else draft.rerankerModel = model.name;
    });
    toast.success("已启用模型配置");
  };

  const kindLabel = (kind: SearchModelInfo["kind"]) =>
    kind === "query_expander" ? "扩展" : "重排";
  const isActive = (model: SearchModelInfo) =>
    model.kind === "query_expander"
      ? searchConfig.queryExpanderModel === model.name
      : searchConfig.rerankerModel === model.name;
  const kindDisabled = (model: SearchModelInfo) =>
    model.kind === "query_expander"
      ? searchConfig.enableExpander === false
      : searchConfig.enableReranker === false;

  return (
    <>
      <SectionTitle
        title="检索模型 · 查询扩展 · 重排序"
        desc="本地优先：模型缺失自动降级，不中断搜索流程"
      />
      <SettingRow
        title="启用 Query Expander"
        description="检索前扩展查询词，关闭后仅使用原始 query"
      >
        <Switch
          checked={searchConfig.enableExpander !== false}
          onCheckedChange={checked =>
            persistConfig(draft => {
              draft.enableExpander = checked;
            })
          }
        />
      </SettingRow>
      <SettingRow title="启用 Reranker" description="对候选结果重排序，关闭后使用 RRF 结果">
        <Switch
          checked={searchConfig.enableReranker !== false}
          onCheckedChange={checked =>
            persistConfig(draft => {
              draft.enableReranker = checked;
            })
          }
        />
      </SettingRow>
      <SettingRow title="下载源 · 设备策略" description="仅作用于本节模型的下载与推理">
        <Select
          aria-label="检索模型下载源"
          className="w-[130px]"
          value={searchConfig.source || "modelscope"}
          options={DOWNLOAD_SOURCE_OPTIONS}
          disabled={Boolean(downloadingModel)}
          onValueChange={v =>
            persistConfig(draft => {
              draft.source = v as EmbeddingDownloadSource;
            })
          }
        />
        <Select
          aria-label="检索模型设备策略"
          className="w-[96px]"
          value={searchConfig.devicePolicy || "auto"}
          options={DEVICE_OPTIONS}
          onValueChange={v =>
            persistConfig(draft => {
              draft.devicePolicy = v as DevicePolicy;
            })
          }
        />
      </SettingRow>
      <SettingRow title="批处理大小（rerank）" description="重排序单批参与的候选数">
        <Input
          className="w-[96px] tabular-nums"
          value={String(searchConfig.batchSize || 8)}
          onChange={e => {
            const next = Number.parseInt(e.target.value || "8", 10);
            persistConfig(draft => {
              draft.batchSize = Number.isFinite(next) && next > 0 ? next : 8;
            });
          }}
        />
      </SettingRow>

      {loadError ? (
        <div className="text-tau-tiny text-ink-3 flex items-center gap-2 py-3">
          <span className="text-warn">检索模型列表加载失败：{loadError}</span>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => void loadModels()}>
            重试加载
          </Button>
        </div>
      ) : models.length === 0 ? (
        <div className="text-tau-tiny text-ink-3 py-3">
          暂未获取到检索模型列表，可点击「重试加载」或重启应用后再试。
        </div>
      ) : (
        models.map(model => {
          const downloading = downloadingModel === model.name;
          return (
            <div key={model.name} className="border-line-2 border-b py-3 last:border-b-0">
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-ink-1 flex items-center gap-2">
                    <span className="font-tau-mono text-tau-body truncate font-medium">
                      {model.label}
                    </span>
                    <span className="bg-accent-soft text-accent-text flex-none rounded-full px-2 py-px text-[11px] font-semibold">
                      {kindLabel(model.kind)}
                    </span>
                    {isActive(model) && (
                      <span className="bg-ok-soft text-ok flex-none rounded-full px-2 py-px text-[11px] font-semibold">
                        当前{kindLabel(model.kind)}
                      </span>
                    )}
                    {kindDisabled(model) && (
                      <span className="bg-group text-ink-3 flex-none rounded-full px-2 py-px text-[11px] font-medium">
                        已关闭
                      </span>
                    )}
                  </div>
                  <div className="text-tau-meta text-ink-3 mt-0.5 truncate">
                    {model.description}
                  </div>
                  <div className="text-tau-tiny text-ink-3 mt-0.5 flex gap-3">
                    <span>大小 {model.size}</span>
                    <span className="font-tau-mono">{model.name}</span>
                  </div>
                </div>
                <div className="flex flex-none items-center gap-2">
                  {model.downloaded ? (
                    <>
                      {!isActive(model) && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={Zap}
                          onClick={() => activateModel(model)}
                        >
                          启用
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        onClick={() => setDeleteTarget(model)}
                      >
                        删除
                      </Button>
                    </>
                  ) : downloading ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void cancelDownload(model.name)}
                    >
                      取消
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Download}
                      onClick={() => void downloadModel(model)}
                    >
                      下载
                    </Button>
                  )}
                </div>
              </div>
              {downloading && (
                <div className="mt-1">
                  <div className="bg-sunken h-[5px] overflow-hidden rounded-full">
                    <div
                      className="bg-accent h-full rounded-full transition-[width] duration-200"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                  <div className="text-tau-tiny text-ink-3 mt-1">
                    {downloadMessage || `下载中... ${downloadProgress}%`}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={open => {
          if (!open) setDeleteTarget(null);
        }}
        title="删除检索模型"
        description="删除后需要重新下载才能使用。"
        context={deleteTarget?.label}
        danger
        confirmText="删除"
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) void runDelete(target);
        }}
      />
    </>
  );
}
