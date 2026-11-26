import { voiceText, voiceValue, useVoiceSettingsI18n } from "./voice.i18n";
import {
  transcriptionDefaults,
  qwenAlignerId,
  selectedModelId,
  qwenRuntimeDevice,
  recommendedQwenDevice,
  qwenRuntimeId,
} from "../../../../shared/local-transcription";
import { useQwenHardware } from "@/components/VideoNotePanel/useQwenHardware";
import { TranscriptionFields } from "@/components/VideoNotePanel/TranscriptionFields";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AudioLines, Cpu, Download, FolderOpen, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { produce } from "immer";
import {
  ROW_DIVIDER,
  SettingRow,
  Button,
  ConfirmDialog,
  IconButton,
  Select,
  Switch,
  toast,
} from "@tau/ui";
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
import { SettingsGroup } from "../components/SettingsGroup";
import { SettingsTabs } from "../components/SettingsTabs";
import { StatusChip } from "../components/StatusChip";
import { VoiceInputPanel } from "./VoiceInputPanel";
import { VoiceTtsPanel } from "./VoiceTtsPanel";
import { useSettingsStore } from "@/app/settingsStore";

const SOURCE_OPTIONS: Array<{ value: DownloadSource; label: string }> = [
  {
    value: "modelscope",
    get label() {
      return voiceText("ui.modelscopeRecommendedInChina");
    },
  },
  {
    value: "huggingface",
    get label() {
      return voiceText("ui.huggingfaceInternational");
    },
  },
];

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function VoiceSection() {
  useVoiceSettingsI18n();

  const tab = useSettingsStore(state => state.voiceTab);
  const setTab = useSettingsStore(state => state.setVoiceTab);
  return (
    <>
      <SettingsTabs
        label={voiceText("ui.voiceSettingsView")}
        value={tab}
        onChange={setTab}
        items={[
          {
            key: "transcription",
            get label() {
              return voiceText("ui.transcription");
            },
          },
          {
            key: "tts",
            get label() {
              return voiceText("ui.textToSpeech");
            },
          },
          {
            key: "input",
            get label() {
              return voiceText("ui.voiceInput");
            },
          },
        ]}
      />
      {tab === "transcription" ? (
        <TranscriptionPanel />
      ) : tab === "tts" ? (
        <VoiceTtsPanel />
      ) : (
        <VoiceInputPanel />
      )}
    </>
  );
}

