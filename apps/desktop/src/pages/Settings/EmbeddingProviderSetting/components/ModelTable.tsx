import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "antd";
import { produce } from "immer";
import classNames from "classnames";
import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";
import { DEFAULT_LOCAL_EMBEDDING_DISTANCE } from "@/constants/embedding";
import {
  getEmbeddingModels,
  downloadEmbeddingModel,
  cancelEmbeddingDownload,
  deleteEmbeddingModel,
  onEmbeddingDownloadProgress,
  embeddingModelHealth,
  type EmbeddingModelInfo,
  type EmbeddingDownloadSource,
} from "@/commands";
import type { EmbeddingProviderType } from "@/types/embedding";
import { SettingButton, SettingDropdown } from "../../components";
import type { ConfigItem, ModelItem } from "../types";

interface ModelTableProps {
  providerType: EmbeddingProviderType;
  onOpenConfig: () => void;
  onAddModel: () => void;
  onEditModel: (model: ModelItem) => void;
}

const ModelTable = ({
  providerType,
  onOpenConfig,
  onAddModel,
  onEditModel,
}: ModelTableProps) => {
  const { currentConfig } = useSettingStore((state) => {
    const settings = state.setting.embeddingProvider;
    const { configs, currentConfigId } = settings;
    return {
      currentConfig: configs.find((item) => item.id === currentConfigId),
    };
  });

  const { modal, message } = App.useApp();
  const themeColors = useThemeColors();
  const isLocalMode = providerType === "local_python";

  const [localModels, setLocalModels] = useState<EmbeddingModelInfo[]>([]);
  const [localLoadError, setLocalLoadError] = useState<string>("");
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadMessage, setDownloadMessage] = useState<string>("");
  const [downloadSource, setDownloadSource] =
    useState<EmbeddingDownloadSource>("modelscope");
  const downloadingModelRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLocalMode || !currentConfig?.source) {
      return;
    }
    if (
      currentConfig.source === "modelscope" ||
      currentConfig.source === "huggingface"
    ) {
      setDownloadSource(currentConfig.source);
    }
  }, [isLocalMode, currentConfig?.source]);

  const persistLocalSource = (source: EmbeddingDownloadSource) => {
    if (!isLocalMode) {
      return;
    }
    useSettingStore.setState(
      produce((draft) => {
        const config = draft.setting.embeddingProvider.configs.find(
          (item: ConfigItem) => item.id === currentConfig?.id,
        );
        if (!config) {
          return;
        }
        config.source = source;
      }),
    );
  };

  const handleDownloadSourceChange = (value: string) => {
    const source = value as EmbeddingDownloadSource;
    if (source !== "modelscope" && source !== "huggingface") {
      return;
    }
    setDownloadSource(source);
    persistLocalSource(source);
  };

  const onActivateModel = async (name: string, contextLength: number) => {
    if (currentConfig?.currentModel === name) {
      return;
    }

    modal.confirm({
      title: "切换嵌入模型",
      content: "不同的嵌入模型不能共用，之前的嵌入数据将会被删除，是否继续？",
      okText: "确认",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
      onOk: async () => {
        try {
          useSettingStore.setState(
            produce((draft) => {
              const index = draft.setting.embeddingProvider.configs.findIndex(
                (item: ConfigItem) => item.id === currentConfig?.id,
              );
              if (index === -1) {
                return;
              }

              const config = draft.setting.embeddingProvider.configs[index];
              const exists = config.models.find(
                (item: ModelItem) => item.name === name,
              );

              if (!exists) {
                config.models.push({
                  name,
                  description: isLocalMode
                    ? "本地离线 embedding 模型"
                    : "嵌入模型",
                  contextLength,
                  distance: isLocalMode ? DEFAULT_LOCAL_EMBEDDING_DISTANCE : 0,
                  features: {
                    multimodal: false,
                  },
                });
              }

              config.currentModel = name;
            }),
          );

          if (isLocalMode) {
            try {
              const health = await embeddingModelHealth(
                name,
                currentConfig?.devicePolicy || "auto",
              );
              if (!health.success) {
                console.warn(
                  "[Embedding] 模型预热失败:",
                  health.error || "unknown",
                );
              }
            } catch (error) {
              console.warn("[Embedding] 模型预热异常:", error);
            }
          }

          message.success("模型已启用，后台正在自动处理索引");
        } catch (error) {
          console.error("向量数据库重置失败:", error);
          message.error("向量数据库重置失败，请重试");
        }
      },
    });
  };

  const onDeleteApiModel = (name: string) => {
    modal.confirm({
      title: "确定删除此模型吗？",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
      onOk: () => {
        useSettingStore.setState(
          produce((draft) => {
            const config = draft.setting.embeddingProvider.configs.find(
              (item: ConfigItem) =>
                item.id === draft.setting.embeddingProvider.currentConfigId,
            );
            if (!config) {
              return;
            }

            config.models = config.models.filter(
              (item: ModelItem) => item.name !== name,
            );

            if (config.currentModel === name) {
              config.currentModel = config.models[0]?.name || "";
            }
          }),
        );
      },
    });
  };

  const loadLocalModels = useCallback(async () => {
    if (!isLocalMode) {
      setLocalModels([]);
      return;
    }

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
      console.error("加载本地模型失败:", error);
    }
  }, [isLocalMode]);

  useEffect(() => {
    loadLocalModels();
  }, [loadLocalModels]);

  useEffect(() => {
    const unsubscribe = onEmbeddingDownloadProgress((progress) => {
      if (progress.modelName === downloadingModelRef.current) {
        setDownloadProgress(progress.percentage);
        setDownloadMessage(progress.message || "");
      }
    });
    return () => unsubscribe();
  }, []);

  const handleDownloadLocalModel = async (modelName: string) => {
    setDownloadingModel(modelName);
    downloadingModelRef.current = modelName;
    setDownloadProgress(0);
    setDownloadMessage("准备下载...");

    try {
      const result = await downloadEmbeddingModel(modelName, downloadSource);
      if (result.success) {
        message.success(`模型 ${modelName} 下载成功`);
        await loadLocalModels();
      } else {
        message.error(result.error || "下载失败");
      }
    } catch (error) {
      message.error(`下载失败: ${error}`);
    } finally {
      setDownloadingModel(null);
      downloadingModelRef.current = null;
      setDownloadProgress(0);
      setDownloadMessage("");
    }
  };

  const handleCancelDownload = async (modelName: string) => {
    await cancelEmbeddingDownload(modelName);
    setDownloadingModel(null);
    downloadingModelRef.current = null;
    setDownloadProgress(0);
    setDownloadMessage("");
    message.info("已取消下载");
  };

  const handleDeleteLocalModel = (modelName: string) => {
    modal.confirm({
      title: "确认删除本地模型？",
      content: "删除后需要重新下载才能使用。",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        const result = await deleteEmbeddingModel(modelName);
        if (result.success) {
          message.success("删除成功");
          await loadLocalModels();
        } else {
          message.error(result.error || "删除失败");
        }
      },
    });
  };

  const handleHealthCheck = async () => {
    if (!currentConfig?.currentModel) {
      message.warning("请先启用一个模型");
      return;
    }

    try {
      const result = await embeddingModelHealth(
        currentConfig.currentModel,
        currentConfig.devicePolicy || "auto",
      );

      if (!result.success || !result.health) {
        message.error(result.error || "健康检查失败");
        return;
      }

      const health = result.health;
      modal.info({
        title: "Embedding 健康检查",
        content: (
          <div className="space-y-2 text-sm">
            <div>已加载: {health.loaded ? "是" : "否"}</div>
            <div>设备: {health.device || "-"}</div>
            <div>维度: {health.dimensions || "-"}</div>
            <div>模型路径: {health.model_path || "-"}</div>
          </div>
        ),
      });
    } catch (error) {
      message.error(`健康检查失败: ${error}`);
    }
  };

  return (
    <div
      className={classNames(
        "rounded-xl bg-transparent border",
        themeColors.focusBorderClass,
      )}
    >
      <div
        className={classNames("flex items-center justify-between px-5 py-4")}
      >
        <h3 className={classNames("text-base font-semibold")}>模型列表</h3>

        {isLocalMode ? (
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-500 dark:text-slate-400 whitespace-nowrap">
              下载来源
            </span>
            <div className="w-40">
              <SettingDropdown
                value={downloadSource}
                onChange={handleDownloadSourceChange}
                disabled={Boolean(downloadingModel)}
                options={[
                  { label: "ModelScope", value: "modelscope" },
                  { label: "HuggingFace", value: "huggingface" },
                ]}
                width={160}
              />
            </div>
            <SettingButton variant="secondary" onClick={handleHealthCheck}>
              健康检查
            </SettingButton>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <SettingButton variant="secondary" onClick={onOpenConfig}>
              API 配置
            </SettingButton>
            <SettingButton variant="primary" onClick={onAddModel}>
              添加模型
            </SettingButton>
          </div>
        )}
      </div>

      <div className="p-4">
        {isLocalMode ? (
          <div className="space-y-3">
            {localLoadError && (
              <div className="p-4 rounded-lg border border-amber-300 bg-amber-50/80 dark:bg-amber-900/20 dark:border-amber-700">
                <div className="text-sm text-amber-700 dark:text-amber-300">
                  本地模型列表加载失败：{localLoadError}
                </div>
                <div className="mt-3">
                  <SettingButton variant="secondary" onClick={loadLocalModels}>
                    重试加载
                  </SettingButton>
                </div>
              </div>
            )}
            {!localLoadError && localModels.length === 0 && (
              <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
                暂未获取到本地模型列表。可点击“重试加载”或重启应用后再试。
              </div>
            )}
            {localModels.map((model) => {
              const isDownloading = downloadingModel === model.name;
              const isActive = currentConfig?.currentModel === model.name;

              return (
                <div
                  key={model.name}
                  className={classNames(
                    "p-4 rounded-lg border transition-colors",
                    isActive
                      ? "border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-700"
                      : "border-gray-200 bg-gray-50 dark:bg-zinc-800/50 dark:border-gray-700",
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                          {model.label}
                        </span>
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-gray-300">
                          {model.downloaded ? "已下载" : "未下载"}
                        </span>
                        {isActive && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400">
                            使用中
                          </span>
                        )}
                      </div>

                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {model.description}
                      </div>

                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex gap-4">
                        <span>大小: {model.size}</span>
                        <span>向量维度: {model.dimensions}</span>
                      </div>

                      {isDownloading && (
                        <div className="mt-3">
                          <div className="h-1.5 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 transition-all"
                              style={{ width: `${downloadProgress}%` }}
                            />
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {downloadMessage ||
                              `下载中... ${downloadProgress}%`}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {model.downloaded ? (
                        <>
                          {!isActive && (
                            <button
                              onClick={() =>
                                onActivateModel(model.name, model.dimensions)
                              }
                              className="px-3 py-1.5 text-sm text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-500/10 rounded-lg transition-colors"
                            >
                              启用
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteLocalModel(model.name)}
                            className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                          >
                            删除
                          </button>
                        </>
                      ) : isDownloading ? (
                        <button
                          onClick={() => handleCancelDownload(model.name)}
                          className="px-3 py-1.5 text-sm text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-500/10 rounded-lg transition-colors"
                        >
                          取消
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDownloadLocalModel(model.name)}
                          className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10 rounded-lg transition-colors"
                        >
                          下载
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : currentConfig?.models && currentConfig.models.length > 0 ? (
          <div className="space-y-3">
            {currentConfig.models.map((model) => {
              const isActive = model.name === currentConfig.currentModel;
              return (
                <div
                  key={model.name}
                  className={classNames(
                    "p-4 rounded-lg transition-colors",
                    isActive
                      ? classNames(themeColors.activeBgClass)
                      : classNames(
                          "bg-transparent",
                          "hover:bg-gray-50 dark:hover:bg-zinc-800/30",
                        ),
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={classNames(
                            "font-medium",
                            isActive
                              ? themeColors.activeTextClass
                              : themeColors.secondaryTextClass,
                          )}
                        >
                          {model.name}
                        </span>
                        <span
                          className={classNames(
                            "px-2 py-0.5 text-xs font-medium rounded-full",
                            isActive
                              ? classNames(
                                  themeColors.activeBadgeClass,
                                  themeColors.activeTextClass,
                                )
                              : classNames(
                                  themeColors.tagBgClass,
                                  themeColors.tagTextClass,
                                ),
                          )}
                        >
                          {isActive ? "使用中" : "未使用"}
                        </span>
                      </div>

                      <div
                        className={classNames(
                          "text-sm mt-1",
                          themeColors.secondaryTextClass,
                        )}
                      >
                        {model.description}
                      </div>

                      <div
                        className={classNames(
                          "flex gap-4 mt-2 text-xs",
                          themeColors.secondaryTextClass,
                        )}
                      >
                        <span>向量长度: {model.contextLength}</span>
                        <span>距离阈值: {model.distance}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      {!isActive && (
                        <button
                          onClick={() =>
                            onActivateModel(model.name, model.contextLength)
                          }
                          className="px-3 py-1.5 text-sm text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-500/10 rounded-lg transition-colors"
                        >
                          启用
                        </button>
                      )}
                      <button
                        onClick={() => onEditModel(model)}
                        className={classNames(
                          "px-3 py-1.5 text-sm rounded-lg transition-colors",
                          themeColors.secondaryTextClass,
                          themeColors.hoverClass,
                          themeColors.hoverTextClass,
                        )}
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => onDeleteApiModel(model.name)}
                        className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className={classNames(
              "py-12 text-center",
              themeColors.secondaryTextClass,
            )}
          >
            暂无模型
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelTable;
