import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "antd";
import { produce } from "immer";
import classNames from "classnames";
import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";
import {
  getSearchModels,
  downloadSearchModel,
  cancelSearchDownload,
  deleteSearchModel,
  onSearchDownloadProgress,
  type SearchModelInfo,
  type EmbeddingDownloadSource,
} from "@/commands";
import {
  SettingButton,
  SettingDropdown,
  SettingInput,
  SettingSwitch,
} from "../../components";

const SearchModelSection = () => {
  const { modal, message } = App.useApp();
  const themeColors = useThemeColors();
  const searchConfig = useSettingStore(
    (state) => state.setting.searchModelProvider,
  );
  const enableExpander = searchConfig.enableExpander !== false;
  const enableReranker = searchConfig.enableReranker !== false;

  const [models, setModels] = useState<SearchModelInfo[]>([]);
  const [loadError, setLoadError] = useState<string>("");
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadMessage, setDownloadMessage] = useState<string>("");
  const downloadingModelRef = useRef<string | null>(null);

  const persistConfig = (updater: (draft: any) => void) => {
    useSettingStore.setState(
      produce((draft) => {
        updater(draft.setting.searchModelProvider);
      }),
    );
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
      console.error("加载检索模型失败:", error);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  useEffect(() => {
    const unsubscribe = onSearchDownloadProgress((progress) => {
      if (progress.modelName === downloadingModelRef.current) {
        setDownloadProgress(progress.percentage);
        setDownloadMessage(progress.message || "");
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSourceChange = (value: string) => {
    if (value !== "modelscope" && value !== "huggingface") {
      return;
    }
    persistConfig((config: any) => {
      config.source = value as EmbeddingDownloadSource;
    });
  };

  const handleDevicePolicyChange = (value: string) => {
    if (value !== "auto" && value !== "cpu" && value !== "cuda") {
      return;
    }
    persistConfig((config: any) => {
      config.devicePolicy = value;
    });
  };

  const handleBatchSizeChange = (value: string) => {
    const next = Number.parseInt(value || "8", 10);
    persistConfig((config: any) => {
      config.batchSize = Number.isFinite(next) && next > 0 ? next : 8;
    });
  };

  const handleEnableExpanderChange = (checked: boolean) => {
    persistConfig((config: any) => {
      config.enableExpander = checked;
    });
  };

  const handleEnableRerankerChange = (checked: boolean) => {
    persistConfig((config: any) => {
      config.enableReranker = checked;
    });
  };

  const handleActivateModel = (model: SearchModelInfo) => {
    persistConfig((config: any) => {
      if (model.kind === "query_expander") {
        config.queryExpanderModel = model.name;
      } else if (model.kind === "reranker") {
        config.rerankerModel = model.name;
      }
    });
    message.success("已启用模型配置");
  };

  const handleDownloadModel = async (modelName: string) => {
    setDownloadingModel(modelName);
    downloadingModelRef.current = modelName;
    setDownloadProgress(0);
    setDownloadMessage("准备下载...");

    try {
      const result = await downloadSearchModel(
        modelName,
        searchConfig.source || "modelscope",
      );
      if (result.success) {
        message.success(`模型 ${modelName} 下载成功`);
        await loadModels();
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
    await cancelSearchDownload(modelName);
    setDownloadingModel(null);
    downloadingModelRef.current = null;
    setDownloadProgress(0);
    setDownloadMessage("");
    message.info("已取消下载");
  };

  const handleDeleteModel = (modelName: string) => {
    modal.confirm({
      title: "确认删除检索模型？",
      content: "删除后需要重新下载才能使用。",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        const result = await deleteSearchModel(modelName);
        if (!result.success) {
          message.error(result.error || "删除失败");
          return;
        }
        message.success("删除成功");
        await loadModels();
      },
    });
  };

  return (
    <div
      className={classNames(
        "rounded-xl bg-transparent border",
        themeColors.focusBorderClass,
      )}
    >
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <h3 className="text-base font-semibold">检索模型（扩展 / 重排）</h3>
          <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            本地优先：模型缺失会自动降级，不中断搜索流程
          </div>
        </div>
        <div className="w-40">
          <SettingDropdown
            value={searchConfig.source || "modelscope"}
            onChange={handleSourceChange}
            disabled={Boolean(downloadingModel)}
            options={[
              { label: "ModelScope", value: "modelscope" },
              { label: "HuggingFace", value: "huggingface" },
            ]}
            width={160}
          />
        </div>
      </div>

      <div className="px-5 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-1">
            运行设备
          </div>
          <SettingDropdown
            value={searchConfig.devicePolicy || "auto"}
            onChange={handleDevicePolicyChange}
            options={[
              { label: "自动", value: "auto" },
              { label: "CPU", value: "cpu" },
              { label: "CUDA", value: "cuda" },
            ]}
          />
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-1">
            批处理大小（rerank）
          </div>
          <SettingInput
            value={String(searchConfig.batchSize || 8)}
            onChange={(event) => handleBatchSizeChange(event.target.value)}
            placeholder="8"
          />
        </div>
      </div>

      <div className="px-5 pb-2 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3">
          <SettingSwitch
            checked={enableExpander}
            onChange={handleEnableExpanderChange}
            label="启用 Query Expander"
            description="关闭后跳过查询扩展，仅使用原始 query"
          />
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3">
          <SettingSwitch
            checked={enableReranker}
            onChange={handleEnableRerankerChange}
            label="启用 Reranker"
            description="关闭后使用 RRF 结果，不执行本地重排"
          />
        </div>
      </div>

      <div className="p-4 space-y-3">
        {loadError && (
          <div className="p-4 rounded-lg border border-amber-300 bg-amber-50/80 dark:bg-amber-900/20 dark:border-amber-700">
            <div className="text-sm text-amber-700 dark:text-amber-300">
              检索模型列表加载失败：{loadError}
            </div>
            <div className="mt-3">
              <SettingButton variant="secondary" onClick={loadModels}>
                重试加载
              </SettingButton>
            </div>
          </div>
        )}
        {!loadError && models.length === 0 && (
          <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
            暂未获取到检索模型列表。可点击“重试加载”或重启应用后再试。
          </div>
        )}
        {models.map((model) => {
          const isDownloading = downloadingModel === model.name;
          const isExpanderActive =
            model.kind === "query_expander" &&
            searchConfig.queryExpanderModel === model.name;
          const isRerankerActive =
            model.kind === "reranker" &&
            searchConfig.rerankerModel === model.name;
          const isActive = isExpanderActive || isRerankerActive;

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
                      {model.kind === "query_expander" ? "扩展" : "重排"}
                    </span>
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-gray-300">
                      {model.downloaded ? "已下载" : "未下载"}
                    </span>
                    {isExpanderActive && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400">
                        当前扩展模型
                      </span>
                    )}
                    {model.kind === "query_expander" && !enableExpander && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-gray-300">
                        已关闭
                      </span>
                    )}
                    {isRerankerActive && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400">
                        当前重排模型
                      </span>
                    )}
                    {model.kind === "reranker" && !enableReranker && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-gray-300">
                        已关闭
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {model.description}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex gap-4">
                    <span>大小: {model.size}</span>
                    <span>目录名: {model.name}</span>
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
                        {downloadMessage || `下载中... ${downloadProgress}%`}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {model.downloaded ? (
                    <>
                      {!isActive && (
                        <button
                          onClick={() => handleActivateModel(model)}
                          className="px-3 py-1.5 text-sm text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-500/10 rounded-lg transition-colors"
                        >
                          启用
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteModel(model.name)}
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
                      onClick={() => handleDownloadModel(model.name)}
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
    </div>
  );
};

export default SearchModelSection;