/** 下载进度：同一时刻只追踪一个下载项（ref 供事件回调读取，避免闭包过期） */
function useDownloadTracker() {
  const [name, setName] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState<string | null>("");
  const nameRef = useRef<string | null>(null);

  const start = (target: string) => {
    nameRef.current = target;
    setName(target);
    setPercent(0);
    setMessage(null);
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
  useVoiceSettingsI18n();

  const transcription = useSettingStore(s => s.setting.transcription);
  const legacy = useSettingStore(s => s.setting.misc.transcription);
  const selection = transcriptionDefaults(transcription, legacy);
  const enableLongVideoSegmentation = useSettingStore(
    s => s.setting.misc.transcription?.enableLongVideoSegmentation ?? true
  );
  const setLongVideoSegmentation = useSettingStore(s => s.setLongVideoSegmentationEnabled);
  const { downloadSource } = transcription;

  const [models, setModels] = useState<ModelInfo[]>([]);
  const hardware = useQwenHardware(selection.engine, models);
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
        toast.success(voiceText("message.downloadedModel", { model: voiceValue(model.label) }));
        void loadModels();
      } else {
        toast.error(voiceText("message.downloadFailed", { error: voiceValue(result.error) }));
      }
    } catch (error) {
      toast.error(voiceText("message.downloadFailed", { error: voiceValue(errorText(error)) }));
    } finally {
      modelDownload.finish();
    }
  };

  const handleDownloadProgram = async (program: ProgramInfo) => {
    programDownload.start(program.name);
    try {
      const result = await downloadProgram(program.name);
      if (result.success) {
        toast.success(voiceText("ui.transcriptionProgramDownloaded"));
        void loadPrograms();
      } else {
        toast.error(voiceText("message.downloadFailed", { error: voiceValue(result.error) }));
      }
    } catch (error) {
      toast.error(voiceText("message.downloadFailed", { error: voiceValue(errorText(error)) }));
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
        toast.success(voiceText("message.deleted", { name: voiceValue(label) }));
        void (kind === "model" ? loadModels() : loadPrograms());
      } else {
        toast.error(voiceText("message.couldNotDelete", { error: voiceValue(result.error) }));
      }
    } catch (error) {
      toast.error(voiceText("message.couldNotDelete", { error: voiceValue(errorText(error)) }));
    }
  };

  const handleOpenModelsDir = async () => {
    try {
      await openTranscriptionModelsDir();
    } catch (error) {
      toast.error(voiceText("message.couldNotOpenFolder", { error: voiceValue(errorText(error)) }));
    }
  };

  const currentModel = selectedModelId(selection, models);
  const aligner =
    selection.engine === "qwen" && selection.output === "subtitles" ? qwenAlignerId : undefined;
  const runtimes = models.filter(m => qwenRuntimeDevice(m.name));

  const visibleModels = models.filter(m =>
    selection.engine === "qwen"
      ? !qwenRuntimeDevice(m.name) &&
        m.name.startsWith("qwen3-") &&
        (m.name !== qwenAlignerId || !!aligner || m.downloaded)
      : !m.name.startsWith("qwen3-")
  );
  const hasProgram = programs.some(p => p.downloaded);

  return (
    <>
      <SettingsGroup title={voiceText("ui.defaultTranscriptionSettings")}>
        <TranscriptionFields
          value={selection}
          models={models}
          hardware={hardware}
          onChange={updateTranscription}
        />
        <SettingRow
          title={voiceText("ui.splitLongVideos")}
          description={voiceText("ui.splitVideosLongerThan30MinutesInto")}
        >
          <Switch
            aria-label={voiceText("ui.splitLongVideos")}
            checked={enableLongVideoSegmentation}
            onCheckedChange={setLongVideoSegmentation}
          />
        </SettingRow>
      </SettingsGroup>

      {selection.engine === "qwen" && runtimes.length > 0 && (
        <SettingsGroup title={voiceText("ui.transcriptionPrograms")}>
          {runtimes.map(runtime => (
            <DownloadRow
              key={runtime.name}
              title={runtime.label}
              icon={<Cpu size={15} />}
              chips={
                <>
                  {hardware.report &&
                    runtime.name === qwenRuntimeId(recommendedQwenDevice(hardware.report)) && (
                      <StatusChip>{voiceText("ui.recommended")}</StatusChip>
                    )}
                  {runtime.downloaded && (
                    <StatusChip
                      tone={runtime.name === qwenRuntimeId(selection.qwenDevice) ? "accent" : "ok"}
                    >
                      {runtime.name === qwenRuntimeId(selection.qwenDevice)
                        ? voiceText("ui.inUse")
                        : voiceText("ui.downloaded")}
                    </StatusChip>
                  )}
                </>
              }
              meta={runtime.description + " · " + runtime.size}
              progress={
                modelDownload.name === runtime.name
                  ? { percent: modelDownload.percent, message: modelDownload.message }
                  : undefined
              }
            >
              {!runtime.downloaded ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={modelDownload.name !== null}
                  onClick={() => void handleDownloadModel(runtime)}
                >
                  {voiceText("ui.download")}
                </Button>
              ) : (
                runtime.name !== qwenRuntimeId(selection.qwenDevice) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      updateTranscription({ qwenDevice: qwenRuntimeDevice(runtime.name) })
                    }
                  >
                    {voiceText("ui.use")}
                  </Button>
                )
              )}
            </DownloadRow>
          ))}
        </SettingsGroup>
      )}
      {!isMac && selection.engine === "whisper" && (
        <SettingsGroup
          title={voiceText("ui.transcriptionPrograms")}
          description={
            hasProgram
              ? voiceText("ui.prebuiltFasterWhisperProgramsNoPythonSetup")
              : voiceText("ui.downloadATranscriptionProgramFirstTheGPU")
          }
        >
          {programs.length === 0 ? (
            <div className="text-tau-meta text-ink-2 px-3 py-6 text-center">
              {voiceText("ui.noTranscriptionProgramsAvailable")}
            </div>
          ) : (
            programs.map(program => (
              <DownloadRow
                key={program.name}
                icon={<Cpu size={15} strokeWidth={1.75} />}
                title={program.label}
                chips={
                  <>
                    <StatusChip>{program.type}</StatusChip>
                    {program.downloaded && (
                      <StatusChip tone="ok">{voiceText("ui.downloaded")}</StatusChip>
                    )}
                  </>
                }
                meta={`${program.size}${program.type === "GPU" ? voiceText("ui.includesCUDADependencies") : ""}`}
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
                    {voiceText("ui.delete")}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Download}
                    loading={programDownload.name === program.name}
                    loadingText={voiceText("ui.downloading")}
                    disabled={
                      programDownload.name !== null && programDownload.name !== program.name
                    }
                    onClick={() => void handleDownloadProgram(program)}
                  >
                    {voiceText("ui.download")}
                  </Button>
                )}
              </DownloadRow>
            ))
          )}
        </SettingsGroup>
      )}

      <SettingsGroup
        title={voiceText("ui.modelDownloads")}
        description={
          selection.engine === "qwen"
            ? voiceText("ui.tauDownloadsTheRuntimeForThisDevice")
            : undefined
        }
      >
        <SettingRow title={voiceText("ui.downloadSource")}>
          <Select
            aria-label={voiceText("ui.modelDownloadSource")}
            className="w-[240px]"
            value={downloadSource}
            options={SOURCE_OPTIONS}
            onValueChange={v => updateTranscription({ downloadSource: v })}
          />
        </SettingRow>
        <SettingRow
          title={voiceText("ui.modelFolder")}
          description={<span className="font-tau-mono break-all">{modelsDir || "—"}</span>}
        >
          <IconButton
            aria-label={voiceText("ui.openModelFolder")}
            onClick={() => void handleOpenModelsDir()}
          >
            <FolderOpen size={15} strokeWidth={1.75} />
          </IconButton>
          <IconButton
            aria-label={voiceText("ui.refreshModels")}
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
        {visibleModels.length === 0 ? (
          <div className={clsx("text-tau-meta text-ink-2 px-3 py-6 text-center", ROW_DIVIDER)}>
            {modelsLoading ? voiceText("ui.loadingModelList") : voiceText("ui.noModelsAvailable")}
          </div>
        ) : (
          visibleModels.map(model => {
            const isCurrent = model.name === currentModel || model.name === aligner;
            const isDownloading = modelDownload.name === model.name;
            return (
              <DownloadRow
                key={model.name}
                icon={<AudioLines size={15} strokeWidth={1.75} />}
                title={model.label}
                chips={
                  <>
                    {model.recommended && <StatusChip>{voiceText("ui.recommended")}</StatusChip>}
                    {isCurrent && model.downloaded && (
                      <StatusChip tone="accent">{voiceText("ui.inUse")}</StatusChip>
                    )}
                    {model.downloaded && !isCurrent && (
                      <StatusChip tone="ok">{voiceText("ui.downloaded")}</StatusChip>
                    )}
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
                    {!isCurrent && model.name !== qwenAlignerId && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          updateTranscription(
                            selection.engine === "qwen"
                              ? { qwenModel: model.name.endsWith("0.6b") ? "0.6B" : "1.7B" }
                              : { currentModel: model.name }
                          )
                        }
                      >
                        {voiceText("ui.use")}
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
                      {voiceText("ui.delete")}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Download}
                    loading={isDownloading}
                    loadingText={voiceText("ui.downloading")}
                    disabled={modelDownload.name !== null && !isDownloading}
                    onClick={() => void handleDownloadModel(model)}
                  >
                    {voiceText("ui.download")}
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
        title={
          pendingDelete?.kind === "program"
            ? voiceText("ui.deleteTranscriptionProgram")
            : voiceText("ui.deleteTranscriptionModel")
        }
        context={pendingDelete?.label}
        danger
        description={voiceText("ui.downloadItAgainToUseItAfter")}
        confirmText={voiceText("ui.delete")}
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
  progress?: { percent: number; message: string | null };
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
              <span className="truncate">
                {progress.message === null ? voiceText("download.preparing") : progress.message}
              </span>
              <span>{Math.round(progress.percent)}%</span>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-none items-center gap-2">{children}</div>
    </div>
  );
}
