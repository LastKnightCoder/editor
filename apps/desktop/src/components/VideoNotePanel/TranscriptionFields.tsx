import { transcriptionText, useTranscriptionI18n } from "./i18n-transcription";
import { RefreshCw } from "lucide-react";
import type { useQwenHardware } from "./useQwenHardware";
import { Button, IconButton, Select, SettingRow, Switch } from "@tau/ui";
import type { ModelInfo } from "@/commands/model-downloader";
import useSettingStore from "@/stores/useSettingStore";
import { checkLLMOptimizationConfig, openLLMSettingsSection } from "@/utils/transcription";
import {
  selectedModelId,
  qwenAlignerId,
  qwenModelId,
  qwenRuntimeId,
  type LocalTranscriptionSelection,
} from "../../../shared/local-transcription";

interface Props {
  value: LocalTranscriptionSelection;
  models: ModelInfo[];
  onChange: (patch: Partial<LocalTranscriptionSelection>) => void;
  onConfigureLLM?: () => void;
  hardware: ReturnType<typeof useQwenHardware>;
}

export function TranscriptionFields({
  value,
  models,
  onChange,
  onConfigureLLM = openLLMSettingsSection,
  hardware,
}: Props) {
  useTranscriptionI18n();

  const llmReady = useSettingStore(s => checkLLMOptimizationConfig(s.setting).isConfigured);
  const { report } = hardware;
  const qwen = value.engine === "qwen";
  const hasQwen = models.some(m => m.name === qwenAlignerId);
  const choices = models.filter(m =>
    qwen ? m.name.startsWith("qwen3-asr-") : !m.name.startsWith("qwen3-")
  );
  const engines = [{ value: "whisper", label: "Whisper" }];
  if (hasQwen) engines.push({ value: "qwen", label: "Qwen3-ASR" });
  return (
    <>
      <SettingRow title={transcriptionText("ui.transcriptionEngine")}>
        <Select
          aria-label={transcriptionText("ui.transcriptionEngine")}
          value={value.engine}
          placeholder={transcriptionText("ui.thisDeviceDoesNotSupportTheSelected")}
          options={engines}
          onValueChange={id => onChange({ engine: id === "qwen" ? "qwen" : "whisper" })}
        />
      </SettingRow>
      {qwen && models.some(item => item.name === qwenRuntimeId("gpu")) && (
        <SettingRow
          title={transcriptionText("ui.computeDevice")}
          description={
            <div aria-live="polite">
              {report?.names.length ? (
                <div>
                  {report.state === "verified"
                    ? transcriptionText("ui.availableVulkanGPUs")
                    : transcriptionText("ui.systemGPUs")}
                  ：{report.names.join(transcriptionText("format.listSeparator"))}
                </div>
              ) : null}
              {!report
                ? transcriptionText("ui.checkingGPUs")
                : report.state === "verified"
                  ? report.names.length > 1
                    ? transcriptionText("hardware.preferredGpu", { name: report.names[0] })
                    : transcriptionText("ui.gpuRuntimeRecommendedThisGPUPassedThe")
                  : report.state === "candidate"
                    ? transcriptionText("ui.tryTheGPURuntimeVulkanSupportIs")
                    : report.state === "unknown"
                      ? transcriptionText("ui.couldNotFinishGPUDetectionStartWith")
                      : transcriptionText("ui.cpuRuntimeRecommendedNoAvailableVulkanGPU")}
            </div>
          }
        >
          <IconButton
            aria-label={transcriptionText("ui.checkGPUsAgain")}
            disabled={!report}
            onClick={hardware.refresh}
          >
            <RefreshCw size={15} strokeWidth={1.75} />
          </IconButton>
          <Select
            aria-label={transcriptionText("ui.computeDevice")}
            value={value.qwenDevice}
            options={[
              { value: "cpu", label: "CPU" },
              {
                value: "gpu",
                get label() {
                  return transcriptionText("ui.gpuAccelerationVulkan");
                },
              },
            ]}
            onValueChange={id => onChange({ qwenDevice: id === "gpu" ? "gpu" : "cpu" })}
          />
        </SettingRow>
      )}
      <SettingRow title={transcriptionText("ui.recognitionModel")}>
        <Select
          aria-label={transcriptionText("ui.recognitionModel")}
          value={selectedModelId(value, models)}
          options={choices.map(m => ({
            value: m.name,
            label: m.label + (m.downloaded ? "" : transcriptionText("ui.notDownloaded")),
          }))}
          onValueChange={id =>
            onChange(
              qwen
                ? { qwenModel: id === qwenModelId("0.6B") ? "0.6B" : "1.7B" }
                : { currentModel: id }
            )
          }
        />
      </SettingRow>
      <SettingRow title={transcriptionText("ui.output")}>
        <Select
          aria-label={transcriptionText("ui.output")}
          value={value.output}
          options={[
            {
              value: "text",
              get label() {
                return transcriptionText("ui.plainText");
              },
            },
            {
              value: "subtitles",
              get label() {
                return transcriptionText("ui.timedSubtitles");
              },
            },
          ]}
          onValueChange={id => onChange({ output: id === "text" ? "text" : "subtitles" })}
        />
      </SettingRow>
      {value.output === "subtitles" && (
        <>
          <SettingRow
            title={transcriptionText("ui.subtitleSentenceBreaks")}
            description={
              qwen ? transcriptionText("ui.subtitleTimingIsGeneratedByTheQwen") : undefined
            }
          >
            <Select
              aria-label={transcriptionText("ui.subtitleSentenceBreaks")}
              value={value.optimize ? "ai" : "auto"}
              options={[
                {
                  value: "auto",
                  get label() {
                    return transcriptionText("ui.automaticSentenceBreaks");
                  },
                },
                {
                  value: "ai",
                  get label() {
                    return transcriptionText("ui.aiSentenceBreaks");
                  },
                },
              ]}
              onValueChange={id => onChange({ optimize: id === "ai" })}
            />
          </SettingRow>
          {value.optimize && !llmReady && (
            <SettingRow title={transcriptionText("ui.sentenceBreakModel")}>
              <Button size="sm" onClick={onConfigureLLM}>
                {transcriptionText("ui.chooseASentenceBreakModel")}
              </Button>
            </SettingRow>
          )}
          <SettingRow
            title={transcriptionText("ui.keepWordTimestamps")}
            description={transcriptionText("ui.optimizeSentenceBreaksAgainSeparatelyAfterSaving")}
          >
            <Switch
              aria-label={transcriptionText("ui.keepWordTimestamps")}
              checked={value.keepWords}
              onCheckedChange={keepWords => onChange({ keepWords })}
            />
          </SettingRow>
        </>
      )}
    </>
  );
}
