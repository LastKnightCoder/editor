/**
 * 嵌入模型 —— 本地模型管理与插件提供方选择。
 *
 * 浏览、下载、配置都不改变当前生效模型；只有点「设为当前」并在确认框中确认后，
 * 才写 active = { provider, model, dimensions }（插件先做一次连通性探测，维度以实测为准）。
 * 切换模型会触发后台重建向量索引；即时保存（无应答区）。
 */

import { embeddingText, embeddingValue, useEmbeddingSettingsI18n } from "./EmbeddingSection.i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { produce } from "immer";
import {
  Activity,
  ChevronDown,
  Download,
  Ellipsis,
  ExternalLink,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  Zap,
} from "lucide-react";
import {
  isProviderFormComplete,
  providerFormSummary,
  type JsonValue,
  type PluginSettingsModel,
} from "@tau/plugins";
import {
  ROW_DIVIDER,
  SettingRow,
  Button,
  ConfirmDialog,
  Dialog,
  DialogBody,
  IconButton,
  Input,
  Menu,
  Select,
  Tag,
  toast,
} from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import type { ISetting } from "@/stores/useSettingStore";
import type { EmbeddingDevicePolicy } from "@/types/embedding";
import { rendererEmbeddingsRegistry } from "@/app/plugins/embeddings-registry";
import { useDesktopPlugins } from "@/app/plugins/context";
import { openProviderSettings } from "@/services/open-provider-settings";
import { openPage } from "@/services/page-navigation";
import { useSettingsStore } from "@/app/settingsStore";
import {
  cancelEmbeddingDownload,
  deleteEmbeddingModel,
  downloadEmbeddingModel,
  embeddingModelHealth,
  getEmbeddingIndexStatus,
  getEmbeddingModels,
  onEmbeddingDownloadProgress,
  type EmbeddingDownloadSource,
  type EmbeddingModelInfo,
} from "@/commands";
import { SettingsGroup, SettingsNote } from "../components/SettingsGroup";
import { StatusChip } from "../components/StatusChip";
import { EmbeddingActiveGroup } from "./EmbeddingActiveGroup";

const DOWNLOAD_SOURCE_OPTIONS = [
  { value: "modelscope", label: "ModelScope" },
  { value: "huggingface", label: "HuggingFace" },
];

const DEVICE_OPTIONS = [
  {
    value: "auto",
    get label() {
      return embeddingText("ui.automatic");
    },
  },
  { value: "cpu", label: "CPU" },
  { value: "cuda", label: "CUDA" },
];

/** 「设为当前」待确认目标 */
type ActivationSpec =
  | { kind: "local"; model: EmbeddingModelInfo }
  | {
      kind: "plugin";
      pluginId: string;
      model: PluginSettingsModel;
      config: JsonValue;
    };

/** 单次 produce 更新嵌入设置（updater 内禁止副作用，toast 等在外层做） */
const mutateEmbedding = (updater: (embedding: ISetting["embedding"]) => void) => {
  const { setting } = useSettingStore.getState();
  useSettingStore.setState({
    setting: produce(setting, (draft: ISetting) => {
      updater(draft.embedding);
    }),
  });
};

