/**
 * 语音 —— 定稿初版（2026-09-24，mockups/settings/index.html 第三版「语音」）。
 *
 * 合并 legacy TranscriptionSetting 与 TextToSpeechSetting（PodcastTTSSetting），页内分
 * 「语音转录 / 语音合成」两个 Tab：
 * - 语音转录：转录行为（断句粒度 / AI 优化断句 / 长视频分段）、转录程序（faster-whisper
 *   预编译程序，沿用 legacy 的 !isMac 判定）、转录模型（当前模型 / 下载源 / 模型目录 / 模型列表）
 * - 语音合成：多服务商配置（ttsProviders，对齐大语言模型的 llmProviders 模式）+ 当前服务
 *   （提供商 / 模型 / 音色），实现见 VoiceTtsPanel
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AudioLines, Cpu, Download, FolderOpen, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { produce } from "immer";
import { Button, ConfirmDialog, IconButton, Select, Switch, toast } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import {
  deleteModel,
  deleteProgram,
  downloadModel,
  downloadProgram,
  getModels,
  getModelsDir,
  getPrograms,
  onDownloadProgress,
  onProgramDownloadProgress,
  openTranscriptionModelsDir,
  type DownloadSource,
  type ModelInfo,
  type ProgramInfo,
} from "@/commands";
import { isMac } from "@/platform";
import { ROW_DIVIDER } from "../components/rowDivider";
import { SettingRow } from "../components/SettingRow";
import { SettingsGroup } from "../components/SettingsGroup";
import { SettingsTabs } from "../components/SettingsTabs";
import { StatusChip } from "../components/StatusChip";
import { VoiceTtsPanel } from "./VoiceTtsPanel";
import { useSettingsStore } from "@/app/settingsStore";

const SEGMENTATION_OPTIONS = [
  { value: "sentence", label: "句子级（速度更快）" },
  { value: "word", label: "词级（支持 AI 优化）" },
];

const SOURCE_OPTIONS: Array<{ value: DownloadSource; label: string }> = [
  { value: "modelscope", label: "ModelScope（国内推荐）" },
  { value: "huggingface", label: "HuggingFace（国际）" },
];

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function VoiceSection() {
  const tab = useSettingsStore(state => state.voiceTab);
  const setTab = useSettingsStore(state => state.setVoiceTab);
  return (
    <>
      <SettingsTabs
        label="语音视图"
        value={tab}
        onChange={setTab}
        items={[
          { key: "transcription", label: "语音转录" },
          { key: "tts", label: "语音合成" },
        ]}
      />
      {tab === "transcription" ? <TranscriptionPanel /> : <VoiceTtsPanel />}
    </>
  );
}

/** 下载进度：同一时刻只追踪一个下载项（ref 供事件回调读取，避免闭包过期） */
function useDownloadTracker() {
  const [name, setName] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState("");
  const nameRef = useRef<string | null>(null);

  const start = (target: string) => {
    nameRef.current = target;
    setName(target);
    setPercent(0);
    setMessage("准备下载…");
  };
  const finish = () => {
    nameRef.current = null;
    setName(null);
    setPercent(0);
    setMessage("");
  };
  const report = useCallback((target: string, value: number, text?: string) => {
    if (target !== nameRef.current) return;
    setPercent(value);
    setMessage(text || "");
  }, []);

  return { name, percent, message, start, finish, report };
}

