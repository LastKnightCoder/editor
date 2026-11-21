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
      <SettingRow title="转录引擎">
        <Select
          aria-label="转录引擎"
          value={value.engine}
          placeholder="当前设备不支持所选引擎"
          options={engines}
          onValueChange={id => onChange({ engine: id === "qwen" ? "qwen" : "whisper" })}
        />
      </SettingRow>
      {qwen && models.some(item => item.name === qwenRuntimeId("gpu")) && (
        <SettingRow
          title="运行设备"
          description={
            <div aria-live="polite">
              {report?.names.length ? (
                <div>
                  {report.state === "verified" ? "可用 Vulkan 显卡" : "系统显卡"}：
                  {report.names.join("、")}
                </div>
              ) : null}
              {!report
                ? "正在检测显卡…"
                : report.state === "verified"
                  ? report.names.length > 1
                    ? "推荐 GPU 运行包，转录优先使用 " + report.names[0]
                    : "推荐 GPU 运行包，此显卡已通过 Qwen 设备检测。"
                  : report.state === "candidate"
                    ? "建议试用 GPU 运行包，安装后自动验证 Vulkan 支持。"
                    : report.state === "unknown"
                      ? "未能完成显卡检测，建议先用 CPU 运行包。"
                      : "推荐 CPU 运行包，当前未确认有可用的 Vulkan 显卡。"}
            </div>
          }
        >
          <IconButton aria-label="重新检测显卡" disabled={!report} onClick={hardware.refresh}>
            <RefreshCw size={15} strokeWidth={1.75} />
          </IconButton>
          <Select
            aria-label="运行设备"
            value={value.qwenDevice}
            options={[
              { value: "cpu", label: "CPU" },
              { value: "gpu", label: "GPU 加速（Vulkan）" },
            ]}
            onValueChange={id => onChange({ qwenDevice: id === "gpu" ? "gpu" : "cpu" })}
          />
        </SettingRow>
      )}
      <SettingRow title="识别模型">
        <Select
          aria-label="识别模型"
          value={selectedModelId(value, models)}
          options={choices.map(m => ({
            value: m.name,
            label: m.label + (m.downloaded ? "" : " · 未下载"),
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
      <SettingRow title="输出内容">
        <Select
          aria-label="输出内容"
          value={value.output}
          options={[
            { value: "text", label: "纯文字" },
            { value: "subtitles", label: "带时间轴的字幕" },
          ]}
          onValueChange={id => onChange({ output: id === "text" ? "text" : "subtitles" })}
        />
      </SettingRow>
      {value.output === "subtitles" && (
        <>
          <SettingRow
            title="字幕断句"
            description={qwen ? "字幕时间由 Qwen 时间对齐模型生成" : undefined}
          >
            <Select
              aria-label="字幕断句"
              value={value.optimize ? "ai" : "auto"}
              options={[
                { value: "auto", label: "自动断句" },
                { value: "ai", label: "AI 优化断句" },
              ]}
              onValueChange={id => onChange({ optimize: id === "ai" })}
            />
          </SettingRow>
          {value.optimize && !llmReady && (
            <SettingRow title="断句模型">
              <Button size="sm" onClick={onConfigureLLM}>
                选择断句模型
              </Button>
            </SettingRow>
          )}
          <SettingRow title="保留逐词时间" description="保存后可单独重新优化断句">
            <Switch
              aria-label="保留逐词时间"
              checked={value.keepWords}
              onCheckedChange={keepWords => onChange({ keepWords })}
            />
          </SettingRow>
        </>
      )}
    </>
  );
}
