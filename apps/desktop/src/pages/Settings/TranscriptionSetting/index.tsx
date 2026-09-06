import { useEffect, useState, useCallback, useRef } from "react";
import { Button, Progress, Radio, Space, message, Tooltip, Modal, Select } from "antd";
import {
  DownloadOutlined,
  DeleteOutlined,
  CheckCircleFilled,
  FolderOpenOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { SettingContainer, SettingSection, SettingSwitch, SettingDropdown } from "../components";
import {
  getModels,
  downloadModel,
  deleteModel,
  onDownloadProgress,
  getModelsDir,
  getPrograms,
  downloadProgram,
  deleteProgram,
  onProgramDownloadProgress,
  type ModelInfo,
  type DownloadSource,
  type ProgramInfo,
} from "@/commands/model-downloader";
import { invoke } from "@/electron";
import useSettingStore from "@/stores/useSettingStore";
import { produce } from "immer";

const TranscriptionSetting = () => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [programs, setPrograms] = useState<ProgramInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadMessage, setDownloadMessage] = useState<string>("");
  const [downloadingProgram, setDownloadingProgram] = useState<string | null>(null);
  const [programProgress, setProgramProgress] = useState<number>(0);
  const [programMessage, setProgramMessage] = useState<string>("");
  const [modelsDir, setModelsDir] = useState<string>("");

  // 平台检测
  const platform = (window as any).electron?.platform || "win32";
  const isMac = platform === "darwin";

  // 从 store 获取设置
  const currentModel = useSettingStore(state => state.setting.transcription.currentModel);
  const downloadSource = useSettingStore(state => state.setting.transcription.downloadSource);

  // 转录行为设置
  const segmentationLevel = useSettingStore(
    state => state.setting.misc.transcription?.segmentationLevel ?? "sentence"
  );
  const useLLMOptimization = useSettingStore(
    state => state.setting.misc.transcription?.useLLMOptimization ?? false
  );
  const enableLongVideoSegmentation = useSettingStore(
    state => state.setting.misc.transcription?.enableLongVideoSegmentation ?? true
  );
  const setTranscriptionSegmentationLevel = useSettingStore(
    state => state.setTranscriptionSegmentationLevel
  );
  const setTranscriptionUseLLMOptimization = useSettingStore(
    state => state.setTranscriptionUseLLMOptimization
  );
  const setLongVideoSegmentationEnabled = useSettingStore(
    state => state.setLongVideoSegmentationEnabled
  );

  // 更新设置的方法
  const setCurrentModel = (model: string) => {
    useSettingStore.setState(
      produce(draft => {
        draft.setting.transcription.currentModel = model;
      })
    );
  };

  const setDownloadSource = (source: DownloadSource) => {
    useSettingStore.setState(
      produce(draft => {
        draft.setting.transcription.downloadSource = source;
      })
    );
  };

  // 使用 ref 追踪当前正在下载的模型，避免闭包问题
  const downloadingModelRef = useRef<string | null>(null);
  const downloadingProgramRef = useRef<string | null>(null);

  // 加载模型列表
  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getModels();
      if (result.success && result.data) {
        setModels(result.data);
      }
    } catch (error) {
      console.error("Failed to load models:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载程序列表
  const loadPrograms = useCallback(async () => {
    try {
      const result = await getPrograms();
      if (result.success && result.data) {
        setPrograms(result.data);
      }
    } catch (error) {
      console.error("Failed to load programs:", error);
    }
  }, []);

  // 加载模型目录
  const loadModelsDir = useCallback(async () => {
    try {
      const dir = await getModelsDir();
      setModelsDir(dir);
    } catch (error) {
      console.error("Failed to get models dir:", error);
    }
  }, []);

  useEffect(() => {
    loadModels();
    loadPrograms();
    loadModelsDir();
  }, [loadModels, loadPrograms, loadModelsDir]);

  // 监听下载进度 - 只在组件挂载时设置一次
  useEffect(() => {
    const unsubscribe = onDownloadProgress(progress => {
      // 使用 ref 来检查，避免闭包问题
      if (progress.modelName === downloadingModelRef.current) {
        setDownloadProgress(progress.percentage);
        setDownloadMessage(progress.message || "");
        console.log("[TranscriptionSetting] Progress:", progress);
      }
    });

    return () => unsubscribe();
  }, []);

  // 监听程序下载进度
  useEffect(() => {
    const unsubscribe = onProgramDownloadProgress(progress => {
      if (progress.programName === downloadingProgramRef.current) {
        setProgramProgress(progress.percentage);
        setProgramMessage(progress.message || "");
        console.log("[TranscriptionSetting] Program Progress:", progress);
      }
    });

    return () => unsubscribe();
  }, []);

  // 下载模型
  const handleDownload = async (modelName: string) => {
    // 同时更新 state 和 ref
    setDownloadingModel(modelName);
    downloadingModelRef.current = modelName;
    setDownloadProgress(0);
    setDownloadMessage("准备下载...");

    try {
      const result = await downloadModel(modelName, downloadSource);
      if (result.success) {
        message.success(`模型 ${modelName} 下载成功`);
        loadModels();
      } else {
        message.error(`下载失败: ${result.error}`);
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

  // 删除模型
  const handleDelete = async (modelName: string) => {
    Modal.confirm({
      title: "确认删除",
      content: `确定要删除模型 "${modelName}" 吗？删除后需要重新下载。`,
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        try {
          const result = await deleteModel(modelName);
          if (result.success) {
            message.success(`模型 ${modelName} 已删除`);
            loadModels();
          } else {
            message.error(`删除失败: ${result.error}`);
          }
        } catch (error) {
          message.error(`删除失败: ${error}`);
        }
      },
    });
  };

  // 打开模型目录
  const handleOpenModelsDir = async () => {
    try {
      await invoke("transcription-open-models-dir");
    } catch (error) {
      message.error(`打开目录失败: ${error}`);
    }
  };

  // 下载程序
  const handleDownloadProgram = async (programName: string) => {
    setDownloadingProgram(programName);
    downloadingProgramRef.current = programName;
    setProgramProgress(0);
    setProgramMessage("准备下载...");

    try {
      const result = await downloadProgram(programName);
      if (result.success) {
        message.success("转录程序下载成功");
        loadPrograms();
      } else {
        message.error(`下载失败: ${result.error}`);
      }
    } catch (error) {
      message.error(`下载失败: ${error}`);
    } finally {
      setDownloadingProgram(null);
      downloadingProgramRef.current = null;
      setProgramProgress(0);
      setProgramMessage("");
    }
  };

  // 删除程序
  const handleDeleteProgram = async (programName: string) => {
    const program = programs.find(p => p.name === programName);
    Modal.confirm({
      title: "确认删除",
      content: `确定要删除 "${program?.label || programName}" 吗？删除后需要重新下载。`,
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        try {
          const result = await deleteProgram(programName);
          if (result.success) {
            message.success("转录程序已删除");
            loadPrograms();
          } else {
            message.error(`删除失败: ${result.error}`);
          }
        } catch (error) {
          message.error(`删除失败: ${error}`);
        }
      },
    });
  };

  // 检查是否有可用的程序
  const hasAvailableProgram = programs.some(p => p.downloaded);

  return (
    <SettingContainer>
      <SettingSection title="转录行为设置" description="配置音视频转录的断句和优化行为">
        <SettingDropdown
          label="断句模式"
          description="词级别断句可以配合 AI 优化获得更好的断句效果，句子级别由模型直接生成"
          value={segmentationLevel}
          onChange={value => setTranscriptionSegmentationLevel(value as "word" | "sentence")}
          options={[
            { label: "句子级别（默认，速度更快）", value: "sentence" },
            { label: "词级别（支持 AI 优化断句）", value: "word" },
          ]}
        />
        <SettingSwitch
          label="使用 AI 优化断句"
          description={
            segmentationLevel === "sentence"
              ? "句子级别断句不支持 AI 优化，请切换到词级别断句"
              : "开启后，转录结果将通过大模型优化断句，提升字幕质量（需要在「大语言模型」→「使用配置」中配置转录断句优化模型）"
          }
          checked={useLLMOptimization}
          onChange={setTranscriptionUseLLMOptimization}
          disabled={segmentationLevel === "sentence"}
        />
        <SettingSwitch
          label="启用长视频分段转录"
          description="当视频时长超过 30 分钟时，自动拆分为多段并行转录，提高效率并避免上下文过长"
          checked={enableLongVideoSegmentation}
          onChange={setLongVideoSegmentationEnabled}
        />
      </SettingSection>

      <SettingSection title="语音转录" description="配置本地语音转录模型">
        {/* 转录程序（仅 Windows 显示） */}
        {!isMac && (
          <div className="mb-6">
            <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              转录程序
            </div>
            <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
              下载预编译的 faster-whisper 程序，无需配置 Python 环境。GPU 版本自带 CUDA 依赖，适合有
              NVIDIA 显卡的用户。
            </div>
            {!hasAvailableProgram && (
              <div className="mb-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                请先下载转录程序，推荐下载 GPU 版本获得更好的转录速度
              </div>
            )}
            <div className="space-y-2">
              {programs.map(program => (
                <div
                  key={program.name}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    program.downloaded
                      ? "bg-[var(--th-success)]/10 border-[var(--th-success)]/40"
                      : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800 dark:text-gray-200">
                        {program.label}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          program.type === "GPU"
                            ? "bg-[var(--th-accent-soft)] text-[var(--th-active-text)]"
                            : "bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-gray-400"
                        }`}
                      >
                        {program.type}
                      </span>
                      {program.downloaded && <CheckCircleFilled className="text-status-success" />}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {program.size}
                      {program.type === "GPU" && " · 包含 CUDA 依赖"}
                    </div>
                    {downloadingProgram === program.name && (
                      <div className="mt-2">
                        <Progress percent={programProgress} size="small" status="active" />
                        {programMessage && (
                          <div className="mt-1 text-xs text-gray-400">{programMessage}</div>
                        )}
                      </div>
                    )}
                  </div>
                  <Space>
                    {program.downloaded ? (
                      <Button
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteProgram(program.name)}
                      >
                        删除
                      </Button>
                    ) : (
                      <Button
                        type="primary"
                        size="small"
                        icon={<DownloadOutlined />}
                        loading={downloadingProgram === program.name}
                        disabled={
                          downloadingProgram !== null && downloadingProgram !== program.name
                        }
                        onClick={() => handleDownloadProgram(program.name)}
                      >
                        下载
                      </Button>
                    )}
                  </Space>
                </div>
              ))}
              {programs.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                  暂无可用的转录程序
                </div>
              )}
            </div>
          </div>
        )}
        {/* Mac 显示内置说明 */}
        {isMac && (
          <div className="mb-6">
            <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              转录程序
            </div>
            <div className="border-[var(--th-border-focus)]/30 rounded-lg border bg-[var(--th-accent-soft)] p-3 text-sm text-[var(--th-active-text)]">
              ✓ macOS 使用内置 Python 脚本运行 faster-whisper，无需额外下载程序
            </div>
          </div>
        )}

        {/* faster-whisper 模型 */}
        {/* 当前使用的模型 */}
        <div className="mb-6">
          <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            当前使用的模型
          </div>
          <Select
            value={currentModel}
            onChange={setCurrentModel}
            style={{ width: 300 }}
            placeholder="请选择模型"
            options={models
              .filter(m => m.downloaded)
              .map(m => ({
                value: m.name,
                label: (
                  <span>
                    {m.label}
                    <span className="ml-2 text-xs text-gray-400">({m.size})</span>
                  </span>
                ),
              }))}
            notFoundContent={<span className="text-gray-400">暂无已下载的模型，请先下载</span>}
          />
          {currentModel && (
            <div className="mt-1 text-xs text-gray-500">
              已选择: {models.find(m => m.name === currentModel)?.label || currentModel}
            </div>
          )}
        </div>

        {/* 下载源选择 */}
        <div className="mb-6">
          <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">下载源</div>
          <Radio.Group value={downloadSource} onChange={e => setDownloadSource(e.target.value)}>
            <Radio value="modelscope">ModelScope（国内推荐）</Radio>
            <Radio value="huggingface">HuggingFace（国际）</Radio>
          </Radio.Group>
        </div>

        {/* 模型目录 */}
        <div className="mb-6 flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">模型目录:</span>
          <code className="rounded bg-gray-100 px-2 py-1 text-xs dark:bg-zinc-800">
            {modelsDir}
          </code>
          <Tooltip title="打开模型目录">
            <Button
              type="text"
              size="small"
              icon={<FolderOpenOutlined />}
              onClick={handleOpenModelsDir}
            />
          </Tooltip>
          <Tooltip title="刷新模型列表">
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              onClick={loadModels}
              loading={loading}
            />
          </Tooltip>
        </div>

        {/* faster-whisper 模型列表 */}
        <div className="space-y-3">
          {models.map(model => {
            const isCurrentModel = model.name === currentModel;
            return (
              <div
                key={model.name}
                className={`flex items-center justify-between rounded-lg border p-4 ${
                  isCurrentModel
                    ? "border-[var(--th-border-focus)]/40 bg-[var(--th-accent-soft)]"
                    : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-zinc-800/50"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                      {model.label}
                    </span>
                    {model.recommended && (
                      <span className="bg-[var(--th-info)]/15 dark: rounded px-2 py-0.5 text-xs text-[var(--th-active-text)]">
                        推荐
                      </span>
                    )}
                    {isCurrentModel && (
                      <span className="bg-[var(--th-success)]/15 text-status-success rounded px-2 py-0.5 text-xs">
                        当前使用
                      </span>
                    )}
                    {model.downloaded && !isCurrentModel && (
                      <CheckCircleFilled className="text-status-success" />
                    )}
                  </div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {model.description} · {model.size}
                  </div>
                  {downloadingModel === model.name && (
                    <div className="mt-2">
                      <Progress percent={downloadProgress} size="small" status="active" />
                      {downloadMessage && (
                        <div className="mt-1 text-xs text-gray-400">{downloadMessage}</div>
                      )}
                    </div>
                  )}
                </div>
                <Space>
                  {model.downloaded ? (
                    <>
                      {!isCurrentModel && (
                        <Button
                          size="small"
                          type="primary"
                          onClick={() => setCurrentModel(model.name)}
                        >
                          使用
                        </Button>
                      )}
                      <Button
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(model.name)}
                        disabled={isCurrentModel}
                      >
                        删除
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="primary"
                      size="small"
                      icon={<DownloadOutlined />}
                      loading={downloadingModel === model.name}
                      onClick={() => handleDownload(model.name)}
                    >
                      下载
                    </Button>
                  )}
                </Space>
              </div>
            );
          })}
        </div>

        {/* 使用说明 */}
        <div className="border-[var(--th-border-focus)]/30 mt-6 rounded-lg border bg-[var(--th-accent-soft)] p-4">
          <div className="mb-2 text-sm font-medium text-[var(--th-active-text)]">使用说明</div>
          <ul className="list-inside list-disc space-y-1 text-sm text-[var(--th-active-text)]">
            <li>首次使用需要下载转录模型</li>
            <li>推荐使用 Base 模型，兼顾速度和准确度</li>
            <li>国内用户建议使用 ModelScope 下载源</li>
            {!isMac && <li>有 NVIDIA 显卡时建议选择 GPU 版本程序，速度提升显著</li>}
            <li>词级时间戳更精确，适合 LLM 优化断句</li>
            <li>模型越大，准确度越高，但处理速度越慢</li>
          </ul>
        </div>
      </SettingSection>
    </SettingContainer>
  );
};

export default TranscriptionSetting;