function TranscriptionPanel() {
  const transcription = useSettingStore(s => s.setting.transcription);
  const segmentationLevel = useSettingStore(
    s => s.setting.misc.transcription?.segmentationLevel ?? "sentence"
  );
  const useLLMOptimization = useSettingStore(
    s => s.setting.misc.transcription?.useLLMOptimization ?? false
  );
  const enableLongVideoSegmentation = useSettingStore(
    s => s.setting.misc.transcription?.enableLongVideoSegmentation ?? true
  );
  const setSegmentationLevel = useSettingStore(s => s.setTranscriptionSegmentationLevel);
  const setUseLLMOptimization = useSettingStore(s => s.setTranscriptionUseLLMOptimization);
  const setLongVideoSegmentation = useSettingStore(s => s.setLongVideoSegmentationEnabled);
  const { currentModel, downloadSource } = transcription;

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsDir, setModelsDir] = useState("");
  const [programs, setPrograms] = useState<ProgramInfo[]>([]);
  const modelDownload = useDownloadTracker();
  const programDownload = useDownloadTracker();
  const [pendingDelete, setPendingDelete] = useState<{
    kind: "model" | "program";
    name: string;
    label: string;
  } | null>(null);

  const updateTranscription = (patch: Partial<typeof transcription>) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        Object.assign(draft.transcription, patch);
      }),
    }));
  };

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const result = await getModels();
      if (result.success && result.data) setModels(result.data);
    } catch (error) {
      console.error("加载转录模型失败", error);
    } finally {
      setModelsLoading(false);
    }
  }, []);

  const loadPrograms = useCallback(async () => {
    try {
      const result = await getPrograms();
      if (result.success && result.data) setPrograms(result.data);
    } catch (error) {
      console.error("加载转录程序失败", error);
    }
  }, []);

  useEffect(() => {
    void loadModels();
    if (!isMac) void loadPrograms();
    getModelsDir()
      .then(setModelsDir)
      .catch(error => console.error("获取模型目录失败", error));
  }, [loadModels, loadPrograms]);

  const reportModel = modelDownload.report;
  const reportProgram = programDownload.report;
  useEffect(
    () => onDownloadProgress(p => reportModel(p.modelName, p.percentage, p.message)),
    [reportModel]
  );
  useEffect(
    () => onProgramDownloadProgress(p => reportProgram(p.programName, p.percentage, p.message)),
    [reportProgram]
  );

  const handleDownloadModel = async (model: ModelInfo) => {
    modelDownload.start(model.name);
    try {
      const result = await downloadModel(model.name, downloadSource);
      if (result.success) {
        toast.success(`模型 ${model.label} 下载成功`);
        void loadModels();
      } else {
        toast.error(`下载失败：${result.error}`);
      }
    } catch (error) {
      toast.error(`下载失败：${errorText(error)}`);
    } finally {
      modelDownload.finish();
    }
  };

  const handleDownloadProgram = async (program: ProgramInfo) => {
    programDownload.start(program.name);
    try {
      const result = await downloadProgram(program.name);
      if (result.success) {
        toast.success("转录程序下载成功");
        void loadPrograms();
      } else {
        toast.error(`下载失败：${result.error}`);
      }
    } catch (error) {
      toast.error(`下载失败：${errorText(error)}`);
    } finally {
      programDownload.finish();
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const { kind, name, label } = pendingDelete;
    try {
      const result = kind === "model" ? await deleteModel(name) : await deleteProgram(name);
      if (result.success) {
        toast.success(`${label} 已删除`);
        void (kind === "model" ? loadModels() : loadPrograms());
      } else {
        toast.error(`删除失败：${result.error}`);
      }
    } catch (error) {
      toast.error(`删除失败：${errorText(error)}`);
    }
  };

  const handleOpenModelsDir = async () => {
    try {
      await openTranscriptionModelsDir();
    } catch (error) {
      toast.error(`打开目录失败：${errorText(error)}`);
    }
  };

  const downloadedModels = models.filter(m => m.downloaded);
  const hasProgram = programs.some(p => p.downloaded);

  return (
    <>
      <SettingsGroup title="转录行为">
        <SettingRow title="断句粒度" description="词级断句可配合 AI 优化，句子级由模型直接生成">
          <Select
            aria-label="断句粒度"
            className="w-[200px]"
            value={segmentationLevel}
            options={SEGMENTATION_OPTIONS}
            onValueChange={v => setSegmentationLevel(v as "word" | "sentence")}
          />
        </SettingRow>
        <SettingRow
          title="AI 优化断句"
          description={
            segmentationLevel === "sentence"
              ? "句子级断句不支持 AI 优化，切换到词级后可开启"
              : "使用「大语言模型 · 功能分配 · 转录断句优化」指定的模型优化断句"
          }
        >
          <Switch
            aria-label="AI 优化断句"
            checked={useLLMOptimization}
            disabled={segmentationLevel === "sentence"}
            onCheckedChange={setUseLLMOptimization}
          />
        </SettingRow>
        <SettingRow title="长视频分段转录" description="超过 30 分钟的视频拆分为多段并行转录">
          <Switch
            aria-label="长视频分段转录"
            checked={enableLongVideoSegmentation}
            onCheckedChange={setLongVideoSegmentation}
          />
        </SettingRow>
      </SettingsGroup>

      {!isMac && (
        <SettingsGroup
          title="转录程序"
          description={
            hasProgram
              ? "预编译的 faster-whisper 程序，无需 Python 环境；GPU 版自带 CUDA 依赖"
              : "请先下载转录程序，有 NVIDIA 显卡推荐 GPU 版本以获得更快的转录速度"
          }
        >
          {programs.length === 0 ? (
            <div className="text-tau-meta text-ink-2 px-3 py-6 text-center">暂无可用的转录程序</div>
          ) : (
            programs.map(program => (
              <DownloadRow
                key={program.name}
                icon={<Cpu size={15} strokeWidth={1.75} />}
                title={program.label}
                chips={
                  <>
                    <StatusChip>{program.type}</StatusChip>
                    {program.downloaded && <StatusChip tone="ok">已下载</StatusChip>}
                  </>
                }
                meta={`${program.size}${program.type === "GPU" ? " · 包含 CUDA 依赖" : ""}`}
                progress={
                  programDownload.name === program.name
                    ? { percent: programDownload.percent, message: programDownload.message }
                    : undefined
                }
              >
                {program.downloaded ? (
                  <Button
                    variant="danger-soft"
                    size="sm"
                    onClick={() =>
                      setPendingDelete({
                        kind: "program",
                        name: program.name,
                        label: program.label,
                      })
                    }
                  >
                    删除
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Download}
                    loading={programDownload.name === program.name}
                    loadingText="下载中…"
                    disabled={
                      programDownload.name !== null && programDownload.name !== program.name
                    }
                    onClick={() => void handleDownloadProgram(program)}
                  >
                    下载
                  </Button>
                )}
              </DownloadRow>
            ))
          )}
        </SettingsGroup>
      )}

      <SettingsGroup title="转录模型" description="在本地运行 faster-whisper">
        <SettingRow title="当前模型" description="只能选择已下载的模型">
          <Select
            aria-label="当前转录模型"
            className="w-[240px]"
            placeholder="请选择模型"
            emptyText="暂无已下载的模型，请先下载"
            value={downloadedModels.some(m => m.name === currentModel) ? currentModel : null}
            options={downloadedModels.map(m => ({
              value: m.name,
              label: `${m.label}（${m.size}）`,
            }))}
            onValueChange={v => updateTranscription({ currentModel: v })}
          />
        </SettingRow>
        <SettingRow title="下载源">
          <Select
            aria-label="模型下载源"
            className="w-[240px]"
            value={downloadSource}
            options={SOURCE_OPTIONS}
            onValueChange={v => updateTranscription({ downloadSource: v })}
          />
        </SettingRow>
        <SettingRow
          title="模型目录"
          description={<span className="font-tau-mono break-all">{modelsDir || "—"}</span>}
        >
          <IconButton aria-label="打开模型目录" onClick={() => void handleOpenModelsDir()}>
            <FolderOpen size={15} strokeWidth={1.75} />
          </IconButton>
          <IconButton
            aria-label="刷新模型列表"
            disabled={modelsLoading}
            onClick={() => void loadModels()}
          >
            <RefreshCw
              size={15}
              strokeWidth={1.75}
              className={clsx(modelsLoading && "animate-spin")}
            />
          </IconButton>
        </SettingRow>
        {models.length === 0 ? (
          <div className={clsx("text-tau-meta text-ink-2 px-3 py-6 text-center", ROW_DIVIDER)}>
            {modelsLoading ? "正在加载模型列表…" : "暂无可用模型"}
          </div>
        ) : (
          models.map(model => {
            const isCurrent = model.name === currentModel;
            const isDownloading = modelDownload.name === model.name;
            return (
              <DownloadRow
                key={model.name}
                icon={<AudioLines size={15} strokeWidth={1.75} />}
                title={model.label}
                chips={
                  <>
                    {model.recommended && <StatusChip>推荐</StatusChip>}
                    {isCurrent && model.downloaded && (
                      <StatusChip tone="accent">当前使用</StatusChip>
                    )}
                    {model.downloaded && !isCurrent && <StatusChip tone="ok">已下载</StatusChip>}
                  </>
                }
                meta={`${model.description} · ${model.size}`}
                progress={
                  isDownloading
                    ? { percent: modelDownload.percent, message: modelDownload.message }
                    : undefined
                }
              >
                {model.downloaded ? (
                  <>
                    {!isCurrent && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => updateTranscription({ currentModel: model.name })}
                      >
                        使用
                      </Button>
                    )}
                    <Button
                      variant="danger-soft"
                      size="sm"
                      disabled={isCurrent}
                      onClick={() =>
                        setPendingDelete({ kind: "model", name: model.name, label: model.label })
                      }
                    >
                      删除
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Download}
                    loading={isDownloading}
                    loadingText="下载中…"
                    disabled={modelDownload.name !== null && !isDownloading}
                    onClick={() => void handleDownloadModel(model)}
                  >
                    下载
                  </Button>
                )}
              </DownloadRow>
            );
          })
        )}
      </SettingsGroup>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={open => {
          if (!open) setPendingDelete(null);
        }}
        title={pendingDelete?.kind === "program" ? "删除转录程序" : "删除转录模型"}
        context={pendingDelete?.label}
        danger
        description="删除后需要重新下载才能使用。"
        confirmText="删除"
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}

