import { useEffect, useState } from "react";
import { Button, Dialog, DialogBody, Select, SettingRow, toast } from "@tau/ui";
import {
  downloadModel,
  getModels,
  onDownloadProgress,
  type ModelInfo,
} from "@/commands/model-downloader";
import useSettingStore from "@/stores/useSettingStore";
import { openLLMSettingsSection, checkLLMOptimizationConfig } from "@/utils/transcription";
import { useQwenHardware } from "./useQwenHardware";
import { TranscriptionFields } from "./TranscriptionFields";
import { TRANSCRIPTION_LANGUAGES } from "./transcription-language";
import {
  requiredModels,
  qwenAlignedLanguages,
  type LocalTranscriptionSelection,
} from "../../../shared/local-transcription";

interface Props {
  initialSelection: LocalTranscriptionSelection;
  language: string;
  onClose: () => void;
  onStart: (language: string, selection: LocalTranscriptionSelection) => void;
}
export function TranscriptionOptionsDialog({
  language,
  initialSelection,
  onClose,
  onStart,
}: Props) {
  const [selection, setSelection] = useState(initialSelection);
  const [lang, setLanguage] = useState(language);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const hardware = useQwenHardware(selection.engine, models);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const llmReady = useSettingStore(s => checkLLMOptimizationConfig(s.setting).isConfigured);
  const source = useSettingStore(s => s.setting.transcription.downloadSource);
  useEffect(() => {
    let active = true;
    getModels()
      .then(result => {
        if (!active) return;
        if (result.success && result.data) setModels(result.data);
        else setError(result.error || "无法获取模型列表");
      })
      .catch(e => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [reload]);
  const required = requiredModels(selection, models);
  const missing = required.filter(id => !models.some(m => m.name === id && m.downloaded));
  const known = required.every(id => models.some(m => m.name === id));
  const alignmentUnsupported =
    selection.engine === "qwen" &&
    selection.output === "subtitles" &&
    lang !== "auto" &&
    !qwenAlignedLanguages.has(lang);
  const canStart =
    !alignmentUnsupported &&
    known &&
    !missing.length &&
    !(selection.output === "subtitles" && selection.optimize && !llmReady);
  async function download() {
    setBusy(true);
    const unsubscribe = onDownloadProgress(event => {
      if (missing.includes(event.modelName))
        setProgress(event.message + " " + event.percentage + "%");
    });
    try {
      for (const id of missing) {
        const result = await downloadModel(id, source);
        if (!result.success) throw new Error(result.error || "模型下载失败");
        setModels(prev => prev.map(m => (m.name === id ? { ...m, downloaded: true } : m)));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      unsubscribe();
      setBusy(false);
      setProgress("");
    }
  }
  return (
    <Dialog
      title="本次转录设置"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={busy || !canStart}
            onClick={() => {
              onClose();
              onStart(lang, selection);
            }}
          >
            开始转录
          </Button>
        </>
      }
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogBody>
        <TranscriptionFields
          value={selection}
          models={models}
          hardware={hardware}
          onConfigureLLM={() => {
            onClose();
            openLLMSettingsSection();
          }}
          onChange={patch => setSelection(prev => ({ ...prev, ...patch }))}
        />
        <SettingRow
          title="识别语言"
          description={alignmentUnsupported ? "此语言可使用纯文字或 Whisper 字幕" : undefined}
        >
          <Select
            aria-label="识别语言"
            value={lang}
            options={TRANSCRIPTION_LANGUAGES}
            onValueChange={setLanguage}
          />
        </SettingRow>
        {error && (
          <SettingRow title={error}>
            <Button
              size="sm"
              onClick={() => {
                setError("");
                setReload(n => n + 1);
              }}
            >
              重试
            </Button>
          </SettingRow>
        )}
        {known && missing.length > 0 && (
          <SettingRow
            title="需要下载"
            description={missing.map(id => models.find(m => m.name === id)?.label).join("、")}
          >
            <Button
              size="sm"
              loading={busy}
              loadingText={progress || "准备中…"}
              onClick={() => void download()}
            >
              下载所需资源
            </Button>
          </SettingRow>
        )}
      </DialogBody>
    </Dialog>
  );
}