export function EmbeddingSection() {
  useEmbeddingSettingsI18n();

  const embedding = useSettingStore(s => s.setting.embedding);
  const active = embedding.active;
  const activeModel = active?.provider === "local" ? active : null;
  const runtime = useDesktopPlugins();
  const embeddingSections =
    runtime?.listSettings().filter(item => item.definition.target === "embeddings") ?? [];

  /* ── 本地模型列表（getEmbeddingModels 实读 + 下载进度） ── */
  const [localModels, setLocalModels] = useState<EmbeddingModelInfo[]>([]);
  const [localLoadError, setLocalLoadError] = useState<string | { code: "modelsLoadFailed" }>("");
  const localLoadMessage =
    typeof localLoadError === "string" ? localLoadError : embeddingText("error.modelsLoadFailed");
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadMessage, setDownloadMessage] = useState<string | null>("");
  const downloadingModelRef = useRef<string | null>(null);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [deletingModel, setDeletingModel] = useState<EmbeddingModelInfo | null>(null);
  const [healthInfo, setHealthInfo] = useState<{
    loaded?: boolean;
    device?: string;
    dimensions?: number;
    model_path?: string;
  } | null>(null);

  /* ── 当前生效行的显示信息（label 与来源摘要） ── */
  const activeLabel = !active
    ? ""
    : active.provider === "local"
      ? (localModels.find(model => model.name === active.model)?.label ?? active.model)
      : (embeddingSections
          .find(item => item.context.pluginId === active.pluginId)
          ?.definition.models?.find(model => model.id === active.model)?.label ?? active.model);
  const activeSubtitle = !active
    ? ""
    : active.provider === "local"
      ? embeddingText("message.builtInLocalModelDimensions", {
          dimensions: embeddingValue(active.dimensions),
        })
      : embeddingText("message.pluginDimensions", {
          provider: embeddingValue(
            embeddingSections.find(item => item.context.pluginId === active.pluginId)?.definition
              .title ?? active.pluginId
          ),
          dimensions: embeddingValue(active.dimensions),
        });

  /* ──「设为当前」确认框 ── */
  const [pending, setPending] = useState<ActivationSpec | null>(null);
  const [probeError, setProbeError] = useState<string | { code: "timeout" }>("");
  const probeMessage = typeof probeError === "string" ? probeError : embeddingText("error.timeout");
  const [indexedCount, setIndexedCount] = useState(0);

  // 打开确认框即清空上次探测错误；已有 active 时顺带拉一次索引计数（impact 用）
  const openActivation = (spec: ActivationSpec) => {
    setProbeError("");
    setPending(spec);
    if (useSettingStore.getState().setting.embedding.active) {
      getEmbeddingIndexStatus()
        .then(status => setIndexedCount(status.stats?.indexed ?? 0))
        .catch(() => setIndexedCount(0));
    } else {
      setIndexedCount(0);
    }
  };

  const confirmActivation = async (): Promise<void> => {
    if (!pending) return;
    if (pending.kind === "local") {
      const { model } = pending;
      mutateEmbedding(draft => {
        draft.active = { provider: "local", model: model.name, dimensions: model.dimensions };
      });
      // 启用后预热（失败不阻塞启用，后台索引照常重建）
      void embeddingModelHealth(model.name, embedding.local.devicePolicy || "auto").catch(
        () => undefined
      );
      toast.success(embeddingText("ui.modelEnabledIndexingContinuesInTheBackground"));
      return;
    }
    const { pluginId, model, config } = pending;
    const result = await rendererEmbeddingsRegistry
      .execute(
        { pluginId, config, modelId: model.id, texts: ["嵌入模型连通性测试"] },
        AbortSignal.timeout(30000)
      )
      .catch((error: unknown) => {
        const timedOut = error instanceof Error && error.name === "TimeoutError";
        setProbeError(
          timedOut ? { code: "timeout" } : error instanceof Error ? error.message : String(error)
        );
        throw error;
      });
    // 维度以实测为准（插件声明仅作展示提示）
    const dimensions = result[0]?.length ?? 0;
    mutateEmbedding(draft => {
      draft.active = { provider: "plugin", pluginId, model: model.id, dimensions };
    });
    toast.success(embeddingText("ui.modelSelectedYouCanStartIndexingManually"));
  };

  const loadLocalModels = useCallback(async () => {
    try {
      const result = await getEmbeddingModels();
      if (result.success && result.data) {
        setLocalModels(result.data);
        setLocalLoadError("");
      } else {
        setLocalModels([]);
        setLocalLoadError(result.error || { code: "modelsLoadFailed" });
      }
    } catch (error) {
      setLocalModels([]);
      setLocalLoadError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void loadLocalModels();
  }, [loadLocalModels]);

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
    mutateEmbedding(draft => {
      draft.local.source = value;
    });

  const updateLocalDevice = (value: EmbeddingDevicePolicy) =>
    mutateEmbedding(draft => {
      draft.local.devicePolicy = value;
    });

  const updateLocalBatchSize = (value: string) => {
    const next = Number.parseInt(value || "8", 10);
    mutateEmbedding(draft => {
      draft.local.batchSize = Number.isFinite(next) && next > 0 ? next : 8;
    });
  };

  const downloadLocalModel = async (model: EmbeddingModelInfo) => {
    setDownloadingModel(model.name);
    downloadingModelRef.current = model.name;
    setDownloadProgress(0);
    setDownloadMessage(null);
    try {
      const result = await downloadEmbeddingModel(
        model.name,
        embedding.local.source || "modelscope"
      );
      if (result.success) {
        toast.success(
          embeddingText("message.downloadedModel", { model: embeddingValue(model.label) })
        );
        await loadLocalModels();
      } else {
        toast.error(result.error || embeddingText("ui.downloadFailed"));
      }
    } catch (error) {
      toast.error(embeddingText("message.downloadFailed", { error: embeddingValue(error) }));
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
    toast.info(embeddingText("ui.downloadCancelled"));
  };

  const handleHealthCheck = async () => {
    if (!activeModel?.model) {
      toast.warning(embeddingText("ui.enableAModelFirst"));
      return;
    }
    try {
      const result = await embeddingModelHealth(
        activeModel.model,
        embedding.local.devicePolicy || "auto"
      );
      if (!result.success || !result.health) {
        toast.error(result.error || embeddingText("ui.healthCheckFailed"));
        return;
      }
      setHealthInfo(result.health);
    } catch (error) {
      toast.error(embeddingText("message.healthCheckFailed", { error: embeddingValue(error) }));
    }
  };

  const sourceLabel =
    DOWNLOAD_SOURCE_OPTIONS.find(
      option => option.value === (embedding.local.source || "modelscope")
    )?.label ?? embedding.local.source;
  const deviceLabel =
    DEVICE_OPTIONS.find(option => option.value === (embedding.local.devicePolicy || "auto"))
      ?.label ?? embedding.local.devicePolicy;

  const pendingLabel =
    pending?.kind === "local" ? pending.model.label : (pending?.model.label ?? pending?.model.id);
  // 插件模型不自动索引，文案必须与编排器行为一致
  const indexHint =
    pending?.kind === "plugin"
      ? embeddingText("ui.thenStartIndexingManuallyUnderCurrentModel")
      : embeddingText("ui.andRebuildItInTheBackground");

  return (
    <>
      <EmbeddingActiveGroup active={active} label={activeLabel} subtitle={activeSubtitle} />

      <SettingsGroup
        title={
          <>
            {embeddingText("ui.localModels")} <Tag>{embeddingText("ui.builtIn")}</Tag>
          </>
        }
        description={embeddingText("ui.runsOfflineOnThisDeviceWithoutAPI")}
      >
        {localLoadError ? (
          <div className="text-tau-meta text-ink-2 flex items-center gap-2 px-3 py-3">
            <span className="text-danger">
              {embeddingText("ui.couldNotLoadLocalModels2")}
              {localLoadMessage}
            </span>
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={() => void loadLocalModels()}
            >
              {embeddingText("ui.retryLoading")}
            </Button>
          </div>
        ) : localModels.length === 0 ? (
          <div className="text-tau-meta text-ink-2 px-3 py-3">
            {embeddingText("ui.localModelsAreUnavailableChooseRetryLoading")}
          </div>
        ) : (
          localModels.map(model => (
            <LocalModelRow
              key={model.name}
              model={model}
              isCurrent={activeModel?.model === model.name}
              downloading={downloadingModel === model.name}
              downloadProgress={downloadProgress}
              downloadMessage={downloadMessage}
              onActivate={() => openActivation({ kind: "local", model })}
              onHealthCheck={() => void handleHealthCheck()}
              onDelete={() => setDeletingModel(model)}
              onDownload={() => void downloadLocalModel(model)}
              onCancel={() => void cancelLocalDownload(model.name)}
            />
          ))
        )}

        <button
          type="button"
          aria-expanded={paramsOpen}
          className={`hover:bg-hover flex min-h-14 w-full items-center gap-4 px-3 py-[11px] text-left ${ROW_DIVIDER}`}
          onClick={() => setParamsOpen(value => !value)}
        >
          <span className="min-w-0 flex-1">
            <span className="text-tau-body-lg text-ink-1 block font-medium">
              {embeddingText("ui.localRuntimeOptions")}
            </span>
            <span className="text-tau-meta text-ink-2 mt-0.5 block">
              {embeddingText("runtime.summary", {
                source: sourceLabel,
                device: deviceLabel,
                batch: embeddingValue(embedding.local.batchSize ?? 8),
              })}
            </span>
          </span>
          <ChevronDown
            size={16}
            strokeWidth={1.75}
            className={clsx(
              "text-ink-3 ease-tau-out flex-none transition-transform",
              paramsOpen && "rotate-180"
            )}
          />
        </button>
        {paramsOpen && (
          <>
            <SettingRow
              title={embeddingText("ui.downloadSource")}
              description={embeddingText("ui.modelDownloadMirrorAffectsTheDownloadLocation")}
            >
              <Select
                aria-label={embeddingText("ui.localModelDownloadSource")}
                className="w-[168px]"
                value={embedding.local.source || "modelscope"}
                options={DOWNLOAD_SOURCE_OPTIONS}
                disabled={Boolean(downloadingModel)}
                onValueChange={v => updateLocalSource(v as EmbeddingDownloadSource)}
              />
            </SettingRow>
            <SettingRow
              title={embeddingText("ui.computeDevice")}
              description={embeddingText("ui.deviceUsedForWarmupAndHealthChecks")}
            >
              <Select
                aria-label={embeddingText("ui.localModelDevicePolicy")}
                className="w-[168px]"
                value={embedding.local.devicePolicy || "auto"}
                options={DEVICE_OPTIONS}
                onValueChange={v => updateLocalDevice(v as EmbeddingDevicePolicy)}
              />
            </SettingRow>
            <SettingRow
              title={embeddingText("ui.batchSize2")}
              description={embeddingText("ui.documentsToEmbedAndStoreInEach")}
            >
              <Input
                className="w-[168px] tabular-nums"
                value={String(embedding.local.batchSize ?? 8)}
                onChange={e => updateLocalBatchSize(e.target.value)}
              />
            </SettingRow>
          </>
        )}
      </SettingsGroup>

      {embeddingSections.map(section => {
        const pluginId = section.context.pluginId;
        const form = section.definition.form;
        const stored = embedding.plugins[pluginId]?.config;
        const configured = form ? isProviderFormComplete(form, stored) : stored !== undefined;
        const summary =
          form && configured
            ? providerFormSummary(form, stored) || embeddingText("ui.configured")
            : "";
        return (
          <SettingsGroup
            key={section.key}
            title={
              <>
                {section.definition.title} <Tag>{embeddingText("ui.plugin")}</Tag>
              </>
            }
            description={configured ? summary : embeddingText("ui.connectionNotConfigured")}
            action={
              <Button
                size="sm"
                variant={configured ? "ghost" : "secondary"}
                icon={Settings2}
                onClick={() => openProviderSettings(pluginId, section.key, "embedding")}
              >
                {configured ? embeddingText("ui.configureExisting") : embeddingText("ui.configure")}
              </Button>
            }
          >
            {(section.definition.models ?? []).length === 0 ? (
              <div className="text-tau-meta text-ink-2 px-3 py-3">
                {embeddingText("ui.thisPluginDoesNotListAnyAvailable")}
              </div>
            ) : (
              (section.definition.models ?? []).map(model => {
                const isCurrent =
                  active?.provider === "plugin" &&
                  active.pluginId === pluginId &&
                  active.model === model.id;
                return (
                  <SettingRow
                    key={model.id}
                    title={model.label ?? model.id}
                    description={
                      [
                        model.dimensions
                          ? embeddingText("message.dimensions", {
                              dimensions: embeddingValue(model.dimensions),
                            })
                          : "",
                        configured
                          ? ""
                          : embeddingText("ui.availableAfterConfiguringTheConnection"),
                      ]
                        .filter(Boolean)
                        .join(" · ") || undefined
                    }
                  >
                    {isCurrent ? (
                      <StatusChip tone="accent">{embeddingText("ui.inUse")}</StatusChip>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!configured}
                        onClick={() =>
                          openActivation({
                            kind: "plugin",
                            pluginId,
                            model,
                            config: stored as JsonValue,
                          })
                        }
                      >
                        {embeddingText("ui.setAsCurrent")}
                      </Button>
                    )}
                  </SettingRow>
                );
              })
            )}
          </SettingsGroup>
        );
      })}

      <button
        type="button"
        className={`hover:bg-hover rounded-tau-sm mb-7 flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left ${ROW_DIVIDER}`}
        onClick={() => {
          useSettingsStore.getState().closeSettings();
          openPage("plugins", { tab: "discover" });
        }}
      >
        <span className="text-ink-3 grid size-6 place-items-center">
          <Plus size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-tau-body-lg text-ink-2 block">
            {embeddingText("ui.getMoreEmbeddingModels")}
          </span>
          <span className="text-tau-meta text-ink-3 block">
            {embeddingText("ui.browseEmbeddingProvidersInThePluginCenter")}
          </span>
        </span>
        <ExternalLink size={14} className="text-ink-3" />
      </button>

      <SettingsNote icon={<Zap size={14} strokeWidth={1.75} />}>
        {embeddingText("ui.browsingDownloadingAndConfiguringDoNotChange")}
      </SettingsNote>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={open => {
          if (!open) setPending(null);
        }}
        title={
          active
            ? embeddingText("ui.switchEmbeddingModel")
            : embeddingText("ui.enableEmbeddingModel")
        }
        context={pendingLabel}
        description={
          active ? (
            <span className="flex flex-col gap-1.5">
              <span>
                {embeddingText("activation.fromTo", { from: activeLabel, to: pendingLabel ?? "" })}
              </span>
              <span>{embeddingText("activation.difference", { action: indexHint })}</span>
              {probeError && <span className="text-danger break-all">{probeMessage}</span>}
            </span>
          ) : (
            <span className="flex flex-col gap-1.5">
              <span>
                {pending?.kind === "plugin"
                  ? embeddingText("ui.confirmToVerifyTheConnectionThenStart")
                  : embeddingText("ui.confirmToStartIndexingInTheBackground")}
              </span>
              {probeError && <span className="text-danger break-all">{probeMessage}</span>}
            </span>
          )
        }
        impact={
          active && indexedCount > 0
            ? embeddingText("message.existingIndexEntriesWillBeCleared", {
                count: embeddingValue(indexedCount),
              })
            : undefined
        }
        danger={Boolean(active)}
        confirmText={active ? embeddingText("ui.clearIndexAndSwitch") : embeddingText("ui.enable")}
        loadingText={pending?.kind === "plugin" ? embeddingText("ui.verifying") : undefined}
        onConfirm={confirmActivation}
      />

      <ConfirmDialog
        open={deletingModel !== null}
        onOpenChange={open => {
          if (!open) setDeletingModel(null);
        }}
        title={embeddingText("ui.deleteLocalModel")}
        context={deletingModel?.label}
        description={embeddingText("ui.deletingModelFilesKeepsTheExistingIndex")}
        danger
        confirmText={embeddingText("ui.delete")}
        onConfirm={async () => {
          if (!deletingModel) return;
          const result = await deleteEmbeddingModel(deletingModel.name);
          if (result.success) {
            toast.success(embeddingText("ui.deleted"));
            await loadLocalModels();
          } else {
            toast.error(result.error || embeddingText("ui.couldNotDelete"));
          }
        }}
      />

      <Dialog
        open={healthInfo !== null}
        onOpenChange={open => {
          if (!open) setHealthInfo(null);
        }}
        title={embeddingText("ui.embeddingHealthCheck")}
        subtitle={embeddingText("ui.runtimeStatusOfTheCurrentModel")}
        footer={
          <Button variant="secondary" size="sm" onClick={() => setHealthInfo(null)}>
            {embeddingText("ui.close")}
          </Button>
        }
      >
        <DialogBody>
          <div className="text-tau-meta text-ink-2 flex flex-col gap-1.5">
            <span>
              {embeddingText("ui.loaded")}
              <b className="text-ink-1 font-semibold">
                {healthInfo?.loaded ? embeddingText("ui.yes") : embeddingText("ui.no")}
              </b>
            </span>
            <span>
              {embeddingText("ui.device2")}
              {healthInfo?.device || "—"}
            </span>
            <span>
              {embeddingText("ui.dimensions")}
              {healthInfo?.dimensions || "—"}
            </span>
            <span className="font-tau-mono text-tau-sm text-ink-3 break-all">
              {healthInfo?.model_path || "—"}
            </span>
          </div>
        </DialogBody>
      </Dialog>
    </>
  );
}