/** 可下载项列表行：图标块 + 名称/状态签 + 说明 + 进度条，右侧动作 */
function DownloadRow({
  icon,
  title,
  chips,
  meta,
  progress,
  children,
}: {
  icon: ReactNode;
  title: string;
  chips?: ReactNode;
  meta: string;
  progress?: { percent: number; message: string };
  children: ReactNode;
}) {
  return (
    <div className={clsx("rounded-tau-sm flex items-center gap-3 px-3 py-3", ROW_DIVIDER)}>
      <span className="bg-hover text-ink-2 rounded-tau-sm grid size-8 shrink-0 place-items-center">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-tau-body-lg text-ink-1 truncate font-medium">{title}</span>
          {chips}
        </div>
        <div className="text-tau-meta text-ink-2 mt-0.5 truncate">{meta}</div>
        {progress && (
          <div className="mt-2">
            <div className="bg-sunken h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-accent h-full rounded-full transition-[width] duration-200"
                style={{ width: `${Math.round(progress.percent)}%` }}
              />
            </div>
            <div className="text-tau-meta text-ink-2 mt-1 flex justify-between tabular-nums">
              <span className="truncate">{progress.message}</span>
              <span>{Math.round(progress.percent)}%</span>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-none items-center gap-2">{children}</div>
    </div>
  );
}