/* ── 本地模型行：设为当前 / 下载（进度）/ 更多菜单（健康检查、删除） ── */
function LocalModelRow({
  model,
  isCurrent,
  downloading,
  downloadProgress,
  downloadMessage,
  onActivate,
  onHealthCheck,
  onDelete,
  onDownload,
  onCancel,
}: {
  model: EmbeddingModelInfo;
  isCurrent: boolean;
  downloading: boolean;
  downloadProgress: number;
  downloadMessage: string | null;
  onActivate: () => void;
  onHealthCheck: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onCancel: () => void;
}) {
  useEmbeddingSettingsI18n();

  const statusText = downloading
    ? embeddingText("message.downloading", { percent: embeddingValue(downloadProgress) })
    : model.downloaded
      ? embeddingText("ui.downloaded")
      : embeddingText("ui.notDownloaded");
  return (
    <div className={`rounded-tau-sm px-3 py-3 ${ROW_DIVIDER}`}>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-ink-1 flex items-center gap-2">
            <span className="font-tau-mono text-tau-body truncate font-medium">{model.label}</span>
            {isCurrent && <StatusChip tone="accent">{embeddingText("ui.inUse")}</StatusChip>}
          </div>
          <div className="text-tau-meta text-ink-2 mt-0.5 truncate">
            {embeddingText("model.rowSummary", {
              size: model.size,
              dimensions: embeddingValue(model.dimensions),
              status: statusText,
            })}
          </div>
        </div>
        <div className="flex flex-none items-center gap-2">
          {model.downloaded ? (
            <>
              {!isCurrent && (
                <Button variant="secondary" size="sm" icon={Zap} onClick={onActivate}>
                  {embeddingText("ui.setAsCurrent")}
                </Button>
              )}
              <Menu
                align="end"
                trigger={
                  <IconButton
                    aria-label={embeddingText("message.moreActionsFor", {
                      model: embeddingValue(model.label),
                    })}
                  >
                    <Ellipsis size={16} strokeWidth={1.75} />
                  </IconButton>
                }
              >
                <Menu.Item
                  icon={<Activity size={16} strokeWidth={1.75} />}
                  disabled={!isCurrent}
                  onSelect={onHealthCheck}
                >
                  {embeddingText("ui.healthCheck")}
                </Menu.Item>
                <Menu.Item
                  danger
                  icon={<Trash2 size={16} strokeWidth={1.75} />}
                  onSelect={onDelete}
                >
                  {embeddingText("ui.deleteLocalModel2")}
                </Menu.Item>
              </Menu>
            </>
          ) : downloading ? (
            <Button variant="secondary" size="sm" onClick={onCancel}>
              {embeddingText("ui.cancel")}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" icon={Download} onClick={onDownload}>
              {embeddingText("ui.download")}
            </Button>
          )}
        </div>
      </div>
      {downloading && (
        <div className="mt-1">
          <div className="bg-sunken h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-accent h-full rounded-full transition-[width] duration-200"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
          <div className="text-tau-sm text-ink-2 mt-1 tabular-nums">
            {downloadMessage === null
              ? embeddingText("download.preparing")
              : downloadMessage ||
                embeddingText("message.downloading2", {
                  percent: embeddingValue(downloadProgress),
                })}
          </div>
        </div>
      )}
    </div>
  );
}
